"""Validate downloaded media bytes before archiving web-generated results."""
from io import BytesIO
from pathlib import Path
import json,math,subprocess,tempfile
from anyio import to_thread
from fastapi import HTTPException
from PIL import Image


def inspect_image(data):
    """Inspect real image format and dimensions; ignore the claimed filename/MIME."""
    try:
        with Image.open(BytesIO(data)) as image:
            kind=image.format;width,height=image.size;image.verify()
            if kind not in ['PNG','JPEG','WEBP']:raise ValueError('Unsupported format')
        return {'extension':{'PNG':'png','JPEG':'jpg','WEBP':'webp'}[kind],'mime':Image.MIME[kind],'width':width,'height':height,'duration_ms':None}
    except Exception as error:raise HTTPException(422,'生成结果不是有效PNG/JPEG/WebP图片') from error


def _probe_video(data):
    """Probe only a local temporary file with ffprobe; never execute shell text or remote URLs."""
    with tempfile.TemporaryDirectory(prefix='jellyfish-web-video-') as directory:
        path=Path(directory)/'result.mp4';path.write_bytes(data)
        process=subprocess.run(['ffprobe','-protocol_whitelist','file','-v','error','-show_streams','-show_format','-of','json',str(path)],capture_output=True,text=True,timeout=30,check=True)
        info=json.loads(process.stdout)
        streams=[stream for stream in info.get('streams',[]) if stream.get('codec_type')=='video']
        if not streams or 'mp4' not in info.get('format',{}).get('format_name','').split(','):raise ValueError('Not MP4 video')
        stream=streams[0];seconds=float(info['format'].get('duration',0))
        if not math.isfinite(seconds) or not 0<seconds<=600 or not stream.get('width') or not stream.get('height'):raise ValueError('Invalid video metadata')
        return {'extension':'mp4','mime':'video/mp4','width':stream['width'],'height':stream['height'],'duration_ms':round(seconds*1000)}


async def inspect_media(data,modality):
    """Bound upload processing and move CPU/process work off the API event loop."""
    if modality=='image':return await to_thread.run_sync(inspect_image,data)
    try:return await to_thread.run_sync(_probe_video,data)
    except Exception as error:raise HTTPException(422,'生成结果不是可解析的MP4视频') from error

def video_spec_issues(request,metadata):
    """Keep mismatching originals as history instead of silently adopting them."""
    issues=[]
    # Allow container/frame rounding, not a materially different short-shot duration.
    duration_tolerance = min(0.5, request.duration_seconds * 0.03)
    if abs(metadata['duration_ms']/1000-request.duration_seconds)>duration_tolerance:
        issues.append(f"实际时长与请求不匹配：请求{request.duration_seconds}秒，实际{metadata['duration_ms']/1000:g}秒")
    left,right=map(int,request.aspect_ratio.split(':'))
    if left<=0 or right<=0 or abs((metadata['width']/metadata['height'])/(left/right)-1)>0.03:
        issues.append(f"实际画幅与请求不匹配：请求{request.aspect_ratio}，实际{metadata['width']}x{metadata['height']}")
    if request.resolution:
        import re
        match=re.fullmatch(r'(\d+)[pP]',request.resolution)
        if not match:
            issues.append('请求分辨率尚不能自动核对')
        elif min(metadata['width'],metadata['height'])!=int(match.group(1)):
            issues.append('实际分辨率与请求不匹配')
    return issues
