"""Seedance 1.5 public Beijing online pricing; estimated tokens differ from final usage."""
from decimal import Decimal

SOURCE = "https://www.volcengine.com/docs/82379/1544106"
API_SOURCE = "https://www.volcengine.com/docs/82379/1520757"
AFP_SOURCE = "https://www.volcengine.com/docs/82379/2516283"
# Exact model table verified 2026-09-09; these are pricing dimensions, not UI resolution options.
SIZES = {
    "480p": {"16:9": (864,496), "4:3": (752,560), "1:1": (640,640), "3:4": (560,752), "9:16": (496,864), "21:9": (992,432)},
    "720p": {"16:9": (1280,720), "4:3": (1112,834), "1:1": (960,960), "3:4": (834,1112), "9:16": (720,1280), "21:9": (1470,630)},
    "1080p": {"16:9": (1920,1080), "4:3": (1664,1248), "1:1": (1440,1440), "3:4": (1248,1664), "9:16": (1080,1920), "21:9": (2206,946)},
}


def seedance_price(ratio: str, *, afp: bool = False) -> dict | None:
    """Estimate regular (not draft/flex) output using official dimensions and 24 frames/sec; auto ratios stay unknown."""
    tokens = {tier: Decimal(width * height * 24) / 1024 for tier, sizes in SIZES.items()
        for width, height in [sizes[ratio]] if ratio in sizes} if ratio in SIZES["480p"] else {}
    if not tokens:
        return None
    divisor = Decimal(10000 if afp else 1000000)
    silent, audio = (36, 72) if afp else (8, 16)
    return {"unit": "second", "currency": "AFP" if afp else "CNY", "source": AFP_SOURCE if afp else SOURCE,
        "rates": {tier: str(value * silent / divisor) for tier, value in tokens.items()},
        "audio_rates": {tier: str(value * audio / divisor) for tier, value in tokens.items()},
        "formula": "width * height * 24 * seconds / 1024 / divisor * rate",
        "dimension_source": API_SOURCE, "checked_at": "2026-09-09",
        "note": "按官方尺寸与24帧/秒估算，非样片/离线价格；实际帧数、token和账户扣费以响应usage及账单为准。"}
