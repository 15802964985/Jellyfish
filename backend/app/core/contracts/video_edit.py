"""Shared editable-video controls; separate provider capability from configured availability."""
from pydantic import BaseModel, ConfigDict, Field

class VideoEditOptions(BaseModel):
    """Only supported editing controls may reach the provider; None selects saved defaults."""
    model_config = ConfigDict(extra="forbid")
    resolution: str | None = None
    seconds: int | None = Field(default=None, ge=1, le=30)

class VideoEditModelRead(BaseModel):
    """One configured model with an explicit exclusion reason and its executable controls."""
    model_id: str
    revision_id: str | None = None
    provider: str
    provider_name: str
    model_name: str
    available: bool
    reason: str = ""
    resolutions: list[str] = Field(default_factory=list)
    default_resolution: str | None = None
    durations: list[int] = Field(default_factory=list)
    default_seconds: int | None = None
    max_images: int = 0
    timed_images: bool = False
    source_label: str = "@Video1"
    image_label: str = "@Image{n}"
    instructions: str = ""
    source_url: str = ""

class VideoEditCatalogRead(BaseModel):
    """Configured rows and importable protocol candidates, without secrets."""
    models: list[VideoEditModelRead]
    candidates: list[dict[str, str]]

class VideoEditPreviewRead(BaseModel):
    """Free local preflight, chosen controls and conservative cost share the submit contract."""
    revision_id: str
    seconds: float
    width: int
    height: int
    has_audio: bool
    options: VideoEditOptions
    estimate: dict
    warnings: list[str] = Field(default_factory=list)
