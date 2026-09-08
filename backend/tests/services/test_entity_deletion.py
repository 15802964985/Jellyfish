"""Relationship-aware Studio entity deletion tests."""

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.studio import (
    Actor,
    AssetFileLink,
    Chapter,
    Character,
    FileItem,
    Project,
    ProjectActorLink,
    Shot,
)
from app.services.studio.entity_deletion import get_entity_delete_impact, unlink_and_delete_entity


@pytest.mark.asyncio
async def test_actor_delete_reports_then_unlinks_concrete_relationships() -> None:
    """Linked actors cannot be blindly deleted; confirmed deletion detaches relations first."""

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as db:
        db.add(Project(id="p-delete", name="测试项目", description="", style="drama", visual_style="live_action"))
        db.add(Chapter(id="c-delete", project_id="p-delete", index=1, title="第一章", summary="", raw_text=""))
        db.add(Shot(id="s-delete", chapter_id="c-delete", index=1, title="入场", script_excerpt=""))
        db.add(Actor(id="a-delete", name="演员甲", description="", style="drama", visual_style="live_action"))
        db.add(FileItem(id="f-delete", type="image", name="参考正面", storage_key="actor/front.png"))
        await db.flush()
        db.add(Character(id="ch-delete", project_id="p-delete", name="角色甲", description="", style="drama", visual_style="live_action", actor_id="a-delete"))
        db.add(ProjectActorLink(project_id="p-delete", chapter_id="c-delete", shot_id="s-delete", actor_id="a-delete"))
        db.add(AssetFileLink(entity_type="actor", entity_id="a-delete", file_id="f-delete", resource_role="front"))
        await db.commit()

        impact = await get_entity_delete_impact(db, entity_type="actor", entity_id="a-delete")
        assert impact.has_relations is True
        assert any("测试项目" in item and "第一章" in item and "入场" in item for group in impact.groups for item in group.items)
        assert any("角色甲" in item for group in impact.groups for item in group.items)
        assert any("参考正面" in item for group in impact.groups for item in group.items)

        with pytest.raises(HTTPException, match="仍有关联"):
            await unlink_and_delete_entity(
                db,
                entity_type="actor",
                entity_id="a-delete",
                unlink_relations=False,
            )

        await unlink_and_delete_entity(
            db,
            entity_type="actor",
            entity_id="a-delete",
            unlink_relations=True,
        )
        await db.commit()
        assert await db.get(Actor, "a-delete") is None
        assert (await db.get(Character, "ch-delete")).actor_id is None
        assert (await db.execute(select(ProjectActorLink))).scalars().all() == []
        assert (await db.execute(select(AssetFileLink))).scalars().all() == []
        assert await db.get(FileItem, "f-delete") is not None

    await engine.dispose()
