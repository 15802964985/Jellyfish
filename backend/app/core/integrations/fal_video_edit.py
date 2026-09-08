"""fal.ai Kling O3 edit queue, independent of native Kling credentials and billing."""
from urllib.parse import urlsplit
import httpx
from app.core.integrations.response_errors import raise_provider_error

FAL_EDIT_MODEL = 'fal-ai/kling-video/o3/pro/video-to-video/edit'


def validate_queue_url(url: str) -> str:
    """Keep authorization on the documented queue origin; disallow redirects and credentials."""
    p = urlsplit(url)
    if (p.scheme != 'https' or p.hostname != 'queue.fal.run' or p.port not in (None, 443)
            or p.username or p.password or p.fragment or not p.path.startswith('/fal-ai/kling-video/')):
        raise ValueError('fal returned unsafe tracking URL')
    return url


class FalVideoEditAdapter:
    """Single billable submit with caller-driven polling and cancellation, never automatic retry."""
    def __init__(self, client: httpx.AsyncClient, api_key: str):
        """Use a bounded caller-owned HTTP client."""
        self.client, self.api_key = client, api_key

    async def _request(self, method: str, url: str, **kwargs) -> dict:
        """Validate key destination and retain sanitized provider diagnostics."""
        response = await self.client.request(method, validate_queue_url(url),
            headers={'Authorization': f'Key {self.api_key}'}, follow_redirects=False, **kwargs)
        raise_provider_error(response, provider='fal', api_key=self.api_key)
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError('fal returned non-object response')
        return data

    async def submit(self, *, model: str, prompt: str, video_url: str,
                     image_urls: list[str], keep_audio: bool) -> dict:
        """Validate exact implemented model and attachment count before sending."""
        if model != FAL_EDIT_MODEL or not prompt.strip() or not video_url or len(image_urls) > 4:
            raise ValueError('fal edit requires implemented model, video, prompt and at most four images')
        data = await self._request('POST', f'https://queue.fal.run/{model}', json={
            'prompt': prompt, 'video_url': video_url, 'image_urls': image_urls, 'keep_audio': keep_audio})
        if not data.get('request_id'):
            raise ValueError('fal submission outcome unknown: missing request_id; do not automatically resubmit')
        for key in ('status_url', 'response_url', 'cancel_url'):
            if not isinstance(data.get(key), str):
                raise ValueError(f'fal submission outcome unknown: missing {key}; do not automatically resubmit')
            validate_queue_url(data[key])
        return {key: data[key] for key in ('request_id', 'status_url', 'response_url', 'cancel_url')}

    async def status(self, receipt: dict) -> dict:
        """Poll queue without requesting content-bearing logs."""
        return await self._request('GET', receipt['status_url'])

    async def result(self, receipt: dict) -> str:
        """Return output URL for controlled artifact download, without forwarding credentials."""
        data = await self._request('GET', receipt['response_url'])
        url = (data.get('video') or {}).get('url')
        if not isinstance(url, str) or not url.startswith('https://'):
            raise ValueError('fal edit result missing HTTPS video URL')
        return url

    async def cancel(self, receipt: dict) -> dict:
        """Acceptance does not guarantee running inference stopped or was refunded."""
        return await self._request('PUT', receipt['cancel_url'])
