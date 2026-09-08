"""Persistent import batches for reviewable script ingestion."""

from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin


class ScriptImport(Base, TimestampMixin):
    __tablename__ = "script_imports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, comment="导入批次 ID")
    project_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("files.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="parsed", index=True)
    is_saved: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
        comment="用户是否明确点击保存草稿；临时预览不进入草稿历史",
    )
    source_format: Mapped[str] = mapped_column(String(32), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(32), nullable=False)
    document_profile: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    parse_result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    analysis_result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    review_state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    commit_result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    error_message: Mapped[str] = mapped_column(Text, nullable=False, default="")

    project: Mapped["Project"] = relationship()
    file: Mapped["FileItem"] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "project_id", "content_hash", "parser_version", name="uq_script_import_project_content_parser"
        ),
        Index("ix_script_imports_project_created", "project_id", "created_at"),
    )


from app.models.studio_projects import Project  # noqa: E402
from app.models.studio_prompts_files_timeline import FileItem  # noqa: E402

__all__ = ["ScriptImport"]
