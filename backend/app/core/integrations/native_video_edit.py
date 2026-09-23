"""Native video editing requests verified against official APIs on 2026-09-09."""
import re
from app.core.integrations.video_edit_registry import edit_capability, editing_base_url
from app.core.integrations.response_errors import raise_provider_error

class NativeVideoEditAdapter:
    """One paid submission, exact billing origin, normalized polling; never retry POST."""
    def __init__(self, client, cfg):
        """Reuse audited caller-owned transport and frozen provider configuration."""
        self.client, self.cfg = client, cfg
        self.base = editing_base_url(cfg.provider, cfg.base_url)

    async def _request(self, method, path, **kwargs):
        """Keep credentials on the validated official origin and reject business errors."""
        headers = {'Authorization': ('Token ' if self.cfg.provider == 'vidu' else 'Bearer ') + self.cfg.api_key}
        if self.cfg.provider == 'aliyun_bailian':
            headers['X-DashScope-Async'] = 'enable'
        response = await self.client.request(method, self.base + path, headers=headers, follow_redirects=False, **kwargs)
        raise_provider_error(response, provider=self.cfg.provider, api_key=self.cfg.api_key)
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError('编辑接口返回非对象响应')
        if self.cfg.provider == 'kling' and data.get('code') != 0:
            raise ValueError('可灵编辑失败：' + str(data.get('message') or data.get('code')))
        return data

    async def submit(self, *, model, prompt, video_url, image_urls, keep_audio, resolution, seconds):
        """Build distinct provider payloads without generic guessed field passthrough."""
        p = self.cfg.provider
        cap = edit_capability(p, model)
        if not cap or len(image_urls) > cap.max_images or not prompt.strip() or len(prompt) > cap.prompt_limit:
            raise ValueError('编辑型号、参考数量或提示词长度不符合已核验契约')
        if resolution not in cap.resolutions:
            raise ValueError('编辑分辨率不受支持')
        if cap.transport == 'url' and any(not u.startswith('https://') for u in [video_url, *image_urls]):
            raise ValueError('该编辑接口需要 HTTPS 媒体 URL')
        if p == 'aliyun_bailian':
            path = '/api/v1/services/aigc/video-generation/video-synthesis'
            body = {'model': model, 'input': {'prompt': prompt, 'media': [
                {'type': 'video', 'url': video_url},
                *[{'type': 'reference_image', 'url': u} for u in image_urls]]},
                'parameters': {'resolution': resolution, 'duration': 0,
                    'audio_setting': 'origin' if keep_audio else 'auto', 'prompt_extend': False}}
        elif p == 'kling':
            path = '/omni-video/' + model
            body = {'contents': [{'type': 'prompt', 'text': prompt},
                {'type': 'base_video', 'url': video_url, 'id': 'video_1'},
                *[{'type': 'refer_image', 'url': u, 'id': f'image_{i}'} for i,u in enumerate(image_urls,1)]],
                'settings': {'resolution': resolution, 'audio': 'original' if keep_audio else 'off'}}
            if model == 'kling-3.0-omni':
                body['settings']['multi_shot'] = False
        elif p == 'vidu':
            path = '/ent/v2/reference2video'
            body = {'model': model, 'prompt': prompt, 'subjects': [
                {'name': 'Video1', 'videos': [video_url]},
                *[{'name': f'Image{i}', 'images': [u]} for i,u in enumerate(image_urls,1)]],
                'resolution': resolution, 'duration': seconds, 'audio': False, 'off_peak': False}
        elif p in ('volcengine','minimax'):
            path = '/contents/generations/tasks' if p == 'volcengine' else '/v2/video_generation'
            body = {'model': model, 'content': [{'type': 'text', 'text': prompt},
                {'type': 'video_url', 'video_url': {'url': video_url}, 'role': 'reference_video'},
                *[{'type': 'image_url', 'image_url': {'url': u}, 'role': 'reference_image'} for u in image_urls]],
                'resolution': resolution, 'duration': -1 if p == 'volcengine' else seconds, 'ratio': 'adaptive'}
            if p == 'volcengine':
                body['omni_reference_task_type'] = 'edit'
        else:
            raise ValueError('未实现该编辑协议')
        data = await self._request('POST', path, json=body)
        task_id = ((data.get('output') or {}).get('task_id') if p == 'aliyun_bailian' else
            (data.get('data') or {}).get('id') if p == 'kling' else
            data.get('task_id') if p in ('vidu','minimax') else data.get('id'))
        if not isinstance(task_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}', task_id):
            raise ValueError('提交结果未知：缺少有效任务ID，请勿重复付费提交')
        return {'request_id': task_id}

    async def _read(self, receipt):
        """Fetch only the persisted task; reject malformed IDs and mismatched query results."""
        task_id = receipt.get('request_id', '')
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}', task_id):
            raise ValueError('无效供应商任务ID')
        p = self.cfg.provider
        if p == 'kling':
            data = await self._request('GET', '/tasks', params={'task_ids': task_id})
            rows = data.get('data')
            if not isinstance(rows, list):
                raise ValueError('可灵任务查询返回结构不符')
            row = next((r for r in rows if r.get('id') == task_id), None)
            if row is None:
                raise ValueError('可灵查询未返回目标任务')
            return row
        paths = {'aliyun_bailian': '/api/v1/tasks/', 'vidu': '/ent/v2/tasks/',
            'volcengine': '/contents/generations/tasks/', 'minimax': '/v2/query/video_generation/'}
        data = await self._request('GET', paths[p] + task_id + ('/creations' if p == 'vidu' else ''))
        return data.get('output', {}) if p == 'aliyun_bailian' else data.get('task', {}) if p == 'minimax' else data

    async def status(self, receipt):
        """Normalize terminal states while leaving unknown states visible and non-retryable."""
        data = await self._read(receipt)
        state = data.get('task_status') or data.get('state') or data.get('status')
        if state in ('SUCCEEDED','succeeded','success'):
            return {'status': 'COMPLETED', 'usage': data.get('usage')}
        if state in ('FAILED','CANCELED','failed','cancelled','canceled','expired'):
            return {'status': 'COMPLETED', 'error': data.get('message') or data.get('error') or data.get('err_code') or state}
        return {'status': {'PENDING':'IN_QUEUE','RUNNING':'IN_PROGRESS','submitted':'IN_QUEUE',
            'processing':'IN_PROGRESS','created':'IN_QUEUE','queueing':'IN_QUEUE','queued':'IN_QUEUE',
            'running':'IN_PROGRESS'}.get(state, state)}

    async def result(self, receipt):
        """Extract the documented video field, never authenticate output downloads."""
        data = await self._read(receipt)
        p = self.cfg.provider
        if p == 'kling':
            url = next((x.get('url') for x in data.get('outputs',[]) if x.get('type') == 'video'), None)
        elif p == 'aliyun_bailian':
            url = data.get('video_url')
        elif p == 'vidu':
            rows = data.get('creations') or []
            url = rows[0].get('url') if rows else None
        else:
            url = (data.get('content') or {}).get('video_url' if p == 'volcengine' else 'url')
        if not isinstance(url, str) or not url.startswith('https://'):
            raise ValueError('编辑任务未返回有效HTTPS视频地址')
        return url

    async def cancel(self, receipt):
        """Do not invent cancellation endpoints or delete remote results; local cancellation is explicit."""
        return {'status': 'REMOTE_CANCELLATION_NOT_IMPLEMENTED'}
