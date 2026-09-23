"""Manual media uses isolated SQL; no live files, providers or business changes."""
import pytest
from fastapi import HTTPException
from sqlalchemy import select, update
from app.models.studio import FileItem, FileType, Shot, ShotFrameImage
from app.schemas.manual_media import ManualMediaTarget, ManualMediaSelection
from app.services.studio.manual_media import read_media_target, adopt_media
from app.services.studio.entity_specs import entity_spec
from tests.test_project_video_export import _build_session, _seed_project

@pytest.mark.asyncio
@pytest.mark.parametrize('kind', ['actor', 'character', 'scene', 'prop', 'costume', 'frame', 'shot'])
async def test_adopt_local_file_cas_and_type(kind):
    """Every target supports blank/existing slots, rejects wrong type and isolates late publishers."""
    db, engine = await _build_session()
    try:
        async with db:
            await _seed_project(db)
            if kind not in ('frame', 'shot'):
                spec=entity_spec(kind)
                values={'id':'asset-local','name':'Local','style':'real_people_city'}
                if kind=='character':values['project_id']='project-1'
                db.add(spec.model(**values))
            db.add(FileItem(id='local-image',type=FileType.image,name='local',thumbnail='',tags=[],storage_key='local.png',width=40,height=30))
            await db.commit()
            target=ManualMediaTarget(target_type=kind,entity_id='shot-1' if kind in ('frame','shot') else 'asset-local',frame_type='first')
            before=await read_media_target(db,target)
            body=ManualMediaSelection(**target.model_dump(),file_id='video-2' if kind=='shot' else 'local-image',expected_version=before.version)
            with pytest.raises(HTTPException) as wrong:
                await adopt_media(db,body.model_copy(update={'file_id':'local-image' if kind=='shot' else 'video-2'}))
            assert wrong.value.status_code==422
            result=await adopt_media(db,body)
            await db.commit()
            assert result.file_id==body.file_id and result.version>before.version
            with pytest.raises(HTTPException) as stale:await adopt_media(db,body)
            assert stale.value.status_code==409
            after=await read_media_target(db,target)
            assert after==result
            if kind=='shot':
                model=Shot;column=Shot.generated_video_version_id;field='generated_video_file_id';identifier='shot-1'
                assert (await db.get(Shot,'shot-1')).status=='pending'
            else:
                model=ShotFrameImage if kind=='frame' else entity_spec(kind).image_model
                column=model.version_id;field='file_id';identifier=result.slot_id
                slot=await db.get(model,identifier)
                assert (slot.width,slot.height)==(40,30)
                with pytest.raises(HTTPException):await read_media_target(db,target.model_copy(update={'entity_id':'shot-2' if kind=='frame' else 'missing','slot_id':identifier}))
            late=await db.execute(update(model).where(model.id==identifier,column==max(1,before.version)).values(**{field:'video-1' if kind=='shot' else None}))
            assert late.rowcount==0
            assert await db.get(FileItem,'video-1') is not None
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_frame_owner_and_existing_empty_slot():
    """The explicit frame ID belongs to one shot; unknown files do not mutate it."""
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            db.add(ShotFrameImage(id=991,shot_detail_id='shot-1',frame_type='key',version_id=7))
            await db.commit()
            target=ManualMediaTarget(target_type='frame',entity_id='shot-1',slot_id=991)
            assert (await read_media_target(db,target)).version==7
            with pytest.raises(HTTPException) as missing:
                await adopt_media(db,ManualMediaSelection(**target.model_dump(),file_id='missing',expected_version=7))
            assert missing.value.status_code==404
            assert (await read_media_target(db,target)).version==7
            with pytest.raises(HTTPException):await read_media_target(db,target.model_copy(update={'entity_id':'shot-2'}))
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_shared_asset_adoption_registers_project_usage():
    """Adopted asset files appear in project files and remain protected by current slot references."""
    from app.models.studio import Prop, ProjectPropLink, FileUsage
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            db.add(Prop(id='local-prop',name='Manual prop',style='real_people_city'))
            db.add(ProjectPropLink(project_id='project-1',prop_id='local-prop'))
            db.add(FileItem(id='local-image',type=FileType.image,name='local',thumbnail='',tags=[],storage_key='local.png'))
            await db.commit()
            await adopt_media(db,ManualMediaSelection(target_type='prop',entity_id='local-prop',file_id='local-image',expected_version=0))
            usage=await db.scalar(select(FileUsage).where(FileUsage.file_id=='local-image'))
            assert usage.project_id=='project-1' and usage.usage_kind=='asset_image'
    finally:await engine.dispose()
