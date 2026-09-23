"""Read bounded, local source evidence without a model call or whole-chapter prompt injection."""
from hashlib import sha256
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.contracts.generation_quality import QualitySourceSnapshot, QualitySourceBundle
from app.models.studio import Shot, ShotDetail, Project, Chapter, Character, Scene, Prop, Costume, Actor
from app.models.studio_script_imports import ScriptImport


ASSET_MODELS = {'character': Character, 'scene': Scene, 'prop': Prop, 'costume': Costume}


def quality_source_fingerprint(bundle: QualitySourceBundle) -> str:
    """Ignore prompt inclusion flags and query order; bind actual source identities and content."""
    sources = sorted((s.kind, s.entity_id, s.field, s.content_sha256) for s in bundle.sources)
    return sha256(json.dumps({'version': bundle.version, 'sources': sources}, ensure_ascii=False,
        sort_keys=True).encode('utf-8')).hexdigest()


async def read_linked_asset_descriptions(db: AsyncSession, linked, shot_id: str | None = None) -> dict[tuple[str, str], str]:
    """Fetch authoritative descriptions by typed ID, at most one query per asset category."""
    result = {}
    for kind, model in ASSET_MODELS.items():
        ids = {item.id for item in linked if item.type == kind}
        if not ids:
            continue
        rows = (await db.execute(select(model.id, model.description).where(model.id.in_(ids)))).all()
        result.update({(kind, row.id): row.description or '' for row in rows})
    if shot_id:
        from app.services.studio.character_appearances import appearance_context
        for character_id, look in (await appearance_context(db, shot_id)).items():
            key = ('character', character_id)
            if key in result:
                result[key] += '\n本镜头服装与造型以所选版本为准：' + json.dumps(look, ensure_ascii=False)
    return result


def source_snapshot(kind: str, entity_id: str, field: str, text: str,
                    prompt: str, *, include_text: bool = True) -> QualitySourceSnapshot:
    """Freeze exact content hash and literal inclusion, without claiming semantic equivalence."""
    return QualitySourceSnapshot(kind=kind, entity_id=entity_id, field=field,
        text=text if include_text else None,
        content_sha256=sha256(text.encode('utf-8')).hexdigest(),
        literal_in_prompt=bool(text and text in prompt) if include_text else None)


async def collect_quality_sources(db: AsyncSession, *, shot_id: str,
                                  prompt: str | None) -> QualitySourceBundle:
    """Record current local inputs; absence of an exact chapter match is not a story conflict."""
    # Studio's public facade imports the generation gate; defer orchestration dependency.
    from app.services.studio.shot_assets import list_shot_linked_assets

    bundle = QualitySourceBundle()
    shot = await db.get(Shot, shot_id)
    if shot is None:
        bundle.warnings.append('镜头来源不存在，无法追溯。')
        return bundle
    from app.services.studio.creative_direction import read_direction, direction_prompt
    direction = await read_direction(db, 'shot', shot_id)
    bundle.warnings.extend(direction.warnings)
    bundle.sources.append(source_snapshot('project', direction.project_id or shot_id, 'creative_direction',
        direction_prompt(direction, 'review') + '\n版本:' + direction.fingerprint, prompt or ''))
    for fid in direction.effective.get('reference_file_ids') or []:
        from app.models.studio import FileItem
        ref = await db.get(FileItem, fid)
        bundle.sources.append(source_snapshot('project', direction.project_id or shot_id, 'creative_reference:'+fid,
            json.dumps({'id':fid,'updated_at':str(getattr(ref,'updated_at','')),'content_version':getattr(ref,'content_version',None),'checksum':getattr(ref,'checksum',None),'exists':ref is not None},sort_keys=True), prompt or ''))
    text = prompt or ''
    excerpt = shot.script_excerpt or ''
    bundle.sources.append(source_snapshot('shot', shot.id, 'script_excerpt', excerpt, text))
    detail = await db.get(ShotDetail, shot_id)
    if detail is not None:
        for field in ('description', 'duration', 'camera_shot', 'angle', 'movement'):
            value = getattr(detail, field, None)
            if value is not None:
                bundle.sources.append(source_snapshot('shot_detail', shot_id, field, str(value), text))
    # Only immediate neighbours: their state is continuity context, not this shot's action.
    for neighbour_direction, condition, ordering in (
        ('previous', Shot.index < shot.index, Shot.index.desc()),
        ('next', Shot.index > shot.index, Shot.index.asc()),
    ):
        neighbour = (await db.execute(select(Shot).where(Shot.chapter_id == shot.chapter_id, condition)
            .order_by(ordering).limit(1))).scalar_one_or_none()
        if neighbour:
            bundle.sources.append(source_snapshot('neighbour', neighbour.id, neighbour_direction, neighbour.script_excerpt or '', text))
    chapter = await db.get(Chapter, shot.chapter_id)
    if chapter is not None:
        project = await db.get(Project, chapter.project_id)
        if project:
            for field in ('description', 'default_video_ratio'):
                value = getattr(project, field, None)
                if value is not None:
                    bundle.sources.append(source_snapshot('project', project.id, field, str(value), text))
        imports = (await db.execute(select(ScriptImport.id, ScriptImport.file_id, ScriptImport.content_hash,
            ScriptImport.commit_result).where(ScriptImport.project_id == chapter.project_id))).all()
        for item in imports:
            if chapter.id in (item.commit_result or {}).get('chapter_ids', []):
                bundle.sources.append(QualitySourceSnapshot(kind='script_file', entity_id=item.file_id,
                    field=f'import:{item.id}', content_sha256=item.content_hash))
        for field in ('raw_text', 'condensed_text'):
            content = getattr(chapter, field) or ''
            if not content:
                continue
            # Keep full chapter local: only its digest and exact excerpt offsets are frozen.
            record = source_snapshot('chapter', chapter.id, field, content, text, include_text=False)
            offset = content.find(excerpt) if excerpt else -1
            if offset >= 0:
                record.excerpt_start = offset
                record.excerpt_end = offset + len(excerpt)
            bundle.sources.append(record)
    if not any(s.kind == 'chapter' and s.excerpt_start is not None for s in bundle.sources):
        bundle.warnings.append('镜头摘录未在章节原文或精简文本中精确定位；可能已改写，不等于剧情冲突，需人工或后续语义核对。')
    linked = await list_shot_linked_assets(db, shot_id=shot_id)
    descriptions = await read_linked_asset_descriptions(db, linked, shot_id=shot_id)
    for asset in linked:
        if asset.type not in ASSET_MODELS: continue
        asset_direction = await read_direction(db, asset.type, asset.id)
        if asset.type=='character' and asset.id in direction.appearances:
            # Review the selected immutable look, not today's unrelated default costume/style.
            look=direction.appearances[asset.id]
            asset_direction=asset_direction.model_copy(update={'effective':look['creative_direction'],
                'fingerprint':sha256(json.dumps(look,sort_keys=True,ensure_ascii=False).encode()).hexdigest()})
        bundle.sources.append(source_snapshot(asset.type, asset.id, 'creative_direction',
            direction_prompt(asset_direction, 'asset')+'\n版本:'+asset_direction.fingerprint, prompt or ''))
        for key in ('presentation','treatment','era'):
            left,right=direction.effective.get(key),asset_direction.effective.get(key)
            if left and right and left!=right:
                bundle.warnings.append(f'资产 {asset.name} 的{key}（{right}）与镜头设定（{left}）不同，请核对是否为剧情特例；不会自动改图。')

    character_ids = [asset.id for asset in linked if asset.type == 'character']
    if character_ids:
        actors = (await db.execute(select(Actor.id, Actor.description).join(Character, Character.actor_id == Actor.id)
            .where(Character.id.in_(character_ids)).distinct())).all()
        for actor in actors:
            bundle.sources.append(source_snapshot('actor', actor.id, 'description', actor.description or '', text))
    seen = set()
    for asset in linked:
        key = (asset.type, asset.id)
        if key in seen:
            continue
        seen.add(key)
        if key not in descriptions:
            bundle.warnings.append(f'关联资产 {asset.type}/{asset.id} 已不可读取。')
            continue
        bundle.sources.append(source_snapshot(asset.type, asset.id, 'description', descriptions[key], text))
    return bundle
