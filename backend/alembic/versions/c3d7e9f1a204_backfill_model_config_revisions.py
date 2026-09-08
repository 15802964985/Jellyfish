"""backfill executable revisions for existing models

Revision ID: c3d7e9f1a204
Revises: b9e4c7a2d106
Create Date: 2026-09-04
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import json
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = "c3d7e9f1a204"
down_revision: str | Sequence[str] | None = "b9e4c7a2d106"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BACKFILL_PREFIX = "backfill-"
_PROVIDER_ALIASES = {
    "openai": "openai",
    "火山引擎": "volcengine",
    "volcengine": "volcengine",
    "volc": "volcengine",
    "doubao": "volcengine",
    "bytedance": "volcengine",
    "ark": "volcengine",
    "vidu": "vidu",
    "vidu ai": "vidu",
    "生数科技": "vidu",
    "可灵": "kling",
    "可灵 ai": "kling",
    "kling": "kling",
    "kling ai": "kling",
    "klingai": "kling",
    "阿里百炼": "aliyun_bailian",
    "aliyun": "aliyun_bailian",
    "bailian": "aliyun_bailian",
    "dashscope": "aliyun_bailian",
}


def _provider_key(row: Mapping[str, object]) -> str:
    """把历史供应商名称和端点归一化为运行时注册键，未知项立即阻断迁移。"""

    name = str(row.get("provider_name") or "").strip().lower()
    exact = _PROVIDER_ALIASES.get(name)
    if exact:
        return exact
    combined = " ".join(
        str(row.get(field) or "").strip().lower()
        for field in ("provider_name", "base_url", "image_base_url", "video_base_url")
    )
    if any(token in combined for token in ("volc", "doubao", "bytedance", "volces.com", "ark.")):
        return "volcengine"
    if any(token in combined for token in ("aliyun", "bailian", "dashscope")):
        return "aliyun_bailian"
    if "vidu" in combined:
        return "vidu"
    if "kling" in combined or "可灵" in combined:
        return "kling"
    if "openai" in combined:
        return "openai"
    raise RuntimeError(f"无法为历史供应商生成模型配置版本：provider_id={row.get('provider_id')}")


def _json_value(value: object, *, fallback: object) -> str:
    """把驱动返回的 dict 或 JSON 字符串规范化为可跨 MySQL/SQLite 写入的 JSON。"""

    if value in (None, ""):
        normalized = fallback
    elif isinstance(value, str):
        try:
            normalized = json.loads(value)
        except json.JSONDecodeError:
            normalized = fallback
    else:
        normalized = value
    return json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))


def upgrade() -> None:
    """为迁移前已存在的模型补建或重新指向不可变执行 revision。"""

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT m.id AS model_id, m.name AS model_name, m.category, m.params, "
            "p.id AS provider_id, p.name AS provider_name, p.base_url, "
            "p.image_base_url, p.video_base_url "
            "FROM models m JOIN providers p ON p.id = m.provider_id "
            "WHERE m.current_revision_id IS NULL"
        )
    ).mappings().all()

    for row in rows:
        existing = bind.execute(
            sa.text(
                "SELECT id FROM model_config_revisions "
                "WHERE model_id = :model_id ORDER BY version_id DESC LIMIT 1"
            ),
            {"model_id": row["model_id"]},
        ).scalar_one_or_none()
        revision_id = str(existing) if existing else f"{_BACKFILL_PREFIX}{uuid4().hex}"
        if existing is None:
            endpoint_config = {
                "base_url": row["base_url"],
                "image_base_url": row["image_base_url"],
                "video_base_url": row["video_base_url"],
            }
            bind.execute(
                sa.text(
                    "INSERT INTO model_config_revisions "
                    "(id, model_id, version_id, model_name, category, model_params, provider_key, "
                    "endpoint_config, capability_snapshot, credential_ref, created_at, updated_at) "
                    "VALUES (:id, :model_id, 1, :model_name, :category, :model_params, :provider_key, "
                    ":endpoint_config, :capability_snapshot, :credential_ref, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                ),
                {
                    "id": revision_id,
                    "model_id": row["model_id"],
                    "model_name": row["model_name"],
                    "category": row["category"],
                    "model_params": _json_value(row["params"], fallback={}),
                    "provider_key": _provider_key(row),
                    "endpoint_config": _json_value(endpoint_config, fallback={}),
                    "capability_snapshot": _json_value(
                        {"source": "legacy_model_revision_backfill"},
                        fallback={},
                    ),
                    "credential_ref": f"provider:{row['provider_id']}",
                },
            )
        bind.execute(
            sa.text("UPDATE models SET current_revision_id = :revision_id WHERE id = :model_id"),
            {"revision_id": revision_id, "model_id": row["model_id"]},
        )


def downgrade() -> None:
    """仅移除本迁移创建的 backfill revision，不触碰用户后来保存的新版本。"""

    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE models SET current_revision_id = NULL "
            "WHERE current_revision_id LIKE :prefix"
        ),
        {"prefix": f"{_BACKFILL_PREFIX}%"},
    )
    bind.execute(
        sa.text("DELETE FROM model_config_revisions WHERE id LIKE :prefix"),
        {"prefix": f"{_BACKFILL_PREFIX}%"},
    )
