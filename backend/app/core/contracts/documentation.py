"""Official-document evidence is distinct from compatibility certification."""
from typing import Literal
from pydantic import BaseModel


class DocumentationEvidence(BaseModel):
    """Bounded, inert text extracted from a curated official source."""
    source_url: str | None = None
    fetched_at: str
    status: Literal["fetched", "unavailable", "unreadable", "not_registered"]
    content_sha256: str | None = None
    text: str = ""
    message: str
