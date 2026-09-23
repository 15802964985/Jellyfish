"""独立创作设定与版本历史，不修改既有任务快照。"""
from sqlalchemy import String, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base
from app.models.base import TimestampMixin

class CreativeDirection(Base, TimestampMixin):
    """scope+entity_id限定归属；业务服务校验对象存在与父链。"""
    __tablename__ = 'creative_directions'
    scope: Mapped[str] = mapped_column(String(24), primary_key=True)
    entity_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

class CreativeDirectionRevision(Base, TimestampMixin):
    """每次修改保存原始覆盖及来源，支持迁移和人工修改追溯。"""
    __tablename__ = 'creative_direction_revisions'
    scope: Mapped[str] = mapped_column(String(24), primary_key=True)
    entity_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
