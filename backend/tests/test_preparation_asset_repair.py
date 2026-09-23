"""Real SQLite checks for live candidate photos, explicit aliases and missing extraction."""
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models import Base
from app.models.studio import Project, Chapter, Shot, Scene, Character, SceneImage, CharacterImage, FileItem, ShotDetail, ShotExtractedCandidate
from app.services.studio.entity_existence import check_names_existence
from app.services.studio.shot_preparation_state import link_existing_asset_for_preparation
from app.services.studio.entity_crud import create_entity

@pytest.mark.asyncio
async def test_existing_photos_alias_confirmation_and_create_without_extraction():
    """Photos must appear before association; a chosen alias must clear only its own candidate."""
    engine=create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine,expire_on_commit=False)() as db:
        db.add(Project(id="p",name="project",style="真人都市"))
        await db.flush()
        db.add(Chapter(id="c",project_id="p",index=1,title="chapter"))
        await db.flush()
        db.add(Shot(id="s",chapter_id="c",index=1,title="shot"))
        db.add_all([Scene(id="scene",name="小区林荫道",style="真人都市"),
            Character(id="mother",project_id="p",name="妈妈",style="真人都市"),
            Character(id="other",project_id="p",name="妈妈朋友",style="真人都市"),
            FileItem(id="photo",name="photo",type="image",storage_key="photo")])
        await db.flush()
        db.add_all([SceneImage(scene_id="scene",file_id="photo"),CharacterImage(character_id="mother",file_id="photo")])
        db.add(ShotDetail(id="s",camera_shot="MS",angle="EYE_LEVEL",movement="STATIC"))
        candidate=ShotExtractedCandidate(shot_id="s",candidate_type="scene",candidate_name="清晨小路",candidate_status="pending",payload={})
        db.add(candidate);await db.flush()
        found=await check_names_existence(db,project_id="p",shot_id="s",character_names=["妈妈"],scene_names=["清晨小区林荫道"],prop_names=[],costume_names=[])
        assert found["characters"][0]["asset_id"]=="mother"
        assert found["characters"][0]["file_id"]=="photo"
        assert found["scenes"][0]["thumbnail"].endswith("/photo/download")
        assert not found["scenes"][0]["linked_to_shot"]
        result=await link_existing_asset_for_preparation(db,project_id="p",chapter_id="c",shot_id="s",
            entity_type="scene",linked_entity_id="scene",candidate_id=candidate.id)
        assert result.assets_overview.summary.pending_count==0
        assert len(result.assets_overview.items)==1
        assert result.assets_overview.items[0].file_id=="photo"
        created=await create_entity(db,entity_type="scene",body={"id":"new","name":"未提取场景","style":"真人都市","visual_style":"现实"})
        result=await link_existing_asset_for_preparation(db,project_id="p",chapter_id="c",shot_id="s",entity_type="scene",linked_entity_id=created["id"])
        assert result.assets_overview.summary.linked_count==2
        with pytest.raises(HTTPException):
            await link_existing_asset_for_preparation(db,project_id="wrong",chapter_id="c",shot_id="s",entity_type="scene",linked_entity_id="scene")
    await engine.dispose()
