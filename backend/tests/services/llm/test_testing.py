"""模型连通性测试服务的单元测试；所有上游调用均为模拟。"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.models.llm import Model, ModelCategoryKey, Provider
from app.services.llm import testing


class _FakeLlm:
    """返回固定内容的最小异步聊天模型替身。"""

    async def ainvoke(self, _prompt: str) -> SimpleNamespace:
        return SimpleNamespace(content="OK")


@pytest.mark.asyncio
async def test_text_model_returns_real_call_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    """文本测试应调用模型并返回模型、供应商及响应摘要。"""
    provider = Provider(id="p1", name="阿里百炼", base_url="https://example.test/v1", api_key="secret")
    model = Model(id="m1", name="qwen-test", category=ModelCategoryKey.text, provider_id="p1")
    db = AsyncMock()
    db.get.side_effect = [model, provider]
    monkeypatch.setattr(testing, "build_text_llm_by_model", AsyncMock(return_value=_FakeLlm()))

    result = await testing.test_text_model(db, model_id="m1")

    assert result.ok is True
    assert result.provider_id == "p1"
    assert result.model_name == "qwen-test"
    assert result.response_preview == "OK"


@pytest.mark.asyncio
async def test_non_text_model_does_not_trigger_generation() -> None:
    """管理页测试图片/视频模型时应拒绝，避免误产生费用。"""
    model = Model(id="m2", name="wan-video", category=ModelCategoryKey.video, provider_id="p1")
    db = AsyncMock()
    db.get.return_value = model

    with pytest.raises(HTTPException) as exc_info:
        await testing.test_text_model(db, model_id="m2")

    assert exc_info.value.status_code == 400
