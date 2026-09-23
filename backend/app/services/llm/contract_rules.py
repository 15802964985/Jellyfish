"""Conservative official contract parsing: only supported parameters in a known wire protocol can activate."""
import re
from fastapi import HTTPException
from app.models.model_governance import ModelGovernanceRecord
from hashlib import sha256

HAPPY_API = "https://help.aliyun.com/zh/model-studio/happyhorse-image-to-video-api-reference"
WAN_API = "https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference"
ARK_VIDEO_API = "https://www.volcengine.com/docs/82379/1520757"
ARK_IMAGE_API = "https://www.volcengine.com/docs/82379/1541523"
CONTRACT_SOURCES = {
    ("aliyun_bailian", "happyhorse-1.1-i2v"): HAPPY_API,
    ("aliyun_bailian", "wan2.7-image-pro"): WAN_API,
    ("volcengine", "doubao-seedance-1.5-pro"): ARK_VIDEO_API,
    ("volcengine", "doubao-seedance-1-5-pro-251215"): ARK_VIDEO_API,
    ("volcengine", "doubao-seedream-5.0-lite"): ARK_IMAGE_API,
}


def parse_image_or_ark_contract(source: str, text: str) -> dict | None:
    """Activate only recognized fields within implemented wire protocols, bounded by tested model capabilities."""
    if source == ARK_VIDEO_API:
        required = ("/api/v3/contents/generations/tasks", "first_frame", "last_frame", "duration integer")
        if any(marker not in text for marker in required):
            return None
        section = text.split("resolution string", 1)[-1].split("url string", 1)[0]
        tiers = re.search(r"Seedance 1\.5 pro[^\n]*可选值([^\n]+)", section)
        duration = re.search(r"Seedance 1\.5 pro[^\n]*取值范围\s*\[(\d+),\s*(\d+)\]", text)
        if not tiers or not duration:
            return None
        values = re.findall(r"\b(?:480p|720p|1080p)\b", tiers[1])
        lo, hi = map(int, duration.groups())
        if not values or not 4 <= lo <= hi <= 12:
            return None
        return {"model": "doubao-seedance-1.5-pro", "resolutions": list(dict.fromkeys(values)),
            "duration_min": lo, "duration_max": hi, "source": source, "adapter_contract": "ark-seedance-15-v1"}
    if source == ARK_IMAGE_API:
        if "/api/v3/images/generations" not in text:
            return None
        section = re.search(r"Seedream 5\.0 lite\s*\n\*?支持以下两种方式(.{0,900})", text, re.S)
        if not section:
            return None
        tiers = re.search(r"可选值[：:]([^\n]+)", section[1])
        if not tiers:
            return None
        values = [key for label, key in (("2K", "standard"), ("3K", "high"), ("4K", "ultra")) if label in tiers[1]]
        if not values or "3686400" not in section[1] or "16777216" not in section[1]:
            return None
        return {"model": "doubao-seedream-5.0-lite", "profiles": values,
            "source": source, "adapter_contract": "ark-seedream-50-v1"}
    if source == WAN_API:
        normalized = re.sub(r"[\s`]+", " ", text)
        if "/services/aigc/multimodal-generation/generation" not in normalized:
            return None
        section = re.search(r"size string.{0,150}?模型[：:]wan2\.7-image-pro(.*?)模型[：:]wan2\.7-image(?: |$)", normalized)
        if not section:
            return None
        text_tiers = re.search(r"文生图（无图片输入，非组图生成）[：:]支持 ([^。]+)", section[1])
        ref_tiers = re.search(r"其他场景[：:]支持 ([^。]+)", section[1])
        if not text_tiers or not ref_tiers:
            return None
        mapping = {"1K": "preview", "2K": "standard", "4K": "high"}
        raw = [re.findall(r"\d+K", match[1]) for match in (text_tiers, ref_tiers)]
        if any(not values or not set(values) <= mapping.keys() for values in raw):
            return None
        # Pixel bounds are an independent constraint; conflicting documentation cannot activate tiers.
        if not re.search(r"文生图[：:]总像素在 \[768[ *×]+768, 4096[ *×]+4096\]", section[1]):
            return None
        if not re.search(r"其他场景[：:]总像素在 \[768[ *×]+768, 2048[ *×]+2048\]", section[1]):
            return None
        count = re.search(r"关闭组图模式时.{0,80}?取值范围\s*1[-–](\d+)", normalized)
        if not count or not 1 <= int(count[1]) <= 4:
            return None
        return {"model": "wan2.7-image-pro", "profiles": [mapping[v] for v in raw[0]],
            "reference_profiles": [mapping[v] for v in raw[1]], "max_outputs": int(count[1]),
            "source": source, "adapter_contract": "wan-27-sync-v2"}
    return None



def parse_contract_rule(source: str, text: str) -> dict | None:
    """Extract the documented HappyHorse tier/duration subset; unrecognized structure requires code review."""
    if source != HAPPY_API:
        return parse_image_or_ark_contract(source, text)
    if "happyhorse-1.1-i2v" not in text:
        return None
    # Require the implemented protocol, rather than treating any mention of a model as proof.
    required = ("/api/v1/services/aigc/video-generation/video-synthesis", "first_frame", "X-DashScope-Async", "task_status")
    if any(marker not in text for marker in required):
        return None
    normalized = re.sub(r"[\s`]+", " ", text)
    match = re.search(r"resolution\s*string(.{0,600}?)duration\s*integer(.{0,220})", normalized)
    if not match:
        return None
    tiers = set(re.findall(r"(?<!\d)(\d{3,4}P)(?!\w)", match[1]))
    duration = re.search(r"[\[［]\s*(\d+)\s*[,，]\s*(\d+)\s*[\]］]", match[2])
    # The existing adapter/tested range bounds what can be changed without deploying code.
    if not tiers or not tiers <= {"480P", "720P", "1080P"} or duration is None:
        return None
    minimum, maximum = map(int, duration.groups())
    if not 3 <= minimum <= maximum <= 15:
        return None
    return {"model": "happyhorse-1.1-i2v", "resolutions": sorted(tiers, key=lambda value: int(value[:-1])),
        "duration_min": minimum, "duration_max": maximum, "source": source,
        "adapter_contract": "happyhorse-first-frame-v1"}


def effective_rule(data: dict, field: str) -> dict | None:
    """Use only evidence-bound rules; an explicitly pinned revision remains distinguishable from current evidence."""
    rule = data.get(field)
    version = data.get("pinned_version") if data.get("rules_pinned") else data.get("sha256")
    if not rule or not version or rule.get("source_sha256") != version:
        return None
    if not data.get("rules_pinned") and data.get("fetch_status") != "fetched":
        return None
    if rule.get("source") != data.get("source"):
        return None
    return rule


async def apply_contract_rule(db, spec: dict) -> dict:
    """Apply a versioned compatible rule before the same front-end preview and server-side validation."""
    source = CONTRACT_SOURCES.get((spec["provider"], spec["model_name"]))
    if db is None or source is None:
        return spec
    row = await db.get(ModelGovernanceRecord, sha256(source.encode()).hexdigest())
    rule = effective_rule(row.data, "contract_rule") if row else None
    if not rule:
        return spec
    allowed = rule.get("resolutions") or (rule.get("reference_profiles") if spec.get("input_mode") == "reference_image" else None) or rule.get("profiles", [])
    spec["options"] = [item for item in spec["options"] if item["value"] in allowed]
    if not spec["options"]:
        raise HTTPException(status_code=422, detail="当前官方规格与适配器没有兼容档位，需先完成接口适配")
    if spec["default"] not in allowed:
        if spec.get("configured_default"):
            raise HTTPException(status_code=422, detail="保存的默认规格已不在官方兼容范围，请修改模型默认配置")
        spec["default"] = spec["options"][0]["value"]
    spec["contract_rule"] = rule
    return spec
