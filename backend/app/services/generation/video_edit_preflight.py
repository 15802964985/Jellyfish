"""Free local editing checks shared with execution; never send media to a model."""
from io import BytesIO
from PIL import Image
from app.services.generation.files.types import ResolvedMediaContent
from app.core.integrations.video_edit_registry import edit_capability, VIDEO_EDIT_MODELS

async def validate_edit_inputs(provider: str, source: ResolvedMediaContent,
                               images: list[ResolvedMediaContent], positions: list[float], *, model=None) -> dict:
    """Probe real content and reject unsupported media before billable submission, without cropping."""
    from app.services.generation.video_edit_runtime import probe_edit_video
    cap = edit_capability(provider, model or VIDEO_EDIT_MODELS.get(provider,''))
    if not cap:
        raise ValueError('尚未实现该型号的视频编辑')
    if source.content_type not in ('video/mp4','video/quicktime'):
        raise ValueError('源视频必须是 MP4/MOV')
    metadata = await probe_edit_video(source.content, provider)
    seconds, width, height = metadata['seconds'], metadata['width'], metadata['height']
    if not cap.min_seconds <= seconds <= cap.max_seconds or len(source.content) > cap.max_mb*1024*1024:
        raise ValueError(f'当前型号原片要求{cap.min_seconds}–{cap.max_seconds}秒、{cap.max_mb}MB内；不会自动裁剪')
    if len(images) > cap.max_images:
        raise ValueError(f'当前编辑模型最多支持 {cap.max_images} 张参考图')
    if any(image.content_type not in ('image/jpeg','image/png','image/webp') for image in images):
        raise ValueError('参考图仅支持 JPG、PNG、WebP')
    if provider != 'runway' and positions:
        raise ValueError('当前编辑模型不接受 Runway 定时参考参数')
    if provider == 'runway':
        if len(positions) != len(images) or any(not 0 <= t < seconds for t in positions):
            raise ValueError('每张 Runway 参考图需要位于源视频时长内的秒数')
        for file in [source,*images]:
            encoded_size = len(f'data:{file.content_type};base64,') + 4*((len(file.content)+2)//3)
            if encoded_size > 5*1024*1024:
                raise ValueError('Runway 当前直传单文件编码后超过 5MB，请准备更小片段或更换编辑模型')
    if provider in ('fal','runway'):
        return metadata
    limits = {'aliyun_bailian':(240,4096,.125,8), 'kling':(700,4553,.4,2),
        'vidu':(128,8192,.25,4), 'volcengine':(300,6000,.4,2.5), 'minimax':(256,5760,.4,2.5)}
    lo,hi,rlo,rhi = limits[provider]
    if not all(lo<=v<=hi for v in (width,height)) or not rlo <= width/height <= rhi:
        raise ValueError('源视频尺寸或比例不符合当前编辑模型要求')
    if provider in ('kling','volcengine','minimax') and not 23.97<=metadata.get('fps',0)<=60:
        raise ValueError('源视频帧率必须在24–60FPS附近；不会自动转码')
    if provider == 'kling' and width*height > 8294400:
        raise ValueError('可灵原片总像素超限')
    if provider == 'volcengine' and not 407696<=width*height<=8295044:
        raise ValueError('Seedance原片总像素不符合要求')
    if provider == 'minimax' and metadata.get('codec') not in ('h264','hevc'):
        raise ValueError('H3原片编码必须为H.264或H.265')
    if provider == 'minimax' and 4*sum((len(f.content)+2)//3 for f in [source,*images]) > 63*1024*1024:
        raise ValueError('H3直传编码后请求过大，请减少素材体积')
    for file in images:
        if len(file.content) > (30 if provider == 'minimax' else 10 if provider == 'kling' else 20)*1024*1024:
            raise ValueError('参考图片超过当前编辑模型文件大小限制')
        with Image.open(BytesIO(file.content)) as image:
            w,h = image.size
            imin,imax = (240,8000) if provider == 'aliyun_bailian' else (256,5760) if provider == 'minimax' else (300,6000) if provider == 'volcengine' else (128,8000)
            if not imin<=w<=imax or not imin<=h<=imax or not rlo<=w/h<=rhi:
                raise ValueError('参考图片尺寸或比例不符合当前模型；请明确调整素材后重新选择')
            if provider == 'aliyun_bailian' and ('A' in image.getbands() or 'transparency' in image.info):
                raise ValueError('Wan参考图不支持透明通道')
            image.verify()
    return metadata
