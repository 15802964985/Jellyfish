"""Native text transports for Messages and GenerateContent, sharing business agents."""
from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field, SecretStr

from app.core.integrations.response_errors import raise_provider_error


class NativeTextChat(BaseChatModel):
    """Text-only native adapter; tools/vision are rejected until separately implemented.

    Credentials never enter identifying parameters. Async cancellation is propagated,
    no automatic paid retries are performed, and provider stop reasons are normalized.
    """
    protocol: str
    model_name: str
    api_key: SecretStr = Field(exclude=True, repr=False)
    base_url: str
    options: dict[str, Any] = Field(default_factory=dict)
    timeout_s: float = 120
    supports_tool_calls: bool = False

    @property
    def _llm_type(self) -> str:
        """Expose protocol identity, not credentials."""
        return self.protocol

    def _request(self, messages: list[BaseMessage], stop=None, **kwargs):
        """Translate common textual conversation into the exact native body."""
        options = dict(self.options)
        # AgentBase may bind this DashScope-only option; never forward it natively.
        kwargs.pop("enable_thinking", None)
        if kwargs:
            raise ValueError("当前原生文本适配不支持所请求的工具或额外绑定参数")
        allowed = {"temperature", "top_p", "max_tokens", "generation_config", "thinking"}
        if set(options) - allowed:
            raise ValueError("原生文本模型参数不支持：" + ", ".join(sorted(set(options) - allowed)))
        system, conversation = [], []
        for message in messages:
            if not isinstance(message.content, str) or message.type not in {"system", "human", "ai"}:
                raise ValueError("当前原生适配仅支持文本消息；图片/工具消息需专用适配")
            if getattr(message, "tool_calls", None):
                raise ValueError("当前原生适配不支持工具调用历史")
            if message.type == "system":
                system.append(message.content)
            else:
                conversation.append(("user" if message.type == "human" else "assistant", message.content))
        if not conversation:
            raise ValueError("缺少用户对话内容")
        base = self.base_url.rstrip("/")
        if self.protocol == "anthropic_messages":
            if "generation_config" in options:
                raise ValueError("Claude 不支持 Gemini generation_config")
            body: dict[str, Any] = {"model": self.model_name, "max_tokens": options.pop("max_tokens", 4096),
                "messages": [{"role": role, "content": text} for role, text in conversation], **options}
            if system:
                body["system"] = "\n\n".join(system)
            if stop:
                body["stop_sequences"] = stop
            return base + "/messages", {"x-api-key": self.api_key.get_secret_value(), "anthropic-version": "2023-06-01"}, body
        if self.protocol != "google_generate_content":
            raise ValueError("未注册原生文本协议")
        if "thinking" in options:
            raise ValueError("Gemini 思考参数请放在 generation_config.thinkingConfig 中")
        config = dict(options.pop("generation_config", {}))
        for common, native in {"temperature": "temperature", "top_p": "topP", "max_tokens": "maxOutputTokens"}.items():
            if common in options:
                config[native] = options[common]
        if stop:
            config["stopSequences"] = stop
        body = {"contents": [{"role": "model" if role == "assistant" else "user", "parts": [{"text": text}]} for role, text in conversation], "generationConfig": config}
        if system:
            body["systemInstruction"] = {"parts": [{"text": "\n\n".join(system)}]}
        model = self.model_name.removeprefix("models/")
        return base + "/models/" + quote(model, safe="") + ":generateContent", {"x-goog-api-key": self.api_key.get_secret_value()}, body

    def _result(self, payload: dict) -> ChatResult:
        """Separate final text from thought blocks and normalize truncation/refusal."""
        if self.protocol == "anthropic_messages":
            content = "".join(part.get("text", "") for part in payload.get("content", []) if part.get("type") == "text")
            reason = payload.get("stop_reason")
            finish = "length" if reason == "max_tokens" else "content_filter" if reason == "refusal" else "stop"
            if reason in {"tool_use", "pause_turn"}:
                raise ValueError("模型需要工具或续轮处理，当前业务不支持；未自动重试")
        else:
            if payload.get("promptFeedback", {}).get("blockReason"):
                raise ValueError("Gemini 拒绝本次请求；未自动重试")
            candidates = payload.get("candidates", [])
            if not candidates:
                raise ValueError("Gemini 未返回候选内容")
            candidate = candidates[0]
            content = "".join(part.get("text", "") for part in candidate.get("content", {}).get("parts", []) if not part.get("thought"))
            reason = candidate.get("finishReason")
            finish = "length" if reason == "MAX_TOKENS" else "stop" if reason == "STOP" else "content_filter"
        if finish == "content_filter":
            raise ValueError("模型拒答或内容审核拦截；未自动重试")
        if not content:
            raise ValueError("模型未返回可用文本；未自动重试")
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=content,
            response_metadata={"finish_reason": finish, "provider_stop_reason": reason}), generation_info={"finish_reason": finish})])

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        """Synchronous worker transport, one request only."""
        url, headers, body = self._request(messages, stop, **kwargs)
        with httpx.Client(timeout=self.timeout_s, follow_redirects=False) as client:
            response = client.post(url, headers=headers, json=body)
            raise_provider_error(response, provider=self.protocol, api_key=self.api_key.get_secret_value())
            return self._result(response.json())

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        """Async API transport; cancellation closes the active HTTP client."""
        url, headers, body = self._request(messages, stop, **kwargs)
        async with httpx.AsyncClient(timeout=self.timeout_s, follow_redirects=False) as client:
            response = await client.post(url, headers=headers, json=body)
            raise_provider_error(response, provider=self.protocol, api_key=self.api_key.get_secret_value())
            return self._result(response.json())
