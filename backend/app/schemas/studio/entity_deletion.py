"""Schemas for previewing and confirming destructive Studio entity deletion."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


EntityTypeKey = Literal["actor", "character", "scene", "prop", "costume"]


class EntityDeleteImpactGroup(BaseModel):
    """One human-readable category of relationships affected by deletion."""

    relation_type: str
    label: str
    count: int = Field(ge=0)
    items: list[str] = Field(default_factory=list)


class EntityDeleteImpactRead(BaseModel):
    """Concrete relationship summary shown before unlink-and-delete."""

    entity_type: EntityTypeKey
    entity_id: str
    entity_name: str
    relation_count: int = Field(ge=0)
    has_relations: bool
    groups: list[EntityDeleteImpactGroup] = Field(default_factory=list)


__all__ = ["EntityDeleteImpactGroup", "EntityDeleteImpactRead", "EntityTypeKey"]
