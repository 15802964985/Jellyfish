"""Native transports must preserve business messages and failure semantics."""
import httpx
import pytest
from langchain_core.messages import HumanMessage, SystemMessage
from app.core.integrations.native_chat import NativeTextChat


@pytest.mark.parametrize("protocol", ["anthropic_messages", "google_generate_content"])
def test_native_request_contract(protocol):
    """Do not leak keys into URLs or collapse the system instruction into user text."""
    model = NativeTextChat(protocol=protocol, model_name="model-x", api_key="secret", base_url="https://example.invalid/v1", options={"max_tokens": 123})
    url, headers, body = model._request([SystemMessage(content="rules"), HumanMessage(content="script")])
    assert "secret" not in url and "secret" not in repr(model)
    if protocol == "anthropic_messages":
        assert headers["x-api-key"] == "secret" and body["system"] == "rules"
        assert body["max_tokens"] == 123
    else:
        assert headers["x-goog-api-key"] == "secret"
        assert body["systemInstruction"]["parts"][0]["text"] == "rules"
        assert body["generationConfig"]["maxOutputTokens"] == 123


@pytest.mark.asyncio
@pytest.mark.parametrize("protocol,payload", [
    ("anthropic_messages", {"content": [{"type": "text", "text": "result"}], "stop_reason": "end_turn"}),
    ("google_generate_content", {"candidates": [{"content": {"parts": [{"text": "internal", "thought": True}, {"text": "result"}]}, "finishReason": "STOP"}]}),
])
async def test_async_native_call(monkeypatch, protocol, payload):
    """One HTTP call yields the same final-text contract consumed by agents."""
    original = httpx.AsyncClient
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(200, json=payload)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    model = NativeTextChat(protocol=protocol, model_name="m", api_key="k", base_url="https://example.invalid/v1")
    result = await model.ainvoke([HumanMessage(content="script")])
    assert result.content == "result" and len(calls) == 1


def test_refusal_and_truncation():
    """Refusal is not an empty success; length metadata reaches deep-analysis validation."""
    model = NativeTextChat(protocol="anthropic_messages", model_name="m", api_key="k", base_url="https://example.invalid")
    with pytest.raises(ValueError):
        model._result({"stop_reason": "refusal", "content": []})
    result = model._result({"stop_reason": "max_tokens", "content": [{"type": "text", "text": "partial"}]})
    assert result.generations[0].message.response_metadata["finish_reason"] == "length"


@pytest.mark.asyncio
@pytest.mark.parametrize("valid", [True, False])
async def test_business_agent_native_extract_is_single_call(monkeypatch, valid):
    """Schema extraction uses the native protocol once, including malformed-output failure."""
    from pydantic import BaseModel
    from langchain_core.prompts import PromptTemplate
    from app.chains.agents.base import AgentBase
    class Output(BaseModel):
        """Minimal business contract for native transport verification."""
        name: str
    class TestAgent(AgentBase):
        """Real AgentBase with an isolated business prompt."""
        prompt_template = PromptTemplate.from_template("Extract {script}")
        output_model = Output
        system_prompt = "Preserve names"
    original = httpx.AsyncClient
    calls = []
    def respond(request):
        """Return success or malformed content, never a real API request."""
        calls.append(request)
        assert b"Preserve names" in request.content and b"schema" in request.content
        return httpx.Response(200, json={"stop_reason": "end_turn", "content": [{"type": "text", "text": '{"name":"Yanyan"}' if valid else 'not JSON'}]})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    agent = TestAgent(NativeTextChat(protocol="anthropic_messages", model_name="m", api_key="k", base_url="https://example.invalid"))
    if valid:
        assert (await agent.aextract(script="Yanyan")).name == "Yanyan"
    else:
        with pytest.raises(ValueError):
            await agent.aextract(script="Yanyan")
    assert len(calls) == 1
