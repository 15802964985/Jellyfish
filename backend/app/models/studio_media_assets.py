"""统一资产附件、音频资产与镜头音轨模型。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin
from app.models.types import AudioAssetCategory, ShotAudioTrackType

if TYPE_CHECKING:
    from app.models.studio_assets import Actor, Character
    from app.models.studio_prompts_files_timeline import FileItem
    from app.models.studio_shots import Shot, ShotDialogLine


class AssetFileLink(Base, TimestampMixin):
    """把任意 FileItem 作为可选参考素材关联到业务资产。"""

    __tablename__ = "asset_file_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    file_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_role: Mapped[str] = mapped_column(String(64), nullable=False, default="attachment", index=True)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")

    file: Mapped["FileItem"] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "entity_type", "entity_id", "file_id", "resource_role", name="uq_asset_file_links_entity_file_role"
        ),
        Index("ix_asset_file_links_entity", "entity_type", "entity_id", "enabled"),
    )


class AudioAsset(Base, TimestampMixin):
    """可复用的配音、旁白、配乐或音效资产。"""

    __tablename__ = "audio_assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[AudioAssetCategory] = mapped_column(String(24), nullable=False, index=True)
    file_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("files.id", ondelete="RESTRICT"), nullable=False, unique=True, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    transcript: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    actor_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("actors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    character_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("characters.id", ondelete="SET NULL"), nullable=True, index=True
    )
    language: Mapped[str] = mapped_column(String(32), nullable=False, default="zh-CN")
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    file: Mapped["FileItem"] = relationship()
    actor: Mapped["Actor | None"] = relationship()
    character: Mapped["Character | None"] = relationship()


class ShotAudioTrack(Base, TimestampMixin):
    """镜头内持久化的对白、配乐和音效轨道配置。"""

    __tablename__ = "shot_audio_tracks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shot_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("shots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    audio_asset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("audio_assets.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    dialog_line_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("shot_dialog_lines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    track_type: Mapped[ShotAudioTrackType] = mapped_column(String(24), nullable=False, index=True)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    end_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    volume: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    fade_in_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fade_out_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    loop: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    audio_asset: Mapped["AudioAsset"] = relationship()
    shot: Mapped["Shot"] = relationship()
    dialog_line: Mapped["ShotDialogLine | None"] = relationship()

    __table_args__ = (Index("ix_shot_audio_tracks_shot_order", "shot_id", "sort_index"),)


__all__ = ["AssetFileLink", "AudioAsset", "ShotAudioTrack"]
