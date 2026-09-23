"""Editing catalogue, defaults, free preflight and frozen price basis."""
from decimal import Decimal
from sqlalchemy import select
from fastapi import HTTPException
from app.models.llm import Model, Provider, ModelConfigRevision
from app.core.contracts.video_edit import VideoEditOptions, VideoEditModelRead, VideoEditCatalogRead, VideoEditPreviewRead
from app.core.integrations.video_edit_registry import CAPABILITIES, edit_capability, editing_base_url
from app.services.llm.provider_registry import resolve_provider_key

def selected_options(cap, params, options):
    """Keep defaults per editing model; source-length modes reject arbitrary duration."""
    defaults = (params or {}).get('video_edit_defaults') or {}
    if not isinstance(defaults, dict):
        raise ValueError('video_edit_defaults 必须是对象')
    resolution = options.resolution or defaults.get('resolution') or (cap.resolutions[0] if cap.resolutions else None)
    seconds = options.seconds if options.seconds is not None else defaults.get('seconds')
    if cap.durations and seconds is None:
        seconds = 5 if 5 in cap.durations else cap.durations[0]
    if resolution is not None and resolution not in cap.resolutions:
        raise ValueError('所选/默认分辨率不适用于当前编辑模型')
    if seconds is not None and (isinstance(seconds,bool) or seconds not in cap.durations):
        raise ValueError('所选/默认时长不适用于当前编辑模式；保持原片时长的型号不能指定时长')
    return VideoEditOptions(resolution=resolution, seconds=seconds)

async def model_catalog(db):
    """Report configured exclusions separately from importable exact editing candidates."""
    rows = (await db.execute(select(Model, Provider).join(Provider, Model.provider_id == Provider.id)
        .where(Model.category == 'video').order_by(Model.name))).all()
    result = []
    for model, provider in rows:
        key, reason, cap = '', '', None
        opts = VideoEditOptions()
        try:
            key = resolve_provider_key(provider)
            cap = edit_capability(key, model.name)
            if not cap:
                reason = {
                    ('aliyun_bailian', 'happyhorse-1.1-i2v'): '型号不适用：官方输入为一张首帧图片＋文字，不接受原视频编辑输入。请配置专用视频编辑型号。',
                    ('volcengine', 'doubao-seedance-1.5-pro'): '型号不适用：官方支持文生、首帧、首尾帧生成，未提供原视频编辑模式。请配置专用视频编辑型号。',
                }.get((key, model.name), '接入待核验：当前系统尚未为此精确型号接通原视频编辑；不代表该厂商所有型号都不支持。')
                raise ValueError(reason)
            if provider.status == 'disabled':
                raise ValueError('供应商已禁用')
            if not provider.api_key:
                raise ValueError('尚未配置供应商API凭据')
            editing_base_url(key, provider.video_base_url or provider.base_url)
            opts = selected_options(cap, model.params, opts)
        except (ValueError, HTTPException) as exc:
            reason = str(getattr(exc,'detail',exc))
        result.append(VideoEditModelRead(model_id=model.id, revision_id=model.current_revision_id,
            provider=key, provider_name=provider.name, model_name=model.name, available=not reason, reason=reason,
            resolutions=list(cap.resolutions) if cap else [], durations=list(cap.durations) if cap else [],
            default_resolution=opts.resolution, default_seconds=opts.seconds,
            max_images=cap.max_images if cap else 0, timed_images=key == 'runway',
            source_label=cap.source_label if cap else '', image_label=cap.image_label if cap else '',
            source_url=cap.source_url if cap else {
                ('aliyun_bailian', 'happyhorse-1.1-i2v'): 'https://help.aliyun.com/zh/model-studio/happyhorse-image-to-video-api-reference',
                ('volcengine', 'doubao-seedance-1.5-pro'): 'https://www.volcengine.com/docs/82379/1520757',
            }.get((key, model.name), ''), instructions=cap.instructions if cap else ''))
    return VideoEditCatalogRead(models=result, candidates=[
        {'provider':c.provider,'model_name':c.model,'source_url':c.source_url,
         'requirements':c.instructions} for c in CAPABILITIES])

async def estimate_edit(db, revision, cap, metadata, options):
    """Quote only verified regional list prices; unknown tariffs are never zero."""
    amount, currency, rate, quantity, source = None, None, None, None, cap.source_url
    if cap.provider == 'aliyun_bailian':
        quantity = Decimal(str(metadata['seconds'])) * 2
        rate = Decimal('0.6' if options.resolution == '720P' else '1')
        currency, source = 'CNY', 'https://help.aliyun.com/zh/model-studio/wan2-7-videoedit'
    elif cap.provider == 'runway':
        quantity, rate, currency = max(Decimal('2'), Decimal(str(metadata['seconds']))), Decimal('28'), 'Runway Credits'
        source = 'https://docs.dev.runwayml.com/guides/pricing/'
    if rate is not None:
        from hashlib import sha256
        from app.models.model_governance import ModelGovernanceRecord
        row = await db.get(ModelGovernanceRecord, sha256(source.encode()).hexdigest()) if db is not None else None
        if not row or row.data.get('status') != 'changed_requires_validation':
            amount = str(quantity * rate)
    return {'status':'estimated' if amount is not None else 'unknown',
        'amount':amount,'currency':currency,'unit_rate':str(rate) if rate is not None else None,
        'quantity':str(quantity) if quantity is not None else None,
        'input_seconds':metadata['seconds'],'output_seconds':options.seconds or metadata['seconds'],
        'source':source,'checked_at':'2026-09-09','model_name':revision.model_name,
        'resolution':options.resolution,
        'note':('北京按量原价：输入与输出总秒数计费；' if cap.provider == 'aliyun_bailian' else '') +
            ('每秒28 Credits，最低56 Credits；' if cap.provider == 'runway' else '') +
            '不含优惠、账户余额或套餐抵扣，实际扣费以供应商账单为准；未知不是免费。'}

async def preflight_edit(db, *, model_id, media, options, positions, keep_audio=True, expected_revision=None):
    """Validate local files, billing origin and frozen defaults before any external media transfer."""
    from app.services.generation.files import FileResolver
    from app.services.generation.video_edit_preflight import validate_edit_inputs
    model = await db.get(Model, model_id)
    provider = await db.get(Provider, model.provider_id) if model else None
    if not model or not provider or provider.status == 'disabled' or model.category != 'video' or not provider.api_key:
        raise HTTPException(status_code=422, detail='编辑模型或供应商凭据未配置/已禁用')
    if expected_revision and model.current_revision_id != expected_revision:
        raise HTTPException(status_code=409, detail='模型已变化，请刷新参数并重新检查')
    revision = await db.get(ModelConfigRevision, model.current_revision_id)
    if not revision:
        raise HTTPException(status_code=422, detail='模型缺少配置版本，请保存模型配置')
    try:
        cap = edit_capability(revision.provider_key, revision.model_name)
        if not cap:
            raise ValueError('此精确型号尚未接通视频编辑')
        endpoint = (revision.endpoint_config or {}).get('video_base_url') or (revision.endpoint_config or {}).get('base_url')
        editing_base_url(cap.provider, endpoint)
        chosen = selected_options(cap, revision.model_params, options)
        resolver = FileResolver(db)
        source = await resolver.resolve(media.source)
        images = await resolver.resolve_many(sorted(media.references,key=lambda r:r.ordinal))
        metadata = await validate_edit_inputs(cap.provider, source, images, positions, model=cap.model)
        if keep_audio and metadata['has_audio'] and cap.local_audio and chosen.seconds and abs(chosen.seconds-metadata['seconds']) > .2:
            raise ValueError('保留原音轨需要输出与原片时长相同；请调整时长或取消保留原音轨')
        warnings = ['仅检查文件规格，不验证账号余额、权限或最终编辑质量。']
        if cap.transport == 'url':
            from app.services.generation.video_edit_media import validate_media_origin
            try:
                validate_media_origin()
            except ValueError as exc:
                warnings.append(str(exc))
        estimate = await estimate_edit(db, revision, cap, metadata, chosen)
        return VideoEditPreviewRead(revision_id=revision.id, options=chosen, estimate=estimate,
            warnings=warnings, **{k:metadata[k] for k in ('seconds','width','height','has_audio')})
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
