"""Runway Aleph 2 editing protocol, verified against the official SDK and input guide."""
import re
import httpx
from app.core.integrations.response_errors import raise_provider_error

RUNWAY_EDIT_MODEL = 'aleph2'


class RunwayVideoEditAdapter:
    """Explicit timed keyframes, fixed MP4 output, single billable POST with no retries."""
    def __init__(self, client: httpx.AsyncClient, api_key: str):
        """Bind the caller-owned bounded transport; never store its credential in receipts."""
        self.client, self.api_key = client, api_key

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        """Only call the fixed official host with versioned Bearer authentication."""
        response = await self.client.request(method, 'https://api.dev.runwayml.com' + path,
            headers={'Authorization': f'Bearer {self.api_key}', 'X-Runway-Version': '2024-11-06'},
            follow_redirects=False, **kwargs)
        raise_provider_error(response, provider='runway', api_key=self.api_key)
        return response.json() if response.content else {}

    def _task_path(self, receipt: dict) -> str:
        """Provider IDs cannot inject arbitrary paths, queries, or credential destinations."""
        request_id = receipt.get('request_id', '')
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}', request_id):
            raise ValueError('invalid Runway task ID')
        return f'/v1/tasks/{request_id}'

    async def submit(self, *, model: str, prompt: str, video_url: str, image_urls: list[str],
                     keep_audio: bool, reference_positions: list[float] | None = None) -> dict:
        """Audio retention is handled locally; timed images are not generic style references."""
        positions = reference_positions or []
        if model != RUNWAY_EDIT_MODEL or not prompt.strip() or len(image_urls) > 5 or len(positions) != len(image_urls):
            raise ValueError('Runway Aleph 2 requires explicit timestamps for every guidance image')
        # Official SDK's per-field 5MB cap is stricter than the general video table; use the stricter limit.
        if any(len(url.encode('utf-8')) > 5 * 1024 * 1024 for url in [video_url, *image_urls]):
            raise ValueError('Runway 当前直传输入超过 5MB 编码限制；请使用更小文件或其他已接入模型')
        body = {
            'model': model, 'videoUri': video_url, 'promptText': prompt, 'outputFormat': 'mp4',
        }
        if image_urls:
            body['keyframes'] = [{'uri': url, 'seconds': seconds} for url, seconds in zip(image_urls, positions)]
        data = await self._request('POST', '/v1/video_to_video', json=body)
        receipt = {'request_id': data.get('id') or ''}
        self._task_path(receipt)
        return receipt

    async def status(self, receipt: dict) -> dict:
        """Normalize documented states while retaining failure diagnostics."""
        data = await self._request('GET', self._task_path(receipt))
        state = data.get('status')
        if state in ('SUCCEEDED', 'FAILED', 'CANCELLED'):
            return {'status': 'COMPLETED', 'error': None if state == 'SUCCEEDED' else (data.get('failure') or data.get('failureCode') or state)}
        return {'status': {'PENDING': 'IN_QUEUE', 'THROTTLED': 'IN_QUEUE', 'RUNNING': 'IN_PROGRESS'}.get(state, state)}

    async def result(self, receipt: dict) -> str:
        """Download URLs go to ArtifactStore without Runway authorization."""
        data = await self._request('GET', self._task_path(receipt))
        output = data.get('output') or []
        if data.get('status') != 'SUCCEEDED' or not output or not isinstance(output[0], str) or not output[0].startswith('https://'):
            raise ValueError('Runway missing successful video output')
        return output[0]

    async def cancel(self, receipt: dict) -> dict:
        """Only request cancellation while running; completed outputs must not be deleted."""
        data = await self._request('GET', self._task_path(receipt))
        if data.get('status') in ('PENDING', 'THROTTLED', 'RUNNING'):
            return await self._request('DELETE', self._task_path(receipt))
        return {'status': 'ALREADY_TERMINAL'}
