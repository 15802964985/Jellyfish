"""Versioned official-source evidence and the single distributed synchronization lease."""
from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base
from app.models.base import TimestampMixin


class ModelGovernanceRecord(Base, TimestampMixin):
    """Preserve last usable evidence separately from the latest failed fetch."""
    __tablename__ = "model_governance_records"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
