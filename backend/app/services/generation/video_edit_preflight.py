"""Free local editing checks shared with execution; never send media to a model."""
from app.services.generation.files.types import ResolvedMediaContent


async def validate_edit_inputs(provider: str, source: ResolvedMediaContent,
                               images: list[ResolvedMediaContent], positions: list[float]) -> dict:
    """Validate real duration/container and protocol limits without transforming user media."""
    from app.services.generation.video_edit_runtime import probe_edit_video
    if provider not in ('fal', 'runway'):
        raise ValueError('尚未实现该供应商的视频编辑')
    if source.content_type not in ('video/mp4', 'video/quicktime'):
        raise ValueError('源视频必须是 MP4/MOV')
    metadata = await probe_edit_video(source.content, provider)
    limit = 5 if provider == 'runway' else 4
    if len(images) > limit:
        raise ValueError(f'当前编辑模型最多支持 {limit} 张参考图')
    if any(image.content_type not in ('image/jpeg', 'image/png', 'image/webp') for image in images):
        raise ValueError('参考图仅支持 JPG、PNG、WebP')
    if provider == 'fal' and positions:
        raise ValueError('fal 编辑不接受 Runway 定时参考参数')
    if provider == 'runway':
        if len(positions) != len(images) or any(not 0 <= t < metadata['seconds'] for t in positions):
            raise ValueError('每张 Runway 参考图需要位于源视频时长内的秒数')
        for file in [source, *images]:
            encoded_size = len(f'data:{file.content_type};base64,') + 4 * ((len(file.content) + 2) // 3)
            if encoded_size > 5 * 1024 * 1024:
                raise ValueError('Runway 当前直传单文件编码后超过 5MB，请准备更小片段或更换编辑模型')
    return metadata
