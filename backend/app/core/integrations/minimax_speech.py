from app.core.integrations.traced_http import create_http_client
"""MiniMax HTTP TTS: explicit billing endpoint, one request, hex audio output.

Contract checked 2026-09-08:
https://platform.minimax.cn/docs/api-reference/speech-t2a-http
"""
from urllib.parse import urlsplit
import httpx
from app.core.integrations.response_errors import raise_provider_error

SPEECH_MODELS = frozenset({
    "speech-2.8-hd", "speech-2.8-turbo", "speech-2.6-hd", "speech-2.6-turbo",
    "speech-02-hd", "speech-02-turbo", "speech-01-hd", "speech-01-turbo",
})
SPEECH_HOSTS = frozenset({"api.minimax.cn", "api.minimaxi.com", "api-bj.minimaxi.com", "api.minimax.io"})


def build_speech_request(*, model: str, params: dict, text: str, voice: str = "", instruction: str = "", language_type: str = "Chinese") -> tuple[str, dict]:
    """Validate before charging; do not reinterpret natural language as unsupported emotion."""
    if model not in SPEECH_MODELS:
        raise ValueError("MiniMax TTS 型号未核验")
    endpoint = str(params.get("audio_endpoint") or "").strip()
    parsed = urlsplit(endpoint)
    if (parsed.scheme != "https" or parsed.hostname not in SPEECH_HOSTS or parsed.port not in (None, 443)
            or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path != "/v1/t2a_v2"):
        raise ValueError("请显式配置 MiniMax 官方 audio_endpoint（/v1/t2a_v2），国内/国际账户不可混用")
    if not text.strip() or len(text) >= 10000:
        raise ValueError("MiniMax 配音文本必须非空且少于 10000 字符")
    if instruction.strip():
        raise ValueError("MiniMax 当前 HTTP TTS 不接收自由配音指令；请清空指令并在模型参数 voice_setting 配置支持的情绪")
    if language_type not in {"Chinese", "English", "auto"}:
        raise ValueError("当前 MiniMax 配音语言仅开放 Chinese / English / auto，其他语言待核验")
    setting = dict(params.get("voice_setting") or {})
    unknown = set(setting) - {"voice_id", "speed", "vol", "pitch", "emotion"}
    if unknown:
        raise ValueError("voice_setting 包含未适配字段")
    voice_id = voice.strip() or str(setting.get("voice_id") or params.get("voice") or "").strip()
    if not voice_id:
        raise ValueError("请配置 MiniMax 音色 voice 或 voice_setting.voice_id")
    setting["voice_id"] = voice_id
    for name, low, high in (("speed", 0.5, 2), ("vol", 0, 10), ("pitch", -12, 12)):
        if name in setting:
            value = setting[name]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
                raise ValueError(f"MiniMax {name} 超出支持范围或类型错误")
            if name == "pitch" and not isinstance(value, int):
                raise ValueError("MiniMax pitch 必须为整数")
    return endpoint, {"model": model, "text": text, "stream": False, "voice_setting": setting, "language_boost": language_type,
        "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1}}


async def generate_speech(*, model: str, params: dict, api_key: str, text: str, voice: str = "", instruction: str = "", language_type: str = "Chinese") -> tuple[bytes, str, str]:
    """Submit once with no redirect/retry; require successful final audio rather than HTTP 200 alone."""
    endpoint, body = build_speech_request(model=model, params=params, text=text, voice=voice, instruction=instruction, language_type=language_type)
    async with create_http_client(timeout=httpx.Timeout(180, connect=20), follow_redirects=False) as client:
        response = await client.post(endpoint, headers={"Authorization": f"Bearer {api_key}"}, json=body)
        raise_provider_error(response, provider="minimax/audio", api_key=api_key)
        payload = response.json()
    base = payload.get("base_resp") or {}
    if base.get("status_code") != 0:
        message = str(base.get("status_msg") or "未返回成功状态").replace(api_key, "[redacted]") if api_key else "未返回成功状态"
        raise ValueError(f"MiniMax TTS code={base.get('status_code')}: {message[:500]}")
    data = payload.get("data") or {}
    if data.get("status") != 2 or not isinstance(data.get("audio"), str) or not data["audio"]:
        raise ValueError("MiniMax 没有返回完整音频，不标记成功")
    if len(data["audio"]) > 100_000_000:
        raise ValueError("MiniMax 音频超过本地处理限制")
    try:
        audio = bytes.fromhex(data["audio"])
    except ValueError as exc:
        raise ValueError("MiniMax 音频编码无效") from exc
    if not audio:
        raise ValueError("MiniMax 返回空音频")
    return audio, "audio/mpeg", ".mp3"
