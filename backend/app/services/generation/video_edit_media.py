"""Short-lived signed object reads for URL-only editing APIs; never publish a bucket."""
import asyncio
import ipaddress
from urllib.parse import urlsplit
from app.config import settings
from app.core import storage

def validate_media_origin():
    """Require an explicitly configured public HTTPS S3 endpoint, not a localhost rewrite."""
    value = (settings.s3_public_base_url or '').rstrip('/')
    p = urlsplit(value)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.query or p.fragment:
        raise ValueError('此模型需公网HTTPS媒体地址：请配置S3_PUBLIC_BASE_URL为可访问的对象存储桶地址；当前不能提交该模型')
    try:
        if not ipaddress.ip_address(p.hostname).is_global:
            raise ValueError('媒体地址不能为内网或本机地址')
    except ValueError as exc:
        if '不能' in str(exc):
            raise
    if '.' not in p.hostname or p.hostname.endswith(('.localhost','.local','.internal')):
        raise ValueError('媒体地址不能为内网或本机地址')
    # Only the ordinary S3 /bucket URL is supported; proxy paths need an explicit future adapter.
    if p.path.rstrip('/') != '/' + settings.s3_bucket_name:
        raise ValueError('签名媒体地址须为 https://公网S3域名/桶名，不支持任意反向代理路径')
    return f'{p.scheme}://{p.netloc}'

async def signed_edit_url(db, file_id):
    """Sign the selected existing object for two hours without changing ACL or copying content."""
    import boto3
    from botocore.config import Config
    from app.models.studio import FileItem
    endpoint = validate_media_origin()
    file = await db.get(FileItem, file_id)
    if not file or not file.storage_key:
        raise ValueError('素材没有可签名的对象存储文件')
    def sign():
        """Generate a signature locally; this does not upload or fetch user data."""
        client = boto3.client('s3', endpoint_url=endpoint, region_name=settings.s3_region_name,
            aws_access_key_id=settings.s3_access_key_id, aws_secret_access_key=settings.s3_secret_access_key,
            config=Config(signature_version='s3v4', s3={'addressing_style':'path'}))
        return client.generate_presigned_url('get_object',
            Params={'Bucket':settings.s3_bucket_name,'Key':storage._normalize_key(file.storage_key)},
            ExpiresIn=7200)
    return await asyncio.to_thread(sign)
