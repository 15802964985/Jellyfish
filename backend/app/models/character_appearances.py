"""同一角色的不可变造型版本与镜头选用关系。"""
from sqlalchemy import String, Integer, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base
from app.models.base import TimestampMixin

class CharacterAppearance(Base, TimestampMixin):
    """保存服装、描述、设定和角度图片快照，不修改角色身份或旧版本。"""
    __tablename__ = 'character_appearances'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    character_id: Mapped[str] = mapped_column(String(64), ForeignKey('characters.id', ondelete='CASCADE'), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    __table_args__ = (UniqueConstraint('character_id','version',name='uq_character_appearance_version'),)

class ShotCharacterAppearance(Base, TimestampMixin):
    """一个镜头对同一角色只选择一个造型；未选继续兼容当前定妆图。"""
    __tablename__ = 'shot_character_appearances'
    shot_id: Mapped[str] = mapped_column(String(64), ForeignKey('shots.id', ondelete='CASCADE'), primary_key=True)
    character_id: Mapped[str] = mapped_column(String(64), ForeignKey('characters.id', ondelete='CASCADE'), primary_key=True)
    appearance_id: Mapped[str] = mapped_column(String(64), ForeignKey('character_appearances.id', ondelete='CASCADE'), nullable=False)
