"""Safe provider HTTP diagnostics without logging request bodies or credentials."""
from __future__ import annotations

import re

import httpx


def raise_provider_error(response: httpx.Response, *, provider: str, api_key: str = "") -> None:
    """Keep provider error codes/request IDs instead of a bare HTTP 404 message.

    Only documented scalar diagnostic fields are read; never dump raw JSON/HTML,
    request headers, submitted scripts or signed URLs.
    """
    if not response.is_error:
        return
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    error = payload.get("error")
    details = error if isinstance(error, dict) else payload

    def safe(value: object) -> str:
        """Redact the known key, common token forms and all remote URLs."""
        if not isinstance(value, (str, int)):
            return ""
        text = str(value)
        if api_key:
            text = text.replace(api_key, "[redacted]")
        text = re.sub(r"https?://\S+", "[url]", text)
        text = re.sub(r"(?i)bearer\s+\S+|\bsk-[\w-]+", "[redacted]", text)
        return " ".join(text.split())[:500]

    code = safe(details.get("code") or payload.get("code"))
    message = safe(details.get("message") or payload.get("message"))
    request_id = safe(payload.get("request_id") or response.headers.get("x-request-id") or response.headers.get("x-tt-logid"))
    summary = f"{provider} HTTP {response.status_code}"
    if code:
        summary += f"; code={code}"
    if message:
        summary += f"; message={message}"
    if request_id:
        summary += f"; request_id={request_id}"
    if provider == "volcengine" and code == "UnsupportedModel" and "agent plan" in message.lower():
        summary += "; 当前模型未被 Agent Plan 接受，请核对套餐当前允许的精确模型 ID、模型下线状态及专用 Key。不要仅因 HTTP 404 修改地址；系统不会自动切换标准按量计费端点或重试。"
    raise httpx.HTTPStatusError(summary, request=response.request, response=response)
