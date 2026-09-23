"""Pixel budgets verified against Wan 2.7 and Seedream 5.0 API docs on 2026-09-09."""
from math import sqrt, floor

RATIOS = ("1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9")


def pixel_profiles(tiers: dict[str, int]) -> dict[str, dict[str, str]]:
    """Preserve aspect ratio within rounding tolerance and never exceed a tier's total pixel budget."""
    result = {}
    for ratio in RATIOS:
        width, height = map(int, ratio.split(":"))
        result[ratio] = {}
        for key, side in tiers.items():
            w = floor(sqrt(side * side * width / height) / 8) * 8
            h = floor(sqrt(side * side * height / width) / 8) * 8
            result[ratio][key] = f"{w}x{h}"
    return result


WAN_PRO_PROFILES = pixel_profiles({"preview": 1024, "standard": 2048, "high": 4096})
SEEDREAM_LITE_PROFILES = pixel_profiles({"standard": 2048, "high": 3072, "ultra": 4096})
