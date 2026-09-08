"""剧本分镜写库服务：将分镜结果落到 Chapter/Shot/ShotDetail。"""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.studio import CameraAngle, CameraMovement, CameraShotType, Chapter, Shot, ShotDetail, VFXType
from app.schemas.skills.script_processing import ScriptDivisionResult, ShotDivision
from app.services.common import entity_not_found, require_entity


def normalize_generated_division_result(
    result: ScriptDivisionResult,
    *,
    script_text: str,
) -> ScriptDivisionResult:
    """校正模型分镜结果，避免“任务成功但零分镜”的假成功。

    模型若明确判断输入只有一个镜头，却遗漏 ``shots`` 数组，可依据冻结的
    章节原文构造一个无损单镜头兜底；其余空结果视为无效输出并让任务失败，
    防止用一个镜头悄悄吞掉本应拆成多镜头的内容。
    """

    shots = list(result.shots)
    if shots:
        return result.model_copy(update={"total_shots": len(shots)})

    source = script_text.strip()
    if not source:
        raise ValueError("Script division returned no shots for an empty script")
    if result.total_shots != 1:
        raise ValueError(
            "Script division returned no shot items "
            f"(reported total_shots={result.total_shots})"
        )

    lines = source.splitlines()
    shot_name = _derive_single_shot_name(lines)
    fallback = ShotDivision(
        index=1,
        start_line=1,
        end_line=max(1, len(lines)),
        script_excerpt=source,
        shot_name=shot_name,
    )
    notes = (result.notes or "").strip()
    fallback_note = "模型判定为单镜头但遗漏 shots，系统已依据章节原文补全。"
    return result.model_copy(
        update={
            "shots": [fallback],
            "total_shots": 1,
            "notes": f"{notes} {fallback_note}".strip(),
        }
    )


def _derive_single_shot_name(lines: list[str]) -> str:
    """从常见中文剧本标记中提取单镜头标题，提取不到时使用稳定默认名。"""

    for raw_line in lines:
        line = raw_line.strip()
        if line.startswith("【镜头】"):
            value = line.removeprefix("【镜头】").strip(" ：:")
            if value:
                return value[:255]
    for raw_line in lines:
        line = raw_line.strip()
        if line.startswith("主题：") or line.startswith("主题:"):
            value = line.split(":" if ":" in line else "：", 1)[-1].strip()
            if value:
                return value[:255]
    return "镜头 1"


def validate_division_result_for_write(result: ScriptDivisionResult) -> None:
    """写库前验证分镜数量，确保 succeeded 必然对应至少一条可落库分镜。"""

    if not result.shots:
        raise ValueError("Script division contains no shots; refusing to mark the task as succeeded")
    if result.total_shots != len(result.shots):
        raise ValueError(
            "Script division total_shots does not match shots length "
            f"({result.total_shots} != {len(result.shots)})"
        )


def _append_division_rows(
    db_add,
    *,
    chapter_id: str,
    result: ScriptDivisionResult,
) -> None:
    validate_division_result_for_write(result)
    for shot_division in result.shots:
        title = (shot_division.shot_name or "").strip() or f"镜头 {shot_division.index}"
        shot_id = str(uuid.uuid4())
        db_add(
            Shot(
                id=shot_id,
                chapter_id=chapter_id,
                index=shot_division.index,
                title=title,
                script_excerpt=shot_division.script_excerpt,
            )
        )
        db_add(
            ShotDetail(
                id=shot_id,
                camera_shot=CameraShotType.ms,
                angle=CameraAngle.eye_level,
                movement=CameraMovement.static,
                follow_atmosphere=True,
                vfx_type=VFXType.none,
                duration=4,
            )
        )


async def write_division_result_to_chapter(
    db: AsyncSession,
    *,
    chapter_id: str,
    result: ScriptDivisionResult,
) -> None:
    """将分镜结果写入指定章节；若章节已有镜头则拒绝写入。"""
    await require_entity(
        db,
        Chapter,
        chapter_id,
        detail=entity_not_found("Chapter"),
        status_code=400,
    )

    existing = await db.execute(select(Shot.id).where(Shot.chapter_id == chapter_id).limit(1))
    if existing.first() is not None:
        raise HTTPException(
            status_code=400,
            detail="Chapter already has shots; refusing to write (write_strategy=fail)",
        )

    _append_division_rows(db.add, chapter_id=chapter_id, result=result)

    # 触发唯一约束与外键检查，确保在返回前失败。
    await db.flush()


def write_division_result_to_chapter_sync(
    db: Session,
    *,
    chapter_id: str,
    result: ScriptDivisionResult,
) -> None:
    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(status_code=400, detail=entity_not_found("Chapter"))

    existing = db.execute(select(Shot.id).where(Shot.chapter_id == chapter_id).limit(1))
    if existing.first() is not None:
        raise HTTPException(
            status_code=400,
            detail="Chapter already has shots; refusing to write (write_strategy=fail)",
        )

    _append_division_rows(db.add, chapter_id=chapter_id, result=result)
    db.flush()
