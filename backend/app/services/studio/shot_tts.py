"""把镜头对白转换为可复用音频资产，并自动加入镜头音轨。"""

from __future__ import annotations

import hashlib
import io
import mimetypes
import wave
from uuid import uuid4

import httpx
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.integrations.response_errors import raise_provider_error
from app.core.db import async_session_maker
from app.core.task_manager import DeliveryMode, SqlAlchemyTaskStore, TaskManager
from app.core.task_manager.types import TaskStatus
from app.models.generation_artifacts import GenerationDispatchOutbox
from app.models.llm import ModelCategoryKey, ModelConfigRevision, Provider, ProviderStatus
from app.models.studio import AudioAsset, FileItem, FileType, Shot, ShotAudioTrack, ShotDialogLine
from app.models.task import GenerationTask, GenerationTaskStatus
from app.models.task_links import GenerationTaskLink
from app.models.types import AudioAssetCategory, FileUsageKind, ShotAudioTrackType
from app.schemas.studio.media_assets import ShotTtsTaskCreate
from app.services.llm import get_model_by_category
from app.services.studio.file_usages import sync_usage_from_shot_context
from app.services.worker.async_task_support import cancel_if_requested_async
from app.services.worker.task_logging import log_task_event, log_task_failure

SHOT_TTS_TASK_KIND = "shot_tts"
SHOT_TTS_RELATION_TYPE = "shot_tts"
QWEN_TTS_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
_ACTIVE_STATUSES = (
    GenerationTaskStatus.pending,
    GenerationTaskStatus.running,
    GenerationTaskStatus.streaming,
)


class _CreateOnlyTask:
    """仅创建持久化任务；真实执行由统一 worker registry 接管。"""

    async def run(self, *args: object, **kwargs: object):  # noqa: ANN001, ANN003
        return None

    async def status(self) -> dict[str, object]:
        return {}

    async def is_done(self) -> bool:
        return False

    async def get_result(self) -> object:
        return None


async def _dialogue_text(db: AsyncSession, *, shot_id: str) -> tuple[str, ShotAudioTrackType]:
    """按对白顺序生成纯朗读文本，并推断对白或旁白音轨类型。"""
    rows = list(
        (
            await db.execute(
                select(ShotDialogLine)
                .where(ShotDialogLine.shot_detail_id == shot_id)
                .order_by(ShotDialogLine.index, ShotDialogLine.id)
            )
        ).scalars().all()
    )
    text = "\n".join(line.text.strip() for line in rows if line.text and line.text.strip())
    modes = {str(getattr(line.line_mode, "value", line.line_mode)) for line in rows}
    track_type = (
        ShotAudioTrackType.narration
        if modes and modes.issubset({"VOICE_OVER", "OFF_SCREEN"})
        else ShotAudioTrackType.dialogue
    )
    return text, track_type


async def create_shot_tts_task(
    db: AsyncSession,
    *,
    shot_id: str,
    body: ShotTtsTaskCreate,
) -> tuple[str, TaskStatus, bool]:
    """冻结语音模型 revision 并幂等创建配音任务，payload 不包含 API Key。"""
    if await db.get(Shot, shot_id) is None:
        raise LookupError("镜头不存在")
    dialogue_text, track_type = await _dialogue_text(db, shot_id=shot_id)
    text = (body.text or dialogue_text).strip()
    if not text:
        raise ValueError("当前镜头没有可用于配音的对白，请先录入对白或填写覆盖文本")
    model = await get_model_by_category(
        db,
        ModelCategoryKey.audio,
        model_or_id=body.model_id,
        allow_default_fallback=body.model_id is None,
    )
    if not model.current_revision_id:
        raise ValueError("语音模型缺少配置 revision，请保存一次模型配置后重试")
    revision = await db.get(ModelConfigRevision, model.current_revision_id)
    if revision is None or revision.category != ModelCategoryKey.audio:
        raise ValueError("语音模型配置 revision 无效")
    if revision.provider_key == "minimax":
        from app.core.integrations.minimax_speech import build_speech_request
        build_speech_request(model=revision.model_name, params=dict(revision.model_params or {}),
            text=text, voice=body.voice or "", instruction=body.instruction or "", language_type=body.language_type or "Chinese")
    elif revision.provider_key != "aliyun_bailian":
        raise ValueError("此供应商尚未接通镜头配音，未创建收费任务")

    existing = (
        await db.execute(
            select(GenerationTask)
            .join(GenerationTaskLink, GenerationTaskLink.task_id == GenerationTask.id)
            .where(
                GenerationTaskLink.relation_type == SHOT_TTS_RELATION_TYPE,
                GenerationTaskLink.relation_entity_id == shot_id,
                GenerationTask.status.in_(_ACTIVE_STATUSES),
            )
            .limit(1)
        )
    ).scalars().first()
    if existing is not None:
        value = existing.status.value if hasattr(existing.status, "value") else str(existing.status)
        return existing.id, TaskStatus(value), True

    manager = TaskManager(store=SqlAlchemyTaskStore(db), strategies={})
    record = await manager.create(
        task=_CreateOnlyTask(),
        mode=DeliveryMode.async_polling,
        task_kind=SHOT_TTS_TASK_KIND,
        run_args={
            "shot_id": shot_id,
            "model_revision_id": revision.id,
            "text": text,
            "voice": (body.voice or "").strip(),
            "instruction": (body.instruction or "").strip(),
            "language_type": body.language_type,
            "track_type": track_type.value,
        },
    )
    db.add(
        GenerationTaskLink(
            task_id=record.id,
            resource_type="audio",
            relation_type=SHOT_TTS_RELATION_TYPE,
            relation_entity_id=shot_id,
        )
    )
    db.add(GenerationDispatchOutbox(task_id=record.id, payload={"task_id": record.id}))
    await db.flush()
    return record.id, record.status, False


def _provider_id(credential_ref: str) -> str:
    """解析不含密钥的 provider credential reference。"""
    prefix, separator, provider_id = credential_ref.partition(":")
    if prefix != "provider" or separator != ":" or not provider_id:
        raise RuntimeError("语音模型凭据引用无效")
    return provider_id


def _tts_request(revision: ModelConfigRevision, run_args: dict) -> tuple[str, dict[str, object]]:
    """按阿里百炼模型系列构建官方 HTTP 请求，不混用两类端点。"""
    params = dict(revision.model_params or {})
    model_name = revision.model_name.strip()
    text = str(run_args.get("text") or "").strip()
    voice = str(run_args.get("voice") or params.get("voice") or "").strip()
    instruction = str(run_args.get("instruction") or "").strip()
    lower_name = model_name.lower()

    if lower_name.startswith("qwen3-tts") or lower_name.startswith("qwen-tts"):
        endpoint = str(params.get("audio_endpoint") or QWEN_TTS_ENDPOINT).strip()
        input_payload: dict[str, object] = {
            "text": text,
            "voice": voice or "Cherry",
            "language_type": str(run_args.get("language_type") or "Chinese"),
        }
        if instruction:
            if not lower_name.startswith("qwen3-tts-instruct-"):
                raise ValueError("当前 Qwen-TTS 模型未确认支持指令控制，请选择 instruct 模型或清空配音指令")
            input_payload["instructions"] = instruction
            input_payload["optimize_instructions"] = bool(params.get("optimize_instructions", True))
        return endpoint, {"model": model_name, "input": input_payload}

    if not lower_name.startswith(("qwen-audio-", "cosyvoice-")):
        raise ValueError("当前音频模型尚无已验证的 HTTP TTS 适配，不能套用其他模型的请求格式")
    endpoint = str(params.get("audio_endpoint") or "").strip()
    if not endpoint:
        raise RuntimeError(
            "Qwen-Audio-TTS/CosyVoice 需要在模型参数 JSON 中配置 audio_endpoint（含百炼 WorkspaceId 的完整地址）"
        )
    if not voice:
        raise RuntimeError("当前语音模型需要 voice，请在模型参数或本次生成中配置音色")
    input_payload = {
        "text": text,
        "voice": voice,
        "format": str(params.get("format") or "wav"),
        "sample_rate": int(params.get("sample_rate") or 24000),
    }
    if instruction:
        input_payload["instruction"] = instruction
    return endpoint, {"model": model_name, "input": input_payload}


def _audio_url(payload: dict[str, object]) -> str:
    """兼容提取百炼不同 TTS 系列响应中的临时音频 URL。"""
    output = payload.get("output") if isinstance(payload.get("output"), dict) else {}
    audio = output.get("audio") if isinstance(output, dict) and isinstance(output.get("audio"), dict) else {}
    candidates = [
        audio.get("url") if isinstance(audio, dict) else None,
        output.get("audio_url") if isinstance(output, dict) else None,
        output.get("url") if isinstance(output, dict) else None,
        payload.get("url"),
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    raise RuntimeError("语音供应商响应中没有可下载的音频 URL")


def _wav_duration_ms(content: bytes) -> int | None:
    """无需外部进程读取 WAV 时长；其他容器格式暂留空。"""
    try:
        with wave.open(io.BytesIO(content), "rb") as source:
            return round(source.getnframes() / source.getframerate() * 1000)
    except (wave.Error, EOFError, ZeroDivisionError):
        return None


async def _call_aliyun_tts(
    *,
    revision: ModelConfigRevision,
    api_key: str,
    run_args: dict,
) -> tuple[bytes, str, str]:
    """调用阿里百炼非流式 TTS，并立即下载 24 小时有效的结果 URL。"""
    endpoint, request_body = _tts_request(revision, run_args)
    timeout = httpx.Timeout(180.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.post(
            endpoint,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=request_body,
        )
        raise_provider_error(response, provider="aliyun_bailian/audio", api_key=api_key)
        url = _audio_url(response.json())
        audio_response = await client.get(url)
        if audio_response.is_error:
            raise RuntimeError(f"百炼音频下载失败（HTTP {audio_response.status_code}）")
        content_type = audio_response.headers.get("content-type", "audio/wav").split(";", 1)[0]
        if not audio_response.content or not (content_type.startswith("audio/") or content_type == "application/octet-stream"):
            raise RuntimeError("音频下载结果为空或不是音频，未保存为生成成功")
        extension = mimetypes.guess_extension(content_type) or ".wav"
        return audio_response.content, content_type, extension


async def _persist_tts_result(
    db: AsyncSession,
    *,
    task_id: str,
    shot_id: str,
    text: str,
    track_type: ShotAudioTrackType,
    content: bytes,
    content_type: str,
    extension: str,
) -> dict[str, object]:
    """将生成音频固化到 RustFS、资产库和当前镜头音轨。"""
    file_id = uuid4().hex
    object_key = f"generated-audio/{shot_id}/{file_id}{extension}"
    stored = await storage.upload_file(key=object_key, data=content, content_type=content_type)
    duration_ms = _wav_duration_ms(content)
    file_item = FileItem(
        id=file_id,
        type=FileType.audio,
        name=f"镜头配音-{shot_id[:8]}",
        thumbnail=stored.url,
        tags=["AI配音", "镜头音轨"],
        storage_key=object_key,
        original_name=f"shot-{shot_id}-tts{extension}",
        mime_type=content_type,
        size_bytes=len(content),
        duration_ms=duration_ms,
        checksum=hashlib.sha256(content).hexdigest(),
    )
    db.add(file_item)
    await db.flush()
    category = AudioAssetCategory.narration if track_type == ShotAudioTrackType.narration else AudioAssetCategory.voice
    asset = AudioAsset(
        id=uuid4().hex,
        name=f"AI配音-{shot_id[:8]}",
        category=category,
        file_id=file_id,
        description="由镜头对白自动生成",
        transcript=text,
        tags=["AI生成"],
        language="zh-CN",
        duration_ms=duration_ms,
    )
    db.add(asset)
    sort_index = int(
        (
            await db.execute(
                select(func.max(ShotAudioTrack.sort_index)).where(ShotAudioTrack.shot_id == shot_id)
            )
        ).scalar()
        or -1
    ) + 1
    track = ShotAudioTrack(
        shot_id=shot_id,
        audio_asset_id=asset.id,
        track_type=track_type,
        start_ms=0,
        end_ms=duration_ms,
        volume=1.0,
        sort_index=sort_index,
    )
    db.add(track)
    await db.flush()
    await sync_usage_from_shot_context(
        db,
        file_id=file_id,
        shot_id=shot_id,
        usage_kind=FileUsageKind.audio_track,
        source_ref=str(track.id),
    )
    await db.execute(update(GenerationTaskLink).where(GenerationTaskLink.task_id == task_id).values(file_id=file_id))
    return {
        "file_id": file_id,
        "audio_asset_id": asset.id,
        "track_id": track.id,
        "preview_path": f"/api/v1/studio/files/{file_id}/preview",
        "download_path": f"/api/v1/studio/files/{file_id}/download",
        "duration_ms": duration_ms,
    }


async def run_shot_tts_task(task_id: str, run_args: dict) -> None:
    """执行配音任务并持久化成功、失败或取消终态。"""
    async with async_session_maker() as db:
        store = SqlAlchemyTaskStore(db)
        try:
            await store.set_status(task_id, TaskStatus.running)
            await store.set_progress(task_id, 5)
            await db.commit()
            if await cancel_if_requested_async(store=store, task_id=task_id, session=db):
                return
            revision_id = str(run_args.get("model_revision_id") or "")
            revision = await db.get(ModelConfigRevision, revision_id)
            if revision is None or revision.category != ModelCategoryKey.audio:
                raise RuntimeError("语音模型 revision 不存在或类别错误")
            if revision.provider_key not in {"aliyun_bailian", "minimax"}:
                raise RuntimeError(f"当前未打通该语音供应商：{revision.provider_key}")
            provider = await db.get(Provider, _provider_id(revision.credential_ref))
            if provider is None or provider.status == ProviderStatus.disabled:
                raise RuntimeError("语音供应商不存在或已禁用")
            api_key = (provider.api_key or "").strip()
            if not api_key:
                raise RuntimeError("语音供应商 API Key 为空")
            if revision.provider_key == "minimax":
                from app.core.integrations.minimax_speech import generate_speech
                content, content_type, extension = await generate_speech(
                    model=revision.model_name, params=dict(revision.model_params or {}), api_key=api_key,
                    text=str(run_args.get("text") or ""), voice=str(run_args.get("voice") or ""),
                    instruction=str(run_args.get("instruction") or ""), language_type=str(run_args.get("language_type") or "Chinese"))
            else:
                content, content_type, extension = await _call_aliyun_tts(
                    revision=revision, api_key=api_key, run_args=run_args)
            if await cancel_if_requested_async(store=store, task_id=task_id, session=db):
                return
            await store.set_progress(task_id, 70)
            result = await _persist_tts_result(
                db,
                task_id=task_id,
                shot_id=str(run_args.get("shot_id") or ""),
                text=str(run_args.get("text") or ""),
                track_type=ShotAudioTrackType(str(run_args.get("track_type") or "dialogue")),
                content=content,
                content_type=content_type,
                extension=extension,
            )
            if await cancel_if_requested_async(store=store, task_id=task_id, session=db):
                return
            await store.set_result(task_id, result)
            await store.set_progress(task_id, 100)
            await store.set_status(task_id, TaskStatus.succeeded)
            await db.commit()
            log_task_event(SHOT_TTS_TASK_KIND, task_id, "succeeded")
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            await store.set_error(task_id, str(exc))
            await store.set_status(task_id, TaskStatus.failed)
            await db.commit()
            log_task_failure(SHOT_TTS_TASK_KIND, task_id, str(exc))


__all__ = ["SHOT_TTS_RELATION_TYPE", "SHOT_TTS_TASK_KIND", "create_shot_tts_task", "run_shot_tts_task"]
