"""Shared mood guidance from the current shot; suggestions are never implicit defaults."""


def append_shot_mood(text: str, tags: list[str] | None) -> str:
    """Preserve existing direction and append only explicitly saved, nonempty mood labels."""
    moods = list(dict.fromkeys(tag.strip() for tag in (tags or []) if isinstance(tag, str) and tag.strip()))
    if not moods:
        return text
    return "\n".join(part for part in (text, "镜头情绪：" + "、".join(moods)) if part)
