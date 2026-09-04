"""add rich media assets and optional generation references

Revision ID: e2a6c8f4d901
Revises: d8f4a1e9b702
Create Date: 2026-09-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e2a6c8f4d901"
down_revision: str | Sequence[str] | None = "d8f4a1e9b702"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_file_column_if_missing(column: sa.Column[object]) -> None:
    """Safely add a rich-file metadata column to upgraded legacy databases."""
    inspector = sa.inspect(op.get_bind())
    if column.name not in {item["name"] for item in inspector.get_columns("files")}:
        op.add_column("files", column)


def upgrade() -> None:
    """Add richer uploaded-file metadata plus optional asset and audio links."""
    _add_file_column_if_missing(sa.Column("original_name", sa.String(255), nullable=False, server_default=""))
    _add_file_column_if_missing(sa.Column("mime_type", sa.String(128), nullable=False, server_default=""))
    _add_file_column_if_missing(sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"))
    _add_file_column_if_missing(sa.Column("duration_ms", sa.Integer(), nullable=True))
    _add_file_column_if_missing(sa.Column("width", sa.Integer(), nullable=True))
    _add_file_column_if_missing(sa.Column("height", sa.Integer(), nullable=True))
    _add_file_column_if_missing(sa.Column("checksum", sa.String(64), nullable=False, server_default=""))

    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("asset_file_links"):
        op.create_table(
            "asset_file_links",
            sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column("entity_type", sa.String(32), nullable=False),
            sa.Column("entity_id", sa.String(64), nullable=False),
            sa.Column("file_id", sa.String(64), sa.ForeignKey("files.id", ondelete="CASCADE"), nullable=False),
            sa.Column("resource_role", sa.String(64), nullable=False, server_default="attachment"),
            sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("note", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint(
                "entity_type", "entity_id", "file_id", "resource_role",
                name="uq_asset_file_links_entity_file_role",
            ),
        )
        op.create_index("ix_asset_file_links_entity_type", "asset_file_links", ["entity_type"])
        op.create_index("ix_asset_file_links_entity_id", "asset_file_links", ["entity_id"])
        op.create_index("ix_asset_file_links_file_id", "asset_file_links", ["file_id"])
        op.create_index("ix_asset_file_links_resource_role", "asset_file_links", ["resource_role"])
        op.create_index("ix_asset_file_links_entity", "asset_file_links", ["entity_type", "entity_id", "enabled"])

    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("audio_assets"):
        op.create_table(
            "audio_assets",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("category", sa.String(24), nullable=False),
            sa.Column("file_id", sa.String(64), sa.ForeignKey("files.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("transcript", sa.Text(), nullable=False),
            sa.Column("tags", sa.JSON(), nullable=False),
            sa.Column("actor_id", sa.String(64), sa.ForeignKey("actors.id", ondelete="SET NULL"), nullable=True),
            sa.Column("character_id", sa.String(64), sa.ForeignKey("characters.id", ondelete="SET NULL"), nullable=True),
            sa.Column("language", sa.String(32), nullable=False, server_default="zh-CN"),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("file_id", name="uq_audio_assets_file_id"),
        )
        op.create_index("ix_audio_assets_name", "audio_assets", ["name"])
        op.create_index("ix_audio_assets_category", "audio_assets", ["category"])
        op.create_index("ix_audio_assets_file_id", "audio_assets", ["file_id"])
        op.create_index("ix_audio_assets_actor_id", "audio_assets", ["actor_id"])
        op.create_index("ix_audio_assets_character_id", "audio_assets", ["character_id"])

    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("shot_audio_tracks"):
        op.create_table(
            "shot_audio_tracks",
            sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column("shot_id", sa.String(64), sa.ForeignKey("shots.id", ondelete="CASCADE"), nullable=False),
            sa.Column("audio_asset_id", sa.String(64), sa.ForeignKey("audio_assets.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("dialog_line_id", sa.Integer(), sa.ForeignKey("shot_dialog_lines.id", ondelete="SET NULL"), nullable=True),
            sa.Column("track_type", sa.String(24), nullable=False),
            sa.Column("start_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("end_ms", sa.Integer(), nullable=True),
            sa.Column("volume", sa.Float(), nullable=False, server_default="1"),
            sa.Column("fade_in_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("fade_out_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("loop", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_shot_audio_tracks_shot_id", "shot_audio_tracks", ["shot_id"])
        op.create_index("ix_shot_audio_tracks_audio_asset_id", "shot_audio_tracks", ["audio_asset_id"])
        op.create_index("ix_shot_audio_tracks_dialog_line_id", "shot_audio_tracks", ["dialog_line_id"])
        op.create_index("ix_shot_audio_tracks_track_type", "shot_audio_tracks", ["track_type"])
        op.create_index("ix_shot_audio_tracks_shot_order", "shot_audio_tracks", ["shot_id", "sort_index"])


def downgrade() -> None:
    """Remove rich-media tables and metadata columns when explicitly downgrading."""
    inspector = sa.inspect(op.get_bind())
    for table in ("shot_audio_tracks", "audio_assets", "asset_file_links"):
        if inspector.has_table(table):
            op.drop_table(table)
    existing = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("files")}
    for column in ("checksum", "height", "width", "duration_ms", "size_bytes", "mime_type", "original_name"):
        if column in existing:
            op.drop_column("files", column)
