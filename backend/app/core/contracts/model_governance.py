"""User-configurable bounded synchronization cadence, independent of provider request DTOs."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool


class ModelSyncSettings(BaseModel):
    """Enable expiry-aware checks and set the interval; no paid generation probes are included."""
    model_config = ConfigDict(extra="forbid")
    enabled: bool = True
    interval_hours: int = Field(default=24, ge=1, le=168)


class ModelRuleAction(BaseModel):
    """Change a rule version only after checking the evidence version shown to the user."""
    model_config = ConfigDict(extra="forbid")
    action: Literal["rollback", "resume"]
    expected_sha256: str = Field(min_length=64, max_length=64)
    target_sha256: str | None = Field(default=None, min_length=64, max_length=64)


class GenerationDefaultsUpdate(BaseModel):
    """Save one explicitly selected generation default without replacing unrelated model parameters."""
    model_config = ConfigDict(extra="forbid")
    expected_revision_id: str
    field: str = Field(pattern="^(resolution_profile|resolution)$")
    value: str = Field(min_length=1, max_length=32)
    generate_audio: StrictBool | None = None
