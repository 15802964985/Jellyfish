"""Independent asset tables may reuse slot IDs; always match the parent too."""
from types import SimpleNamespace

import pytest

from app.core.contracts.generation import GenerationTarget, GenerationTargetKind
from app.models.studio_asset_images import ActorImage, CharacterImage, SceneImage, PropImage, CostumeImage
from app.services.generation.gate import GenerationEntityGate
from app.services.generation.publishers.asset_image import AssetImagePublisher

SLOTS = [(ActorImage, 'actor_id'), (CharacterImage, 'character_id'), (SceneImage, 'scene_id'),
         (PropImage, 'prop_id'), (CostumeImage, 'costume_id')]


class CollidingSlots:
    """Every table has slot 1, owned by a different asset and version."""
    async def get(self, model, slot_id):
        for index, (candidate, parent) in enumerate(SLOTS):
            if model is candidate:
                return SimpleNamespace(**{parent: f'asset-{index}', 'version_id': index + 10})
        return None


@pytest.mark.asyncio
@pytest.mark.parametrize('index', range(5))
async def test_gate_matches_parent_and_reads_its_version(index):
    """Earlier tables must not hide later matching scene/prop/costume slots."""
    db = CollidingSlots()
    gate = GenerationEntityGate()
    target = GenerationTarget(kind=GenerationTargetKind.asset_image_slot, entity_id=f'asset-{index}', slot_id='1')
    assert await gate._asset_slot_belongs_to(db, slot_id='1', entity_id=target.entity_id)
    assert await gate._target_version(db, SimpleNamespace(target=target)) == index + 10
    assert not await gate._asset_slot_belongs_to(db, slot_id='1', entity_id='missing')


@pytest.mark.asyncio
async def test_publisher_constrains_every_candidate_by_parent():
    """A CAS miss must never overwrite another asset's same-numbered slot."""
    statements = []
    class DB:
        async def execute(self, statement):
            statements.append(statement)
            return SimpleNamespace(rowcount=0)
    snapshot = SimpleNamespace(canonical_target=GenerationTarget(
        kind=GenerationTargetKind.asset_image_slot, entity_id='target-asset', slot_id='1'))
    assert not await AssetImagePublisher()._publish_file(DB(), snapshot=snapshot, file_id='image', expected_version_id=1)
    assert len(statements) == 5
    for statement, (_, parent) in zip(statements, SLOTS):
        assert parent in str(statement)
        assert 'target-asset' in statement.compile().params.values()
