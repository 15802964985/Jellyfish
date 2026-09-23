"""Private media execution checkpoints, separate from public task payload and diagnostics."""
from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base
from app.models.base import TimestampMixin

class GenerationRecovery(Base, TimestampMixin):
    """Keep resumable receipts and leases without exposing signed media links in task APIs."""
    __tablename__ = "generation_recovery"
    task_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
