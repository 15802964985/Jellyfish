"""镜头的人物多角度目录：分镜参考、主体分组和审片共用同一真实来源。"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.studio import Shot, Character, Actor, CharacterImage, ActorImage, ShotCharacterLink, FileItem
from app.schemas.studio.timeline import CharacterAngleGroup, CharacterAngleView

ANGLE_LABELS = {'FRONT': '正面', 'LEFT': '左侧', 'RIGHT': '右侧', 'BACK': '背面', 'THREE_QUARTER': '3/4侧面', 'TOP': '俯视', 'DETAIL': '细节'}


async def character_angle_groups(db: AsyncSession, shot_id: str) -> list[CharacterAngleGroup]:
    """仅返回本镜头关联角色及其演员的已采用槽位图片；保留角度和来源，不自动全选。"""
    if await db.get(Shot, shot_id) is None:
        raise LookupError('镜头不存在')
    characters = (await db.execute(select(Character, Actor.name).join(ShotCharacterLink, ShotCharacterLink.character_id == Character.id)
        .outerjoin(Actor, Actor.id == Character.actor_id).where(ShotCharacterLink.shot_id == shot_id)
        .order_by(ShotCharacterLink.index, Character.id))).all()
    character_ids = [c.id for c, _ in characters]
    actor_ids = [c.actor_id for c, _ in characters if c.actor_id]
    by_source = {}
    for model, field, ids, kind in [(CharacterImage, CharacterImage.character_id, character_ids, 'character'),
                                    (ActorImage, ActorImage.actor_id, actor_ids, 'actor')]:
        rows = (await db.execute(select(model).join(FileItem, FileItem.id == model.file_id)
            .where(field.in_(ids), FileItem.type == 'image', FileItem.storage_key.is_not(None), FileItem.storage_key != '')
            .order_by(model.id))).scalars().all() if ids else []
        for row in rows:
            angle = getattr(row.view_angle, 'value', row.view_angle) or 'FRONT'
            source_id = getattr(row, field.key)
            by_source.setdefault((kind, source_id), []).append(CharacterAngleView(file_id=row.file_id, image_id=row.id,
                source_type=kind, source_id=source_id, view_angle=angle,
                label=f"{'角色定妆' if kind == 'character' else '演员基准'} · {ANGLE_LABELS.get(angle, angle)}"))
    from app.services.studio.character_appearances import selected_appearances
    chosen = await selected_appearances(db, shot_id)
    groups=[]
    for c, actor in characters:
        appearance=chosen.get(c.id)
        views=by_source.get(('character',c.id),[])
        if appearance:
            views=[CharacterAngleView(file_id=v['file_id'],image_id=-(index+1),source_type='character',source_id=c.id,
                    view_angle=v['view_angle'],label=f"造型 {appearance.name} v{appearance.version} · {ANGLE_LABELS.get(v['view_angle'],v['view_angle'])}")
                   for index,v in enumerate(appearance.data.get('views',[]))]
        groups.append(CharacterAngleGroup(character_id=c.id,name=c.name,actor_name=actor,
            appearance_id=appearance.id if appearance else None,appearance_name=appearance.name if appearance else None,
            views=views+by_source.get(('actor',c.actor_id),[])))
    return groups
