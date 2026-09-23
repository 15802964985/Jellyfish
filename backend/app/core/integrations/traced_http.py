"""HTTP auditing contract: no credentials or media bytes, no retry or protocol modification."""
from contextvars import ContextVar
from hashlib import sha256
from typing import Awaitable, Callable
from urllib.parse import urlsplit, parse_qsl
import json
import httpx

CallSink = Callable[[str, dict], Awaitable[None]]
call_sink: ContextVar[CallSink | None] = ContextVar("generation_call_sink", default=None)
SENSITIVE = {"authorization", "api_key", "apikey", "api_secret", "access_token", "refresh_token", "token", "secret", "password", "credential_ref", "signature", "secret_access_key", "access_key_id", "accesskeyid", "secretaccesskey"}


def sanitize(value, key: str = ""):
    """Keep prompts and ordinary parameters; redact secrets, signed query strings and binary media."""
    if key.lower().replace("-", "_") in SENSITIVE:
        return "[redacted]"
    if isinstance(value, bytes):
        return {"redacted_media": True, "sha256": sha256(value).hexdigest(), "byte_length": len(value)}
    if isinstance(value, dict):
        return {str(k): sanitize(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize(v) for v in value]
    if isinstance(value, str):
        if value.startswith("data:") or key.lower() in {"b64_json", "base64", "image_base64", "video_base64", "input_image", "bytes_base64_encoded", "bytesbase64encoded", "b64_image"} and not value.startswith(("https://", "http://")):
            return {"redacted_media": True, "sha256": sha256(value.encode()).hexdigest(), "encoded_length": len(value)}
        if value.startswith(("https://", "http://")):
            try:
                parts = urlsplit(value)
                return f"{parts.scheme}://{parts.hostname or ''}{':' + str(parts.port) if parts.port else ''}{parts.path}"
            except ValueError:
                return "[invalid URL redacted]"
        if len(value) > 200000:
            return {"truncated": value[:200000], "original_length": len(value), "sha256": sha256(value.encode()).hexdigest()}
    return value


def remove_known_secrets(value, secrets):
    """Remove exact authentication values if a provider echoes them inside an error string."""
    if isinstance(value, dict):
        return {key: remove_known_secrets(item, secrets) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [remove_known_secrets(item, secrets) for item in value]
    if isinstance(value, str):
        for secret in secrets:
            if secret:
                value = value.replace(secret, "[redacted]")
    return value


class TracedAsyncClient(httpx.AsyncClient):
    """Persist request attempts inside a task context; ordinary clients outside tasks are unchanged."""
    def build_request(self, method, url, **kwargs):
        """Remember multipart field metadata before HTTPX wraps streams, without reading uploaded files."""
        request = super().build_request(method, url, **kwargs)
        if kwargs.get("files"):
            fields = kwargs.get("data") or {}
            files = kwargs["files"]
            manifest = []
            for field, item in (files.items() if isinstance(files, dict) else files):
                filename, content, *extra = item if isinstance(item, tuple) else (None, item)
                manifest.append({"field": field, "filename": filename,
                    "content_type": extra[0] if extra else None,
                    "content": sanitize(content) if isinstance(content, bytes) else {"redacted_media": True, "stream_not_read": True}})
            request.extensions["audit_form"] = {"fields": sanitize(fields), "files": sanitize(manifest)}
        return request

    async def send(self, request, **kwargs):
        """Capture final serialized JSON before HTTP and limited response metadata without consuming streams."""
        from app.core.contracts.generation_recovery import media_recovery
        recovery = media_recovery.get()
        if recovery is not None:
            cached = await recovery.before_http(request)
            if cached is not None:
                return cached
        sink = call_sink.get()
        if sink is None:
            response = await super().send(request, **kwargs)
            if recovery is not None:
                await recovery.after_http(request, response)
            return response
        secrets = []
        for key, value in request.headers.items():
            if key.lower() in {"authorization", "x-api-key", "api-key"}:
                secrets.extend([value, value.split(" ", 1)[-1]])
        safe_headers = {key: value for key, value in request.headers.items()
            if key.lower() in {"content-type", "accept", "x-runway-version", "x-dashscope-async", "anthropic-version", "openai-beta"}}
        from uuid import uuid4
        attempt = uuid4().hex
        try:
            body = json.loads(request.content) if request.content else {}
        except (ValueError, httpx.RequestNotRead):
            content_type = request.headers.get("content-type", "")
            if "audit_form" in request.extensions:
                body = request.extensions["audit_form"]
            elif content_type.startswith("application/x-www-form-urlencoded"):
                body = {"fields": [{"name": key, "value": sanitize(value, key)}
                    for key, value in parse_qsl(request.content.decode(), keep_blank_values=True)]}
            else:
                body = {"body_format": content_type or "unknown", "body_not_recorded": True}
        # Versioned envelope keeps safe transport controls separate from the provider's actual body.
        body = {"audit_format": 2, "headers": safe_headers, "body": body}
        await sink(attempt, {"method": request.method, "endpoint": sanitize(str(request.url)), "request": remove_known_secrets(sanitize(body), secrets)})
        try:
            response = await super().send(request, **kwargs)
        except Exception as exc:
            await sink(attempt, {"state": "transport_error", "response": {"error_type": type(exc).__name__}})
            raise
        if recovery is not None:
            await recovery.after_http(request, response)
        metadata = {name: response.headers[name] for name in ("x-request-id", "request-id", "x-tt-logid") if name in response.headers}
        if not kwargs.get("stream"):
            try:
                data = response.json()
                if isinstance(data, dict):
                    for key in ("id", "request_id", "task_id", "status", "error", "code", "message", "usage", "base_resp"):
                        if key in data:
                            metadata[key] = sanitize(data[key], key)
                    nested = data.get("data")
                    if isinstance(nested, dict):
                        metadata["data_status"] = {k: sanitize(nested[k], k) for k in ("task_id", "task_status", "status", "code", "message") if k in nested}
                    output = data.get("output")
                    if isinstance(output, dict):
                        metadata["output_status"] = {k: sanitize(output[k], k) for k in ("task_id", "task_status", "code", "message") if k in output}
            except ValueError:
                metadata["non_json_response"] = True
        await sink(attempt, {"state": "received", "status_code": response.status_code, "response": remove_known_secrets(sanitize(metadata), secrets)})
        return response


def create_http_client(**kwargs):
    """Use an audited client only inside provider task execution; preserve ordinary mockable clients elsewhere."""
    from app.core.contracts.generation_recovery import media_recovery
    return TracedAsyncClient(**kwargs) if call_sink.get() or media_recovery.get() else httpx.AsyncClient(**kwargs)
