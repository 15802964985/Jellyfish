"""Exact documented editing protocols, shared by catalogue, UI, gate and runtime."""
from dataclasses import dataclass
from urllib.parse import urlsplit
from app.core.integrations.fal_video_edit import FalVideoEditAdapter
from app.core.integrations.runway_video_edit import RunwayVideoEditAdapter

VIDEO_EDIT_MODELS = {'fal': 'fal-ai/kling-video/o3/pro/video-to-video/edit', 'runway': 'aleph2'}
VIDEO_EDIT_ORIGINS = {'fal': 'https://queue.fal.run', 'runway': 'https://api.dev.runwayml.com'}
VIDEO_EDIT_ADAPTERS = {'fal': FalVideoEditAdapter, 'runway': RunwayVideoEditAdapter}

@dataclass(frozen=True)
class EditCapability:
    """Conservative implemented subset of a specific official editing API."""
    provider: str
    model: str
    resolutions: tuple[str, ...]
    durations: tuple[int, ...]
    max_images: int
    min_seconds: float
    max_seconds: float
    max_mb: int
    source_url: str
    transport: str = "data"
    prompt_limit: int = 5000
    local_audio: bool = False
    edit_only: bool = True
    source_label: str = "@Video1"
    image_label: str = "@Image{n}"
    instructions: str = ""

CAPABILITIES = (
    EditCapability('fal', VIDEO_EDIT_MODELS['fal'], (), (), 4, 3, 15, 200,
        'https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit/api',
        instructions='原片3–15秒、720–3840px；按源片规格编辑。'),
    EditCapability('runway', 'aleph2', (), (), 5, 2, 30, 200,
        'https://docs.dev.runwayml.com/guides/models/', local_audio=True,
        source_label='原视频', image_label='指导图{n}',
        instructions='原片2–30秒、最高1080p、30FPS；直传文件编码后最多5MB。每张指导图指定时间；保留音轨通过本地合成。'),
    EditCapability('aliyun_bailian', 'wan2.7-videoedit', ('720P','1080P'), (), 4, 2, 10, 100,
        'https://help.aliyun.com/zh/model-studio/wan-video-editing-api-reference',
        transport='url', source_label='原视频', image_label='第{n}张参考图',
        instructions='原片2–10秒、240–4096px、100MB内；保持源片时长，不自动截断。供应商需可访问的签名媒体地址。'),
    EditCapability('kling', 'kling-3.0-omni', ('720p','1080p','4k'), (), 4, 3, 15.5, 200,
        'https://kling.ai/document-api/api/video/3-0-omni/video-omni',
        transport='url', prompt_limit=3072, source_label='@video_1', image_label='@image_{n}',
        instructions='新版Omni编辑；原片3–15.5秒、700–4553px、24–60FPS；不生成新音频，不切多镜头。当前接入最多4张参考图。'),
    EditCapability('kling', 'kling-o1', ('720p','1080p'), (), 4, 3, 10, 200,
        'https://kling.ai/document-api/api/video/o1/video-omni',
        transport='url', prompt_limit=2500, source_label='@video_1', image_label='@image_{n}',
        instructions='新版O1编辑；当前接入3–10秒原片及最多4张参考图，保持原片时长。'),
    EditCapability('vidu', 'viduq2-pro', ('540p','720p','1080p'), tuple(range(1,11)), 4, 5, 5, 20,
        'https://platform.vidu.cn/docs/reference-to-video', local_audio=True, edit_only=False,
        instructions='中国站视频主体编辑；临时源视频必须5秒、20MB内。音轨保留需输出同长并本地合成。'),
    EditCapability('volcengine', 'doubao-seedance-2-5-260628', ('480p','720p','1080p'), (), 9, 4, 30, 200,
        'https://www.volcengine.com/docs/82379/1520757', transport='url', local_audio=True,
        source_label='视频1', image_label='图片{n}',
        instructions='明确edit模式，比例adaptive、时长-1保持原片；原片4–30秒。真人素材需满足官方可信素材规则。'),
    EditCapability('minimax', 'MiniMax-H3', ('768P','2K'), tuple(range(4,16)), 9, 2, 15, 50,
        'https://platform.minimax.cn/docs/api-reference/video-generation-v2-create',
        prompt_limit=7000, local_audio=True, source_label='视频1', image_label='图片{n}',
        instructions='H3 V2多模态编辑：原片2–15秒，输出4–15秒。音轨保留需输出同长并本地合成；不保证像素级保持。'),
)

def edit_capability(provider: str, model: str) -> EditCapability | None:
    """Resolve only verified exact model IDs, never infer editing from a name fragment."""
    return next((c for c in CAPABILITIES if c.provider == provider and c.model == model), None)

def editing_only(provider: str, model: str) -> bool:
    """Keep newly added edit-only models out of ordinary generation/default selection."""
    c = edit_capability(provider, model)
    return bool(c and c.edit_only) or provider in VIDEO_EDIT_MODELS

def editing_base_url(provider: str, endpoint: str | None) -> str:
    """Validate the configured billing destination; never silently switch plan or region."""
    raw = (endpoint or VIDEO_EDIT_ORIGINS.get(provider) or '').rstrip('/')
    p = urlsplit(raw)
    if p.scheme != 'https' or p.username or p.password or p.query or p.fragment or p.port not in (None,443):
        raise ValueError('编辑模型必须配置对应供应商官方 HTTPS 地址')
    host, path = p.hostname or '', p.path.rstrip('/')
    valid = False
    if provider in VIDEO_EDIT_ORIGINS:
        valid = raw == VIDEO_EDIT_ORIGINS[provider]
    elif provider == 'kling':
        valid = host == 'api-beijing.klingai.com' and not path
    elif provider == 'vidu':
        valid = host == 'api.vidu.cn' and not path
    elif provider == 'minimax':
        valid = host == 'api.minimax.cn' and path in ('','/v1')
        raw = raw.removesuffix('/v1')
    elif provider == 'volcengine':
        valid = host == 'ark.cn-beijing.volces.com' and path == '/api/v3'
    elif provider == 'aliyun_bailian':
        valid = (host == 'dashscope.aliyuncs.com' or host.endswith('.cn-beijing.maas.aliyuncs.com')) and not host.startswith('token-plan') and path in ('','/compatible-mode/v1')
        raw = raw.removesuffix('/compatible-mode/v1')
    if not valid:
        raise ValueError('该编辑协议尚未核验此地域/套餐端点；请单独配置官方视频地址，不会自动切换')
    return raw
