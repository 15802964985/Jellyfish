"""Offline candidate gate: report exact changed fields and exercise supported adapter option matrices."""
from types import SimpleNamespace
from app.services.generation.specifications import specification


def validate_candidate(candidate: dict | None, previous: dict | None) -> dict:
    """Only activate parsed rules which fit the executable adapter for every supported ratio and input mode."""
    previous = previous or {}
    changes = [{"field": field, "before": previous.get(field), "after": candidate.get(field)}
        for field in sorted(set(previous) | set(candidate or {}))
        if field not in {"checked_at", "source_sha256"} and previous.get(field) != (candidate or {}).get(field)] if candidate else []
    report = {"status": "requires_adapter_review", "field_changes": changes, "checks": [],
        "boundary": "仅验证已解析字段和本地适配器规格矩阵；鉴权、路径和响应结构的任意变化仍需适配代码及真实验收。"}
    if not candidate:
        report["reason"] = "官方字段块缺失、格式变化或超出当前适配器范围；保留上一版规则。"
        return report
    from app.services.llm.contract_rules import CONTRACT_SOURCES
    provider = next((provider for (provider, model), source in CONTRACT_SOURCES.items()
        if model == candidate.get("model") and source == candidate.get("source")), None)
    if provider is None:
        report["reason"] = "型号与官方来源未精确绑定，禁止推断供应商。"
        return report
    category = "image" if candidate.get("profiles") else "video"
    revision = SimpleNamespace(provider_key=provider, model_name=candidate["model"], category=category,
        model_id="offline", id="offline", model_params={}, endpoint_config={})
    try:
        for ratio in ("1:1", "16:9", "9:16", "4:3", "3:4"):
            for references in (0, 1):
                spec = specification(revision, ratio=ratio, references=references)
                allowed = candidate.get("resolutions") or candidate.get("reference_profiles" if references else "profiles") or candidate.get("profiles")
                available = {item["value"] for item in spec["options"]}
                if not allowed or not set(allowed) <= available:
                    report["reason"] = f"{ratio} / 参考图 {references}: 候选规格超出适配器范围"
                    return report
                report["checks"].append({"ratio": ratio, "input_mode": "reference_image" if references else "text",
                    "options": allowed, "result": "passed"})
    except Exception as error:
        report["reason"] = f"离线规格检查失败: {type(error).__name__}"
        return report
    report.update(status="compatible", reason="已解析字段通过 10 组本地规格矩阵校验；不代表真实生成验收。")
    return report
