"""同角色造型快照、镜头选用与生成事实。"""
from uuid import uuid4
from sqlalchemy import select, func
from fastapi import HTTPException
from app.models.studio import Character, CharacterImage, Costume, FileItem, Shot, ShotCharacterLink
from app.models.character_appearances import CharacterAppearance, ShotCharacterAppearance
from app.core.contracts.character_appearances import AppearanceRead
from app.services.studio.creative_direction import read_direction

async def list_appearances(db, character_id):
    """按创建版本列出同一角色全部造型，不混入其他角色。"""
    if await db.get(Character,character_id) is None: raise HTTPException(404,'角色不存在')
    rows=(await db.execute(select(CharacterAppearance).where(CharacterAppearance.character_id==character_id).order_by(CharacterAppearance.version.desc()))).scalars()
    return [AppearanceRead(id=r.id,character_id=r.character_id,version=r.version,name=r.name,data=r.data) for r in rows]

async def create_appearance(db, character_id, body):
    """锁角色分配版本；校验图片，冻结造型设定及服装事实，不修改身份。"""
    character=(await db.execute(select(Character).where(Character.id==character_id).with_for_update())).scalar_one_or_none()
    if not character: raise HTTPException(404,'角色不存在')
    costume=await db.get(Costume,body.costume_id) if body.costume_id else None
    if body.costume_id and not costume: raise HTTPException(422,'服装不存在')
    if body.views is None:
        images=(await db.execute(select(CharacterImage).where(CharacterImage.character_id==character_id,CharacterImage.file_id.is_not(None)).order_by(CharacterImage.id))).scalars()
        views=[{'file_id':r.file_id,'view_angle':str(getattr(r.view_angle,'value',r.view_angle))} for r in images]
    else: views=[v.model_dump() for v in body.views]
    if len(views)>8 or len({v['view_angle'] for v in views})!=len(views): raise HTTPException(422,'每个角度只保留一张图，最多8张')
    for view in views:
        file=await db.get(FileItem,view['file_id'])
        if not file or file.type!='image' or not file.storage_key: raise HTTPException(422,'造型参考必须是有效图片')
    creative=await read_direction(db,'character',character_id)
    fields={**creative.effective,**body.creative_direction.model_dump(exclude_unset=True)}
    from app.core.contracts.creative_direction import CreativeFields
    CreativeFields.model_validate(fields)
    for fid in fields.get('reference_file_ids') or []:
        file=await db.get(FileItem,fid)
        if not file or file.type!='image' or not file.storage_key: raise HTTPException(422,'造型创作依据必须引用有效图片')
    version=int(await db.scalar(select(func.max(CharacterAppearance.version)).where(CharacterAppearance.character_id==character_id)) or 0)+1
    data={'description':body.description,'costume_id':body.costume_id,'costume_name':costume.name if costume else None,
          'costume_description':costume.description if costume else '', 'creative_direction':fields,'views':views}
    row=CharacterAppearance(id=uuid4().hex,character_id=character_id,version=version,name=body.name.strip(),data=data)
    if not row.name: raise HTTPException(422,'造型名称不能为空')
    db.add(row);await db.flush()
    return AppearanceRead(id=row.id,character_id=character_id,version=version,name=row.name,data=data)

async def select_appearance(db, shot_id, character_id, body):
    """仅允许本镜头已关联角色的造型，不能跨角色或项目借用版本。"""
    await db.execute(select(Shot).where(Shot.id==shot_id).with_for_update())
    linked=await db.scalar(select(ShotCharacterLink.id).where(ShotCharacterLink.shot_id==shot_id,ShotCharacterLink.character_id==character_id))
    if linked is None: raise HTTPException(422,'请先在本镜头关联该角色')
    row=await db.get(ShotCharacterAppearance,(shot_id,character_id))
    if (row.appearance_id if row else None)!=body.expected_appearance_id: raise HTTPException(409,'造型选择已变化，请刷新后重试')
    if body.appearance_id:
        version=await db.get(CharacterAppearance,body.appearance_id)
        if not version or version.character_id!=character_id: raise HTTPException(422,'造型不属于本角色')
        if row: row.appearance_id=version.id
        else: db.add(ShotCharacterAppearance(shot_id=shot_id,character_id=character_id,appearance_id=version.id))
    elif row: await db.delete(row)
    await db.flush()
    return {'appearance_id':body.appearance_id}

async def selected_appearances(db, shot_id):
    """返回已关联角色的选用版本；移除阵容后不再使用旧选择。"""
    rows=(await db.execute(select(CharacterAppearance).join(ShotCharacterAppearance,ShotCharacterAppearance.appearance_id==CharacterAppearance.id)
        .join(ShotCharacterLink,(ShotCharacterLink.shot_id==ShotCharacterAppearance.shot_id)&(ShotCharacterLink.character_id==ShotCharacterAppearance.character_id))
        .where(ShotCharacterAppearance.shot_id==shot_id))).scalars()
    return {r.character_id:r for r in rows}

async def appearance_context(db, shot_id):
    """逐角色冻结本镜头选用造型，供提示词、预检和成片审查共用。"""
    result={key:{'id':row.id,'version':row.version,'name':row.name,**row.data} for key,row in (await selected_appearances(db,shot_id)).items()}
    for look in result.values():
        ids={v['file_id'] for v in look.get('views',[])} | set(look.get('creative_direction',{}).get('reference_file_ids') or [])
        files=(await db.execute(select(FileItem).where(FileItem.id.in_(ids)))).scalars() if ids else []
        look['media_versions']={f.id:[f.storage_key,f.checksum,f.content_version] for f in files}
    return result
