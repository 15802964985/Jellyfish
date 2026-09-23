"""Bounded official-site reader: no credentials, redirects, script execution or model calls."""
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import re
import socket
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit, parse_qsl

import httpx

from app.core.contracts.documentation import DocumentationEvidence

MAX_BYTES = 2_000_000
MAX_TEXT = 60_000
# Exact trusted domains; adding a provider never authorizes arbitrary URL fetching.
OFFICIAL_HOSTS = frozenset({
    "developers.openai.com", "help.aliyun.com", "www.volcengine.com",
    "platform.vidu.com", "platform.vidu.cn", "docs.dev.runwayml.com", "fal.ai", "kling.ai", "api-docs.deepseek.com",
    "ai.google.dev", "platform.minimax.io", "platform.claude.com", "docs.bfl.ai",
    "platform.minimaxi.com", "platform.minimax.cn", "docs.bigmodel.cn", "cloud.tencent.com", "docs.volcengine.com",
})


class _DocumentText(HTMLParser):
    """Extract inert text, omitting executable/hidden site assets and navigation."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skipped: list[str] = []

    def handle_starttag(self, tag, attrs):
        """Suppress executable and navigation subtrees."""
        if tag in {"script", "style", "nav", "noscript", "svg"}:
            self.skipped.append(tag)

    def handle_endtag(self, tag):
        """Resume extraction only after the matching suppressed subtree ends."""
        if self.skipped and tag == self.skipped[-1]:
            self.skipped.pop()

    def handle_data(self, data):
        """Collect text only; the UI must never render source HTML."""
        if not self.skipped and data.strip():
            self.parts.append(data.strip())


def extract_volc_document(value) -> str:
    """Extract only public Delta text inserts, excluding attributes, links and embedded executable markup."""
    parts = []
    def visit(node):
        """Walk JSON blocks in source order; only string inserts are renderable documentation."""
        if isinstance(node, dict):
            if isinstance(node.get("insert"), str):
                parts.append(node["insert"])
            for key, item in node.items():
                if key not in {"insert", "attributes"}:
                    visit(item)
        elif isinstance(node, list):
            for item in node:
                visit(item)
    visit(value)
    return "".join(parts)


async def validate_official_url(url: str) -> None:
    """Reject nonofficial origins and private DNS answers before opening a connection.

    Sources are server-owned registration metadata, not user-supplied URLs.
    Redirects are never followed, including redirects to another official domain.
    """
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname not in OFFICIAL_HOSTS
            or parsed.username or parsed.password or parsed.port not in {None, 443}
            or (parsed.query and parse_qsl(parsed.query, keep_blank_values=True) not in [[("lang", "zh")], [("lang", "en")]]) or parsed.fragment):
        raise ValueError("未授权的官方文档地址")
    answers = await asyncio.to_thread(socket.getaddrinfo, parsed.hostname, 443, type=socket.SOCK_STREAM)
    if not answers or any(not ipaddress.ip_address(answer[4][0]).is_global for answer in answers):
        raise ValueError("官方文档域名未解析到公网地址")


async def fetch_official_document(url: str | None) -> DocumentationEvidence:
    """Read one official page with a total deadline and decompressed size limit.

    No model/SDK, provider credentials, environment proxy or authentication cookies
    are used. Fetch success only means readable text, not per-model verification.
    """
    now = datetime.now(timezone.utc).isoformat()
    if not url:
        return DocumentationEvidence(fetched_at=now, status="not_registered", message="未登记官方文档来源")
    try:
        async with asyncio.timeout(20):
            await validate_official_url(url)
            # The public docs frontend now loads Delta JSON; keep the displayed source URL unchanged.
            parsed = urlsplit(url)
            doc = re.fullmatch(r"/docs/(\d+)/(\d+)", parsed.path)
            is_volc_document = parsed.hostname in {"www.volcengine.com", "docs.volcengine.com"} and doc is not None
            fetch_url = url
            if is_volc_document:
                await validate_official_url("https://docs.volcengine.com")
                fetch_url = "https://docs.volcengine.com/api/doc/getDocDetail"
            async with httpx.AsyncClient(timeout=12, follow_redirects=False, trust_env=False) as client:
                async with client.stream("GET", fetch_url, params={"LibraryID": doc[1], "DocumentID": doc[2]} if is_volc_document else None, headers={"Accept": "application/json" if is_volc_document else "text/html,text/plain,text/markdown"}) as response:
                    if response.status_code != 200:
                        raise ValueError(f"官网 HTTP {response.status_code}；重定向不会自动跟随")
                    media_type = response.headers.get("content-type", "").split(";")[0].strip()
                    if media_type not in ({"application/json"} if is_volc_document else {"text/html", "text/plain", "text/markdown"}):
                        raise ValueError("官网响应不是支持的文本格式")
                    chunks = bytearray()
                    async for chunk in response.aiter_bytes():
                        chunks.extend(chunk)
                        if len(chunks) > MAX_BYTES:
                            raise ValueError("官方文档超过读取大小限制")
            raw = chunks.decode("utf-8", errors="replace")
            if is_volc_document:
                payload = json.loads(raw).get("Result") or {}
                if str(payload.get("DocumentID")) != doc[2] or str(payload.get("LibraryID")) != doc[1]:
                    raise ValueError("官方正文编号不匹配")
                text = extract_volc_document(json.loads(payload["Content"]))
            elif media_type == "text/html":
                parser = _DocumentText()
                parser.feed(raw)
                text = "\n".join(parser.parts)
            else:
                text = raw
            if len(text.strip()) < 300:
                return DocumentationEvidence(source_url=url, fetched_at=now, status="unreadable",
                    message="未取得足够正文，可能为动态页面或登录页；需人工核对")
            return DocumentationEvidence(source_url=url, fetched_at=now, status="fetched",
                content_sha256=hashlib.sha256(text.encode()).hexdigest(), text=text[:MAX_TEXT],
                message="已读取文本，尚未验证是否适用于当前模型；正文可作为版本核对依据，不代表接口适配通过"
                    + ("；展示内容已截断" if len(text) > MAX_TEXT else ""))
    except (ValueError, KeyError, TypeError, RecursionError, OSError, TimeoutError, httpx.HTTPError):
        # Do not expose network exception strings, response bodies or internal DNS details.
        return DocumentationEvidence(source_url=url, fetched_at=now, status="unavailable",
            message="官网正文获取失败（网络、重定向、安全策略或大小限制）；可打开官网人工核对，未调用模型")
