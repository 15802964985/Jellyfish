"""Durable provider call attempts, separate from mutable task progress and results."""
from sqlalchemy import JSON, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base
from app.models.base import TimestampMixin


class GenerationCall(Base, TimestampMixin):
    """Capture a request before sending; retain incomplete attempts after process failure."""
    __tablename__ = "generation_calls"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), index=True)
    method: Mapped[str] = mapped_column(String(12))
    endpoint: Mapped[str] = mapped_column(String(2048))
    request: Mapped[dict] = mapped_column(JSON, default=dict)
    response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    state: Mapped[str] = mapped_column(String(32), default="sending")
