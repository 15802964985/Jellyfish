"""镜头 AI 配音请求映射与供应商响应测试。"""

from app.models.llm import ModelCategoryKey, ModelConfigRevision
import pytest
from app.services.studio.shot_tts import QWEN_TTS_ENDPOINT, _audio_url, _tts_request


def _revision(*, model_name: str, params: dict | None = None) -> ModelConfigRevision:
    """构造不包含真实凭据的语音模型 revision。"""
    return ModelConfigRevision(
        id="revision-1",
        model_id="model-1",
        version_id=1,
        model_name=model_name,
        category=ModelCategoryKey.audio,
        model_params=params or {},
        provider_key="aliyun_bailian",
        endpoint_config={},
        capability_snapshot={},
        credential_ref="provider:provider-1",
    )


def test_qwen3_tts_uses_multimodal_endpoint_and_plural_instructions() -> None:
    """Qwen3-TTS 必须使用其专用端点和 instructions 参数。"""
    endpoint, body = _tts_request(
        _revision(model_name="qwen3-tts-instruct-flash"),
        {"text": "你好", "voice": "Cherry", "instruction": "温柔", "language_type": "Chinese"},
    )
    assert endpoint == QWEN_TTS_ENDPOINT
    assert body["input"]["instructions"] == "温柔"


def test_qwen_audio_requires_workspace_endpoint() -> None:
    """Qwen-Audio-TTS 不得误用文本兼容 Base URL。"""
    try:
        _tts_request(_revision(model_name="qwen-audio-3.0-tts-flash"), {"text": "你好", "voice": "voice-a"})
    except RuntimeError as exc:
        assert "audio_endpoint" in str(exc)
    else:  # pragma: no cover - 防止误放宽端点约束
        raise AssertionError("workspace endpoint should be required")


def test_audio_url_supports_nested_qwen_response() -> None:
    """从 Qwen-TTS 标准嵌套响应提取临时下载地址。"""
    assert _audio_url({"output": {"audio": {"url": "https://example.invalid/audio.wav"}}}) == (
        "https://example.invalid/audio.wav"
    )


def test_plain_tts_does_not_accept_instruct_controls():
    """Voice generation and instruction-controlled generation are distinct capabilities."""
    with pytest.raises(ValueError):
        _tts_request(_revision(model_name="qwen3-tts-flash"), {"text": "你好", "voice": "Cherry", "instruction": "温柔"})


def test_unknown_audio_model_cannot_borrow_cosyvoice_protocol():
    """A custom name must not silently select another model family's request format."""
    with pytest.raises(ValueError):
        _tts_request(_revision(model_name="unknown-tts", params={"audio_endpoint": "https://example.invalid"}), {"text": "你好", "voice": "v"})
