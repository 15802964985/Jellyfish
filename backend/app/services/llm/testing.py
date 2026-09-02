"""模型供应商真实连通性测试服务。"""

from __future__ import annotations

from time import perf_counter
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.llm import Model, ModelCategoryKey, Provider
from app.schemas.llm import ModelConnectionTestRead
from app.services.common import entity_not_found
from app.services.llm.resolver import build_text_llm_by_model


def _preview_content(content: Any) -> str:
    """将不同聊天模型返回结构压缩为适合界面展示的短文本。"""
    if isinstance(content, str):
        return content.strip()[:200]
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return " ".join(parts).strip()[:200]
    return str(content or "").strip()[:200]


def _safe_error_message(exc: Exception, *, api_key: str) -> str:
    """生成不包含完整密钥的上游错误摘要。"""
    detail = str(exc).strip() or exc.__class__.__name__
    if api_key:
        detail = detail.replace(api_key, "********")
    return detail[:800]


async def test_text_model(db: AsyncSession, *, model_id: str) -> ModelConnectionTestRead:
    """向指定文本模型发送最小请求，并返回真实耗时与响应摘要。"""
    model = await db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=entity_not_found("Model"))
    if model.category != ModelCategoryKey.text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="图片/视频测试可能产生较高费用，请在对应生成工作台进行真实生成测试",
        )
    provider = await db.get(Provider, model.provider_id)
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=entity_not_found("Provider"))

    llm = await build_text_llm_by_model(db, model, thinking=False)
    started = perf_counter()
    try:
        response = await llm.ainvoke("连通性测试：请只回复 OK")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"模型调用失败：{_safe_error_message(exc, api_key=(provider.api_key or '').strip())}",
        ) from exc

    return ModelConnectionTestRead(
        ok=True,
        provider_id=provider.id,
        model_id=model.id,
        model_name=model.name,
        category=ModelCategoryKey.text,
        latency_ms=max(0, round((perf_counter() - started) * 1000)),
        response_preview=_preview_content(response.content),
    )


async def test_provider_connection(db: AsyncSession, *, provider_id: str) -> ModelConnectionTestRead:
    """使用供应商最近更新的文本模型执行真实连通性测试。"""
    provider = await db.get(Provider, provider_id)
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=entity_not_found("Provider"))
    stmt = (
        select(Model)
        .where(Model.provider_id == provider.id, Model.category == ModelCategoryKey.text)
        .order_by(Model.updated_at.desc())
        .limit(1)
    )
    model = (await db.execute(stmt)).scalars().first()
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该供应商尚未配置文本模型，无法执行低费用连通性测试",
        )
    return await test_text_model(db, model_id=model.id)
