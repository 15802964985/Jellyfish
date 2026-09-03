"""统一生成实体门禁：将业务提交中的 ID 解析为可执行快照。"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.contracts.generation import (
    GenerationCommand,
    GenerationModality,
    GenerationTargetKind,
    ResolvedGenerationSnapshot,
)
from app.core.contracts.media import ImageMediaInput, MediaReference, VideoMediaInput
from app.core.integrations.video_capabilities import VideoModelCapability, resolve_video_capability
from app.models.experiment_sessions import ExperimentSession
from app.models.llm import Model, ModelCategoryKey, ModelConfigRevision, ModelSettings, Provider, ProviderStatus
from app.models.studio import Shot, ShotDetail, ShotFrameImage
from app.models.studio_asset_images import ActorImage, CharacterImage, CostumeImage, PropImage, SceneImage
from app.models.studio_prompts_files_timeline import FileItem
from app.models.types import FileType
from app.services.generation.prompt_profiles import apply_generation_prompt_profile
from app.services.studio.asset_reference_context import resolve_shot_reference_bundle


@dataclass(frozen=True)
class ResolvedMediaSnapshot:
    """门禁验证后的单个媒体叶子及其不可变内容版本信息。"""

    reference: MediaReference
    content_version: int
    content_hash: str | None


def _iter_media(media: ImageMediaInput | VideoMediaInput | None) -> list[MediaReference]:
    """以稳定顺序摊平媒体结构，分组语义仍由原始强类型结构保留。"""
    if media is None:
        return []
    if isinstance(media, ImageMediaInput):
        return list(media.references)
    items = [reference for reference in [media.frames.first, media.frames.last] if reference]
    items.extend(media.frames.keys)
    for subject in media.subjects:
        items.extend(subject.media)
    return items


class GenerationEntityGate:
    """统一校验目标、模型和媒体引用，不解释用户编辑后的提示词。"""

    async def validate(self, db: AsyncSession, command: GenerationCommand) -> ResolvedGenerationSnapshot:
        """将可验证的提交命令冻结为不含 ORM/凭据的执行快照。"""
        await self._validate_target(db, command)
        model, revision = await self._resolve_model(db, command)
        media, execution_prompt = await self._resolve_asset_references(
            db,
            command=command,
            revision=revision,
        )
        await self._validate_media(db, media)
        prompt_profile = apply_generation_prompt_profile(
            prompt=execution_prompt,
            modality=command.modality,
            target_kind=command.target.kind,
            provider_key=str(revision.provider_key),
            model_name=revision.model_name,
            media=media,
        )
        return ResolvedGenerationSnapshot(
            model_id=model.id,
            model_revision_id=revision.id,
            canonical_target=command.target,
            expected_version_id=await self._target_version(db, command),
            media=media,
            operation_input=command.request.operation_input,
            execution_prompt=prompt_profile.prompt,
            prompt_profile_rules=list(prompt_profile.applied_rules),
            credential_ref=revision.credential_ref,
        )

    async def _resolve_asset_references(
        self,
        db: AsyncSession,
        *,
        command: GenerationCommand,
        revision: ModelConfigRevision,
    ) -> tuple[ImageMediaInput | VideoMediaInput | None, str | None]:
        """让镜头关联附件按模型能力参与生成，同时保留显式用户选择优先级。"""
        target = command.target
        if target.kind not in {
            GenerationTargetKind.shot_video,
            GenerationTargetKind.shot_frame_slot,
        }:
            return command.request.media, command.request.execution_prompt

        media = command.request.media
        capability = VideoModelCapability()
        allow_subjects = False
        if target.kind == GenerationTargetKind.shot_video:
            capability = resolve_video_capability(
                provider=revision.provider_key,  # type: ignore[arg-type]
                model=revision.model_name,
            )
            video_media = media if isinstance(media, VideoMediaInput) else VideoMediaInput()
            has_frame_reference = bool(
                video_media.frames.first
                or video_media.frames.last
                or video_media.frames.keys
            )
            allow_subjects = not video_media.subjects and (
                not has_frame_reference
                or capability.supports_subject_reference_with_frame_reference
            )

        bundle = await resolve_shot_reference_bundle(
            db,
            shot_id=target.entity_id,
            capability=capability,
            allow_subjects=allow_subjects,
        )
        if target.kind == GenerationTargetKind.shot_video and bundle.subjects:
            video_media = media if isinstance(media, VideoMediaInput) else VideoMediaInput()
            media = video_media.model_copy(update={"subjects": bundle.subjects})
        prompt = (command.request.execution_prompt or "").strip()
        if bundle.prompt_context:
            prompt = f"{prompt}\n\n{bundle.prompt_context}".strip()
        return media, prompt or None

    async def _resolve_model(self, db: AsyncSession, command: GenerationCommand) -> tuple[Model, ModelConfigRevision]:
        """选择显式或默认模型，并固定当前 revision 而不是可变模型配置。"""
        model_id = command.request.model_id or await self._default_model_id(db, command.modality)
        model = await db.get(Model, model_id) if model_id else None
        expected_category = ModelCategoryKey(command.modality.value)
        if model is None or model.category != expected_category:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="model_unavailable")
        provider = await db.get(Provider, model.provider_id)
        if provider is None or provider.status == ProviderStatus.disabled:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="model_unavailable")
        revision = await db.get(ModelConfigRevision, model.current_revision_id) if model.current_revision_id else None
        if revision is None or revision.model_id != model.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="model_unavailable")
        return model, revision

    async def _default_model_id(self, db: AsyncSession, modality: GenerationModality) -> str | None:
        """按模态读取唯一默认模型；不存在时由统一错误语义处理。"""
        settings = await db.get(ModelSettings, 1)
        if settings is None:
            return None
        return {
            GenerationModality.text: settings.default_text_model_id,
            GenerationModality.image: settings.default_image_model_id,
            GenerationModality.video: settings.default_video_model_id,
        }[modality]

    async def _validate_media(self, db: AsyncSession, media: ImageMediaInput | VideoMediaInput | None) -> None:
        """验证每个 file_id 存在且声明 media_kind 与 FileItem.type 一致。"""
        for reference in _iter_media(media):
            file_item = await db.get(FileItem, reference.file_id)
            expected_type = {
                "image": FileType.image,
                "video": FileType.video,
                "audio": FileType.audio,
            }[reference.media_kind]
            if file_item is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="file_not_found")
            if file_item.type != expected_type:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="media_role_invalid")

    async def _validate_target(self, db: AsyncSession, command: GenerationCommand) -> None:
        """按封闭 target kind 验证目标/槽位存在，避免 Worker 再猜测业务关系。"""
        target = command.target
        exists = False
        if target.kind == GenerationTargetKind.experiment_session:
            exists = await db.get(ExperimentSession, target.entity_id) is not None
        elif target.kind == GenerationTargetKind.shot_video:
            exists = await db.get(Shot, target.entity_id) is not None
        elif target.kind == GenerationTargetKind.shot_detail:
            exists = await db.get(ShotDetail, target.entity_id) is not None
        elif target.kind == GenerationTargetKind.shot_frame_slot:
            try:
                exists = target.slot_id is not None and await db.get(ShotFrameImage, int(target.slot_id)) is not None
            except ValueError:
                exists = False
        elif target.kind == GenerationTargetKind.asset_image_slot:
            exists = target.slot_id is not None and await self._asset_slot_belongs_to(
                db,
                slot_id=target.slot_id,
                entity_id=target.entity_id,
            )
        elif target.kind == GenerationTargetKind.script_processing:
            exists = bool(target.entity_id)
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="target_not_found")

    async def _asset_slot_belongs_to(self, db: AsyncSession, *, slot_id: str, entity_id: str) -> bool:
        """确认资产图片槽位存在且属于路径绑定的资产，拒绝跨资产写回。"""
        try:
            numeric_id = int(slot_id)
        except ValueError:
            return False
        parent_field_by_model = (
            (ActorImage, "actor_id"),
            (CharacterImage, "character_id"),
            (SceneImage, "scene_id"),
            (PropImage, "prop_id"),
            (CostumeImage, "costume_id"),
        )
        for model, parent_field in parent_field_by_model:
            row = await db.get(model, numeric_id)
            if row is not None:
                return getattr(row, parent_field) == entity_id
        return False

    async def _target_version(self, db: AsyncSession, command: GenerationCommand) -> int | None:
        """提交时冻结可发布槽位的当前 CAS 版本，实验与脚本目标不需要版本。"""
        target = command.target
        if target.kind == GenerationTargetKind.shot_video:
            shot = await db.get(Shot, target.entity_id)
            return shot.generated_video_version_id if shot else None
        if target.kind == GenerationTargetKind.shot_frame_slot and target.slot_id:
            try:
                row = await db.get(ShotFrameImage, int(target.slot_id))
            except ValueError:
                return None
            return row.version_id if row else None
        if target.kind == GenerationTargetKind.asset_image_slot and target.slot_id:
            numeric_id = int(target.slot_id)
            for model in (ActorImage, CharacterImage, SceneImage, PropImage, CostumeImage):
                row = await db.get(model, numeric_id)
                if row is not None:
                    return row.version_id
        return None
