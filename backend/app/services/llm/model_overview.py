"""Local model selection inventory: execution catalogue joined with saved account configurations."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.bootstrap import bootstrap_all_registries
from app.core.contracts.model_recommendations import (
    ModelOverviewConfiguration, ModelOverviewItem, ModelOverviewRead, ModelScenarioRead,
)
from app.core.integrations.model_catalog import builtin_provider_catalog
from app.core.integrations.video_capabilities import resolve_video_capability
from app.models.llm import Model, Provider, ModelCategoryKey
from app.services.llm.provider_registry import list_registered_providers, resolve_provider_key
from app.services.llm.scenario_recommendations import SCENARIOS, DOMESTIC, _supports, recommend_for_models


def _provider_key(provider: Provider) -> str:
    """Preserve unknown saved adapters in the all-provider view without asserting support."""
    try:
        return resolve_provider_key(provider)
    except (ValueError, HTTPException):
        return provider.adapter_key or "unknown"


def build_model_overview(rows: list[tuple[Model, Provider]], providers: list[Provider],
                         *, domestic_only: bool = True) -> ModelOverviewRead:
    """Merge by exact provider/category/model identity, retaining every saved account and no secrets."""
    bootstrap_all_registries()
    specs = list_registered_providers()
    candidates = {}
    notices = []
    for spec in specs:
        if domestic_only and spec.key not in DOMESTIC:
            continue
        catalog = builtin_provider_catalog(spec.key)
        if catalog is None:
            notices.append(f"{spec.display_name}：已接入协议，但没有离线精确型号目录；仅展示已保存型号，新增前请通过官方目录核查。")
            continue
        for candidate in catalog.models:
            candidates[(spec.key, candidate.category.value, candidate.name)] = candidate

    saved = {}
    for model, provider in rows:
        key = _provider_key(provider)
        if domestic_only and key not in DOMESTIC:
            continue
        identity = (key, ModelCategoryKey(model.category).value, model.name)
        saved.setdefault(identity, []).append((model, provider))

    # Keep the same configuration checks as the existing scenario endpoint; no HTTP or writes occur.
    checks = {}
    for scenario in recommend_for_models(rows, domestic_only=domestic_only):
        for choice in scenario.choices:
            checks.setdefault(choice.model_id, []).append((scenario.key, choice))

    items = []
    for identity in sorted(candidates.keys() | saved.keys()):
        key, category, name = identity
        candidate = candidates.get(identity)
        configurations = saved.get(identity, [])
        spec = next((value for value in specs if value.key == key), None)
        model = Model(id="catalog-only", name=name, category=category,
                      params=candidate.params if candidate else {})
        scene_keys, limitations = [], []
        if candidate and candidate.description:
            limitations.append(candidate.description)
        # A generic category or arbitrary name never certifies execution support.
        if spec and ModelCategoryKey(category) in spec.supported_categories and (
            candidate or (category == "text" and spec.text_protocol)
        ):
            for scene, _, scene_category, _, _ in SCENARIOS:
                if scene_category != category:
                    continue
                try:
                    supported, reason = _supports(model, key, scene, check_configuration=False)
                except (ValueError, KeyError, HTTPException):
                    supported, reason = False, "精确型号执行能力尚未核验"
                if supported:
                    scene_keys.append(scene)
                    limitations.append(reason)
            if category == "video" and scene_keys and spec.video_operations != ("video_edit",):
                cap = resolve_video_capability(provider=key, model=name)
                if cap.allowed_seconds:
                    limitations.append("时长仅支持：" + "/".join(str(n) for n in sorted(cap.allowed_seconds)) + "秒")
                elif cap.max_seconds:
                    limitations.append(f"时长范围：{cap.min_seconds or 1}–{cap.max_seconds}秒")
                if cap.requires_first_frame:
                    limitations.append("必须提供首帧")
                if cap.requires_last_frame:
                    limitations.append("必须提供尾帧")
                if cap.requires_subject_reference:
                    limitations.append("必须提供主体参考素材")
        if not candidate:
            limitations.append("已保存的自定义/目录外型号；协议兼容不等于精确型号已接通，请执行接入核查。")
        if not scene_keys:
            limitations.append("尚无已核验的适用场景，不作为可直接使用的推荐。")

        accounts = []
        for stored_model, provider in configurations:
            account_checks = checks.get(stored_model.id, [])
            applicable = [choice for scene, choice in account_checks if scene in scene_keys]
            usable = bool(candidate) and any(choice.eligible for choice in applicable)
            reasons = list(dict.fromkeys(reason for choice in (applicable or [c for _, c in account_checks])
                                         for reason in choice.reasons))
            if not candidate:
                reasons.insert(0, "精确型号待核验")
            accounts.append(ModelOverviewConfiguration(
                model_id=stored_model.id, provider_id=provider.id, provider_name=provider.name,
                status="configured" if usable else "needs_attention", reasons=reasons))
        status = "not_configured" if not accounts else (
            "configured" if any(a.status == "configured" for a in accounts) else "needs_attention")
        items.append(ModelOverviewItem(
            key=":".join(identity), provider_key=key, provider_name=spec.display_name if spec else key,
            model_name=name, category=category, integration="integrated" if candidate and scene_keys else "unverified",
            configuration_status=status, scenario_keys=scene_keys, limitations=list(dict.fromkeys(limitations)),
            configurations=accounts,
            provider_ids=[p.id for p in providers if _provider_key(p) == key],
            official_documentation=spec.official_documentation if spec else None))
    items.sort(key=lambda item: (not bool(item.configurations), item.provider_name, item.category, item.model_name))
    return ModelOverviewRead(models=items, scenarios=[
        ModelScenarioRead(key=key, title=title, requirement=requirement, guidance=guidance)
        for key, title, _, requirement, guidance in SCENARIOS
    ], notices=notices)


async def get_model_overview(db: AsyncSession, *, domestic_only: bool = True) -> ModelOverviewRead:
    """Read all records, including providers with no models; pagination/search never hides configurations."""
    providers = list((await db.execute(select(Provider))).scalars().all())
    rows = list((await db.execute(select(Model, Provider).join(Provider, Model.provider_id == Provider.id))).all())
    return build_model_overview(rows, providers, domestic_only=domestic_only)
