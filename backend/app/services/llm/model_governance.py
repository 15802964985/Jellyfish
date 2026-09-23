"""Bounded official-source synchronization: scopes, evidence, diffs, price parsing and leases."""
from datetime import datetime, timezone
from difflib import unified_diff
from hashlib import sha256
import re
import time
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.bootstrap import bootstrap_all_registries
from app.core.db import async_session_maker
from app.core.integrations.model_catalog import builtin_provider_catalog
from app.models.llm import Model, Provider
from app.models.model_governance import ModelGovernanceRecord
from app.services.llm.provider_registry import list_registered_providers, resolve_provider_key
from app.services.llm.documentation import fetch_official_document
from app.services.llm.contract_rules import parse_contract_rule, CONTRACT_SOURCES
from app.services.llm.contract_validation import validate_candidate
from app.services.generation.specifications import HAPPY_SOURCE, HAPPY_PRICE, WAN_PRICE

async def detection_scope(db) -> list[dict]:
    """Union exact built-in catalogue models and saved configurations; never enumerate unrelated remote models."""
    bootstrap_all_registries()
    targets = {}
    for spec in list_registered_providers():
        catalog = builtin_provider_catalog(spec.key)
        for model in catalog.models if catalog else []:
            key = (spec.key, str(getattr(model.category, "value", model.category)), model.name)
            targets[key] = {"provider": key[0], "category": key[1], "model": key[2], "configured_ids": [], "priority": "background"}
    rows = (await db.execute(select(Model, Provider).join(Provider, Model.provider_id == Provider.id))).all()
    for model, provider in rows:
        try:
            adapter = resolve_provider_key(provider)
        except Exception:
            adapter = provider.adapter_key or "unknown"
        key = (adapter, str(getattr(model.category, "value", model.category)), model.name)
        item = targets.setdefault(key, {"provider": key[0], "category": key[1], "model": key[2], "configured_ids": [], "priority": "background"})
        item["configured_ids"].append(model.id)
        if provider.status != "disabled":
            item["priority"] = "configured"
    return sorted(targets.values(), key=lambda item: (item["priority"] != "configured", item["provider"], item["model"]))


def parse_official_prices(url: str, text: str) -> dict | None:
    """Accept only explicit mainland model-price rows and units from two registered exact-model pages."""
    expected = {HAPPY_PRICE: "happyhorse-1.1-i2v", WAN_PRICE: "wan2.7-image-pro"}.get(url)
    if not expected or expected not in text:
        return None
    section = text.split("模型价格", 1)[-1]
    # The official HTML wraps the region name across separate text nodes.
    section = re.sub(r"华北\s+2", "华北2", section)
    if "华北2（北京）" not in section:
        return None
    section = section.split("华北2（北京）", 1)[1].split("新加坡", 1)[0]
    compact = re.sub(r"\s+", " ", section)
    compact = re.split(r"新加坡|德国|美国|日本|限流", compact, maxsplit=1)[0]
    if not re.search(r"价格[（(]元[）)]", compact):
        return None
    if url == WAN_PRICE:
        matches = re.findall(r"图片生成\s*\|?\s*(\d+(?:\.\d+)?)\s*\|?\s*每张", compact)
        found = matches[0] if len(matches) == 1 else None
        if found and 0 < float(found) < 1000:
            return {"model": expected, "rates": {"preview": found, "standard": found, "high": found}, "unit": "image", "currency": "CNY"}
    else:
        rows = re.findall(r"视频生成[（(](480P|720P|1080P)[）)]\s*\|?\s*(\d+(?:\.\d+)?)\s*\|?\s*每秒", compact)
        rates = dict(rows)
        if len(rows) == 3 and set(rates) == {"480P", "720P", "1080P"} and all(0 < float(value) < 1000 for value in rates.values()):
            return {"model": expected, "rates": rates, "unit": "second", "currency": "CNY"}
    return None


async def ensure_scheduler(db) -> ModelGovernanceRecord:
    """Initialize the singleton safely when API and worker start simultaneously."""
    row = await db.get(ModelGovernanceRecord, "scheduler")
    if row is None:
        try:
            async with db.begin_nested():
                db.add(ModelGovernanceRecord(id="scheduler", data={"enabled": True, "interval_hours": 24}))
                await db.flush()
        except IntegrityError:
            pass
        row = await db.get(ModelGovernanceRecord, "scheduler")
    return row


async def sync_official_sources(*, force: bool = False) -> dict:
    """Acquire one bounded lease, fetch each relevant official URL once and retain previous valid snapshots."""
    token = uuid4().hex
    async with async_session_maker() as db:
        await ensure_scheduler(db)
        row = (await db.execute(select(ModelGovernanceRecord).where(ModelGovernanceRecord.id == "scheduler").with_for_update())).scalar_one()
        state = dict(row.data)
        now = time.time()
        if state.get("lease_until", 0) > now:
            return {"status": "already_running"}
        if not force and (not state.get("enabled", True) or now - state.get("last_attempt", 0) < state.get("interval_hours", 24) * 3600):
            return {"status": "not_due"}
        row.data = {**state, "lease": token, "lease_until": now + 3600, "last_attempt": now}
        scope = await detection_scope(db)
        await db.commit()
    from app.services.llm.official_sources import build_source_plan
    specs = {item.key: item for item in list_registered_providers()}
    sources = build_source_plan(scope, specs)
    completed = 0
    try:
        for url, targets in sources.items():
            evidence = await fetch_official_document(url)
            async with async_session_maker() as db:
                key = sha256(url.encode()).hexdigest()
                row = (await db.execute(select(ModelGovernanceRecord).where(ModelGovernanceRecord.id == key).with_for_update())).scalar_one_or_none()
                previous = dict(row.data) if row else {}
                next_data = {**previous, "source": url, "targets": targets, "last_check": evidence.fetched_at,
                    "fetch_status": evidence.status, "message": evidence.message}
                if evidence.status == "fetched":
                    changed = bool(previous.get("sha256") and previous["sha256"] != evidence.content_sha256)
                    next_data.update(sha256=evidence.content_sha256, text=evidence.text,
                        status="changed_requires_validation" if changed else previous.get("status", "baseline"),
                        diff="".join(unified_diff(previous.get("text", "").splitlines(True), evidence.text.splitlines(True), n=2))[:20000] if changed else previous.get("diff", ""),
                        previous_sha256=previous.get("sha256") if changed else previous.get("previous_sha256"))
                    prices = parse_official_prices(url, evidence.text)
                    next_data["price_rule"] = None
                    if prices:
                        next_data["price_rule"] = {**prices, "source": url, "checked_at": evidence.fetched_at,
                            "source_sha256": evidence.content_sha256}
                    contract = parse_contract_rule(url, evidence.text)
                    assessment = validate_candidate(contract, previous.get("contract_rule"))
                    next_data["candidate_validation"] = assessment
                    if assessment["status"] != "compatible":
                        contract = None
                    from app.services.llm.contract_rules import CONTRACT_SOURCES
                    if url in CONTRACT_SOURCES.values():
                        next_data["contract_validation"] = "compatible" if contract else "requires_adapter_review"
                        if not contract:
                            next_data["status"] = "changed_requires_validation"
                    if not previous.get("rules_pinned"):
                        next_data["contract_rule"] = None
                        if contract:
                            next_data["contract_rule"] = {**contract, "checked_at": evidence.fetched_at, "source_sha256": evidence.content_sha256}
                    else:
                        # A manual rollback pins the rules; later scans still collect evidence but cannot undo it.
                        for field in ("price_rule", "contract_rule"):
                            next_data[field] = previous.get(field)
                    if changed:
                        history = previous.get("history", [])
                        next_data["history"] = (history + [{key: previous.get(key) for key in ("sha256", "last_check", "price_rule", "contract_rule")}])[-10:]
                if row:
                    row.data = next_data
                else:
                    db.add(ModelGovernanceRecord(id=key, data=next_data))
                await db.commit()
                completed += 1
        return {"status": "completed", "sources": completed, "models": len(scope)}
    finally:
        async with async_session_maker() as db:
            row = (await db.execute(select(ModelGovernanceRecord).where(ModelGovernanceRecord.id == "scheduler").with_for_update())).scalar_one()
            if row.data.get("lease") == token:
                row.data = {**row.data, "lease_until": 0, "finished_at": datetime.now(timezone.utc).isoformat(), "sources_checked": completed}
                await db.commit()


async def governance_report(db) -> dict:
    """Return scope, status and text diffs, keeping fetched pages inert and separate from active adapter code."""
    scheduler = await ensure_scheduler(db)
    records = (await db.execute(select(ModelGovernanceRecord).where(ModelGovernanceRecord.id != "scheduler"))).scalars().all()
    from app.services.llm.official_sources import build_source_plan
    scope = await detection_scope(db)
    plan = build_source_plan(scope, {item.key: item for item in list_registered_providers()})
    by_source = {row.data.get("source"): row for row in records}
    sources = []
    for url, targets in plan.items():
        row = by_source.get(url)
        data = {key: value for key, value in row.data.items() if key != "text"} if row else {}
        from app.services.llm.contract_rules import effective_rule
        data["effective_price_rule"] = effective_rule(data, "price_rule")
        data["effective_contract_rule"] = effective_rule(data, "contract_rule")
        sources.append({**data, "id": row.id if row else sha256(url.encode()).hexdigest(), "source": url,
            "targets": targets, "fetch_status": data.get("fetch_status", "not_checked")})
    return {"settings": scheduler.data, "scope": scope, "sources": sources,
        "coverage": {"model_sources": sum(item["documentation_scope"] == "model" for item in scope),
            "protocol_only": sum(item["documentation_scope"] == "protocol_only" for item in scope),
            "missing": sum(item["documentation_scope"] == "missing" for item in scope)},
        "notice": "按型号/类别/计费渠道绑定来源；协议入口不代表精确型号已核验。仅完整匹配且绑定当前正文版本的价格及已实现规格可应用；读取失败、字段缺失、未知接口变化均需核对。不会自动切换鉴权、计费端点或模型。回退规则后暂停该来源自动应用，文档检查仍继续。"}


async def update_sync_settings(db, values: dict) -> dict:
    """Serialize cadence changes with the same singleton lock used by scheduling."""
    await ensure_scheduler(db)
    row = (await db.execute(select(ModelGovernanceRecord).where(ModelGovernanceRecord.id == "scheduler").with_for_update())).scalar_one()
    row.data = {**row.data, **values}
    await db.commit()
    return values


async def queue_after_protocol_error() -> None:
    """Debounce non-billable official checks after parameter/endpoint errors; never retry generation."""
    async with async_session_maker() as db:
        await ensure_scheduler(db)
        row = (await db.execute(select(ModelGovernanceRecord).where(ModelGovernanceRecord.id == "scheduler").with_for_update())).scalar_one()
        now = time.time()
        if not row.data.get("enabled", True) or now - row.data.get("last_error_check", 0) < 900:
            return
        row.data = {**row.data, "last_error_check": now}
        await db.commit()
    await queue_sync(force=True)


async def change_rule_version(db, source_id: str, body) -> dict:
    """Rollback only stored validated rules and pin them, or explicitly resume current validated evidence."""
    from fastapi import HTTPException
    row = (await db.execute(select(ModelGovernanceRecord).where(ModelGovernanceRecord.id == source_id).with_for_update())).scalar_one_or_none()
    if row is None or row.data.get("sha256") != body.expected_sha256:
        raise HTTPException(status_code=409, detail="官方依据版本已变化，请刷新后操作")
    data = dict(row.data)
    if body.action == "rollback":
        target = next((item for item in data.get("history", []) if item.get("sha256") == body.target_sha256), None)
        if not target or not (target.get("price_rule") or target.get("contract_rule")):
            raise HTTPException(status_code=422, detail="该历史版本没有可回退的已验证规则")
        data.update(price_rule=target.get("price_rule"), contract_rule=target.get("contract_rule"),
            rules_pinned=True, pinned_version=body.target_sha256)
    else:
        for field, parser in (("price_rule", parse_official_prices), ("contract_rule", parse_contract_rule)):
            rule = parser(data["source"], data.get("text", ""))
            if field == "contract_rule" and data["source"] in CONTRACT_SOURCES.values():
                assessment = validate_candidate(rule, data.get(field))
                data["candidate_validation"] = assessment
                if assessment["status"] != "compatible":
                    raise HTTPException(status_code=422, detail="当前候选规则未通过离线兼容检查，保留固定版本")
            data[field] = None
            if rule:
                data[field] = {**rule, "source": data["source"], "checked_at": data["last_check"], "source_sha256": data["sha256"]}
        data.update(rules_pinned=False, pinned_version=None)
    row.data = data
    await db.commit()
    return {"rules_pinned": data["rules_pinned"], "pinned_version": data.get("pinned_version")}


async def queue_sync(*, force: bool = False) -> None:
    """Submit only the bounded synchronization job; provider network reads run in the worker."""
    from asyncio import to_thread
    from app.tasks.execute_task import sync_model_contracts_celery
    await to_thread(sync_model_contracts_celery.delay, force)
