"""add reviewable shot audio cues

Revision ID: b9e4c7a2d106
Revises: a7c3e5d9f204
Create Date: 2026-09-04
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b9e4c7a2d106"
down_revision: str | Sequence[str] | None = "a7c3e5d9f204"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("shot_details", sa.Column("audio_cues", sa.JSON(), nullable=True))
    op.execute(sa.text("UPDATE shot_details SET audio_cues = '[]' WHERE audio_cues IS NULL"))
    op.alter_column("shot_details", "audio_cues", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    op.drop_column("shot_details", "audio_cues")
