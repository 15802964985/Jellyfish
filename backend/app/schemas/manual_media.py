"""Explicit local media selection; independent of model generation contracts."""
from typing import Literal
from pydantic import BaseModel, Field

MediaTargetType = Literal['actor', 'character', 'scene', 'prop', 'costume', 'frame', 'shot']

class ManualMediaTarget(BaseModel):
    """Identify one existing image slot, default front slot, frame type or shot video."""
    target_type: MediaTargetType
    entity_id: str = Field(min_length=1)
    slot_id: int | None = Field(default=None, ge=1)
    frame_type: Literal['first', 'key', 'last'] = 'key'

class ManualMediaSelection(ManualMediaTarget):
    """Freeze the viewed target version so selecting media cannot overwrite newer work."""
    file_id: str = Field(min_length=1)
    expected_version: int = Field(ge=0)

class ManualMediaState(BaseModel):
    """Current selected file and concurrency version; zero means no image slot yet."""
    file_id: str | None
    version: int
    slot_id: int | None = None
