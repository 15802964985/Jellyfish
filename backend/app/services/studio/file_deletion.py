"""文件删除前的统一关联盘点；兼容外键关系和历史 JSON/逻辑引用。"""

from __future__ import annotations

from urllib.parse import unquote, urlsplit

from fastapi import HTTPException
from sqlalchemy import JSON, String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Base, FileItem  # 导入完整模型注册表，避免漏掉新注册的文件外键。
from app.schemas.studio.files import FileDeleteImpactRead, FileReferenceGroup

LABELS = {
    "character_appearances": "角色造型版本图片与参考依据",
    "creative_directions": "创作设定参考依据", "creative_direction_revisions": "创作设定历史参考依据",
    "asset_file_links": "资产参考素材", "audio_assets": "音频资产",
    "script_imports": "剧本导入原文", "shots": "分镜视频",
    "shot_frame_images": "分镜帧图片", "actor_images": "演员图片",
    "character_images": "角色图片", "scene_images": "场景图片",
    "prop_images": "道具图片", "costume_images": "服装图片",
    "file_usages": "项目文件使用记录", "generation_artifacts": "生成产物",
    "generation_task_media_references": "任务冻结参考素材",
    "generation_task_links": "任务产物关联", "generation_tasks": "任务输入或结果",
    "experiment_messages": "实验室消息", "timeline_clips": "剪辑时间线", "project_edits": "项目剪辑工程",
}
CONTEXT = {
    "scope": "设定对象类型", "revision": "设定版本",
    "project_id": "项目", "chapter_id": "章节", "shot_id": "分镜", "task_id": "任务",
    "actor_id": "演员", "character_id": "角色", "scene_id": "场景",
    "prop_id": "道具", "costume_id": "服装", "entity_type": "资产类型",
    "entity_id": "资产", "session_id": "实验室会话", "usage_kind": "用途",
}
SKIP_JSON = {"files", "providers", "models", "model_config_revisions", "model_settings", "prompt_templates"}


def contains_file_reference(value: object, file_id: str) -> bool:
    """逐值识别文件 ID 或本系统文件 URL；不用模糊子串把相似文件误当同一个文件。"""
    if isinstance(value, dict):
        return any(contains_file_reference(item, file_id) for item in value.values())
    if isinstance(value, list):
        return any(contains_file_reference(item, file_id) for item in value)
    if not isinstance(value, str):
        return False
    if value == file_id:
        return True
    if "/files/" not in value:
        return False
    try:
        path = unquote(urlsplit(value).path)
    except ValueError:
        return False
    return path.endswith((f"/files/{file_id}/download", f"/files/{file_id}/preview"))


async def describe_reference(db: AsyncSession, row: dict) -> str:
    """解析关联实体的名称和ID，仅展示安全定位信息，不返回任务或配置原文。"""
    title = next((str(row[key]) for key in ("name", "title", "label") if row.get(key)), "")
    parts = [title or f"记录 {row.get('id', '')}"]
    targets = {
        "project_id": "projects", "chapter_id": "chapters", "shot_id": "shots",
        "actor_id": "actors", "character_id": "characters", "scene_id": "scenes",
        "prop_id": "props", "costume_id": "costumes",
    }
    entity_tables = {"actor": "actors", "character": "characters", "scene": "scenes",
                     "prop": "props", "costume": "costumes"}
    targets["entity_id"] = entity_tables.get(str(row.get("entity_type")), "")
    for key, label in CONTEXT.items():
        if not row.get(key):
            continue
        value = str(row[key])
        table = Base.metadata.tables.get(targets.get(key, ""))
        if table is not None:
            name_column = next((table.c[name] for name in ("name", "title") if name in table.c), None)
            if name_column is not None:
                name = await db.scalar(select(name_column).where(table.c.id == value))
                if name:
                    value = f"{name}（{value}）"
        parts.append(f"{label}：{value}")
    return " · ".join(parts)


async def get_file_delete_impact(db: AsyncSession, *, file_id: str) -> FileDeleteImpactRead:
    """盘点所有注册文件外键及历史逻辑/JSON引用；用于详情展示和删除时重新校验。

    每组只返回前20条定位信息，count保留真实计数；查询异常向上传播，禁止失败时放行。
    JSON先用转义后的ID筛选候选，再逐值核对，兼容MySQL与SQLite。
    """
    file = await db.get(FileItem, file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="文件不存在")
    groups: list[FileReferenceGroup] = []

    for table in sorted(Base.metadata.tables.values(), key=lambda item: item.name):
        columns = [column for column in table.columns if column.name in {"id", "name", "title", "label", *CONTEXT}]
        if not columns:
            continue
        # 动态枚举 files.id 外键，CASCADE/SET NULL 也视为使用，不能先删对象再靠外键兜底。
        for column in table.columns:
            is_file_fk = any(fk.target_fullname == "files.id" for fk in column.foreign_keys)
            is_timeline_source = table.name == "timeline_clips" and column.name == "source_id"
            if not is_file_fk and not is_timeline_source:
                continue
            predicate = column == file_id
            count = int(await db.scalar(select(func.count()).select_from(table).where(predicate)) or 0)
            if count:
                rows = (await db.execute(select(*columns).where(predicate).limit(20))).mappings().all()
                groups.append(FileReferenceGroup(
                    kind=f"{table.name}.{column.name}", label=LABELS.get(table.name, "其他业务关联"),
                    count=count, items=[await describe_reference(db, dict(row)) for row in rows],
                ))
        if table.name in SKIP_JSON:
            continue
        # 旧任务、编辑源片/原始结果、实验室历史等可能只有JSON关系，同样必须保护。
        for column in table.columns:
            if not isinstance(column.type, JSON):
                continue
            rows = (await db.execute(
                select(*columns, column).where(cast(column, String).contains(file_id, autoescape=True))
            )).mappings()
            count = 0
            items: list[str] = []
            for row in rows:
                if contains_file_reference(row[column.name], file_id):
                    count += 1
                    if len(items) < 20:
                        items.append(await describe_reference(db, dict(row)))
            if count:
                groups.append(FileReferenceGroup(
                    kind=f"{table.name}.{column.name}", label=LABELS.get(table.name, "业务历史记录"),
                    count=count, items=items,
                ))
    # 防止历史数据存在多个文件记录指向同一物理对象时误删共享对象。
    siblings = (await db.execute(select(FileItem.id, FileItem.name).where(
        FileItem.storage_key == file.storage_key, FileItem.id != file_id
    ))).mappings().all()
    if siblings:
        groups.append(FileReferenceGroup(kind="shared_storage", label="共用存储对象的文件", count=len(siblings),
                                         items=[await describe_reference(db, dict(row)) for row in siblings[:20]]))
    return FileDeleteImpactRead(file_id=file_id, can_delete=not groups,
                                reference_count=sum(group.count for group in groups), groups=groups)
