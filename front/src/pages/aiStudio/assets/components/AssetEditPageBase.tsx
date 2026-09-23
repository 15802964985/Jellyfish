import { ManualMediaButton } from '../../../../components/ManualMediaButton'
import { GenerationChannelActions } from '../../../../components/GenerationChannelActions'
import { WebResultCandidates } from '../../../../components/WebResultCandidates'
import { WebImageButton } from '../../../../components/WebImageButton'
import { StudioWebGenerationService, type WebImageRequest } from '../../../../services/generated'
import { GenerationOptionsPanel } from '../../components/GenerationOptionsPanel'
import type { GenerationChoice } from '../../components/GenerationParameterDialog'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Image,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Spin,
  Select,
  Alert,
  Tag,
  Typography,
  message,
} from 'antd'
import { ArrowLeftOutlined, CloseCircleOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import { ScriptProcessingService } from '../../../../services/generated'
import type { TaskStatus } from '../../../../services/generated'
import { listTaskLinksNormalized } from '../../../../services/filmTaskLinks'
import { buildFileDownloadUrl } from '../utils'
import { DisplayImageCard } from './DisplayImageCard'
import { CreativeDirectionButton } from '../../../../components/CreativeDirectionButton'
import { useProjectStyleOptions } from '../../project/useProjectStyleOptions'
import { defaultTaskActionErrorMessage, executeAsyncTaskCreate, executeTaskCancel, notifyExistingTask } from '../../components/taskActionHelpers'
import { handleTaskResultSafely } from '../../components/taskResultHelpers'
import { useRelationTaskNotification } from '../../components/taskNotificationHelpers'
import { useTaskPageContext } from '../../components/taskPageContext'
import { useGenerationCompletion } from '../../components/useGenerationCompletion'
import { TASK_COPY } from '../../components/taskCopy'
import { useLocation } from 'react-router-dom'
import { AssetAttachmentsPanel } from './AssetAttachmentsPanel'
import { useGenerationDraft } from '../../hooks/useGenerationDraft'
import {
  CHARACTER_PORTRAIT_ANALYSIS_RELATION_TYPE,
  COSTUME_INFO_ANALYSIS_RELATION_TYPE,
  PROP_INFO_ANALYSIS_RELATION_TYPE,
  SCENE_INFO_ANALYSIS_RELATION_TYPE,
  type RelationTaskState,
  toRelationTaskStateFromStatusRead,
  useCancelableRelationTask,
} from '../../project/ProjectWorkbench/chapterDivisionTasks'

const MAX_VIEW_COUNT = 4
// 与后端 `AssetViewAngle`（backend/app/models/studio.py）一致的枚举值
export type AssetViewAngle =
  | 'FRONT'
  | 'LEFT'
  | 'RIGHT'
  | 'BACK'
  | 'THREE_QUARTER'
  | 'TOP'
  | 'DETAIL'

export type AssetUpdate = {
  name: string
  description: string
  tags: string[]
  view_count: number
  visual_style: '现实' | '动漫'
  style?: string
}

const DEFAULT_ANGLES: AssetViewAngle[] = ['FRONT', 'LEFT', 'RIGHT', 'BACK']

const ANGLE_LABEL_MAP: Record<AssetViewAngle, string> = {
  FRONT: '正面',
  LEFT: '左侧',
  RIGHT: '右侧',
  BACK: '背面',
  THREE_QUARTER: '3/4 侧面',
  TOP: '俯视',
  DETAIL: '细节',
}

export type BaseAsset = {
  id: string
  name: string
  description?: string
  tags?: string[]
  view_count?: number
  visual_style?: '现实' | '动漫'
  style?: string
}

export type BaseAssetImage = {
  id: number
  view_angle?: AssetViewAngle
  file_id?: string | null
  width?: number | null
  height?: number | null
  format?: string | null
}

export type AssetEditPageBaseProps<TAsset extends BaseAsset, TImage extends BaseAssetImage> = {
  assetId?: string
  extraContent?: ReactNode
  missingAssetIdText: string
  assetDisplayName: string
  backTo: string
  relationType: string
  getAsset: (assetId: string) => Promise<TAsset | null>
  updateAsset: (assetId: string, payload: AssetUpdate) => Promise<TAsset | null>
  listImages: (assetId: string) => Promise<TImage[]>
  createImageSlot: (assetId: string, angle: AssetViewAngle) => Promise<void>
  updateImage: (assetId: string, imageId: number, payload: { file_id: string; width?: number | null; height?: number | null; format?: string | null }) => Promise<void>
  renderPrompt: (assetId: string, imageId: number) => Promise<{ prompt: string; images: string[] }>
  createGenerationTask: (assetId: string, imageId: number, payload: { prompt: string; images: string[]; generationChoice?: GenerationChoice | null }) => Promise<string | null>
  onNavigate: (to: string, replace?: boolean) => void
}

type HistoryCandidate<TImage extends BaseAssetImage> = {
  id: string
  file_id: string
  view_angle?: AssetViewAngle
  width?: number | null
  height?: number | null
  format?: string | null
  source: 'task-link' | 'image'
  originalImage?: TImage
}

function normalizeTags(input: string): string[] {
  return input
    .split(/[,，\n]/g)
    .map((t) => t.trim())
    .filter(Boolean)
}

function clampViewCount(value?: number | null): number {
  const next = Number.isFinite(value as number) ? Number(value) : 1
  return Math.max(1, Math.min(MAX_VIEW_COUNT, Math.trunc(next)))
}

function getSmartDetectRelationType(relationType: string): string | null {
  if (relationType === 'actor_image' || relationType === 'character_image') return CHARACTER_PORTRAIT_ANALYSIS_RELATION_TYPE
  if (relationType === 'scene_image') return SCENE_INFO_ANALYSIS_RELATION_TYPE
  if (relationType === 'prop_image') return PROP_INFO_ANALYSIS_RELATION_TYPE
  if (relationType === 'costume_image') return COSTUME_INFO_ANALYSIS_RELATION_TYPE
  return null
}

function getAssetNavigateRelationType(relationType: string): string | null {
  if (relationType === 'actor_image') return 'actor'
  if (relationType === 'character_image') return 'character'
  if (relationType === 'scene_image') return 'scene'
  if (relationType === 'prop_image') return 'prop'
  if (relationType === 'costume_image') return 'costume'
  return null
}

export function AssetEditPageBase<TAsset extends BaseAsset, TImage extends BaseAssetImage>({
  assetId,
  missingAssetIdText,
  extraContent,
  assetDisplayName,
  backTo,
  relationType,
  getAsset,
  updateAsset,
  listImages,
  createImageSlot,
  updateImage,
  renderPrompt,
  createGenerationTask,
  onNavigate,
}: AssetEditPageBaseProps<TAsset, TImage>) {
  const { defaultVisualStyle, getDefaultStyle } = useProjectStyleOptions()
  const taskCopy = TASK_COPY.smartDetect
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [asset, setAsset] = useState<TAsset | null>(null)
  const [images, setImages] = useState<TImage[]>([])
  const humanAsset = relationType === 'actor_image' || relationType === 'character_image'
  const [anchorFileId, setAnchorFileId] = useState<string>('')
  const [confirmedAnchor, setConfirmedAnchor] = useState<string>('')
  const [creatingViews, setCreatingViews] = useState(false)
  useEffect(() => { setAnchorFileId(''); setConfirmedAnchor('') }, [assetId])

  /** 仅建立缺少的正面、侧面、背面槽位；模型生成仍逐张预览并确认费用。 */
  const prepareThreeViews = async () => {
    if (!assetId) return
    setCreatingViews(true)
    try {
      const existing = await listImages(assetId)
      for (const angle of ['FRONT', 'LEFT', 'BACK'] as AssetViewAngle[]) {
        if (!existing.some(image => image.view_angle === angle)) await createImageSlot(assetId, angle)
      }
      setImages(await listImages(assetId))
      message.success('三视图槽位已保存，请先确认主形象，再逐张生成其他角度')
    } catch { message.error('建立槽位失败，请刷新后重试；已建立的槽位会保留') }
    finally { setCreatingViews(false) }
  }

  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formTags, setFormTags] = useState('')
  const [formViewCount, setFormViewCount] = useState(1)
  const [formVisualStyle, setFormVisualStyle] = useState<'现实' | '动漫'>(defaultVisualStyle as '现实' | '动漫')
  const [formStyle, setFormStyle] = useState<string>(getDefaultStyle(defaultVisualStyle))
  const [savingBase, setSavingBase] = useState(false)

  const [smartDetectLoading, setSmartDetectLoading] = useState(false)
  const [smartDetectOpen, setSmartDetectOpen] = useState(false)
  const [smartDetectIssues, setSmartDetectIssues] = useState<string[]>([])
  const [smartDetectOptimizedDesc, setSmartDetectOptimizedDesc] = useState('')

  const [generatingByImageId, setGeneratingByImageId] = useState<Record<number, boolean>>({})
  const [generationTask, setGenerationTask] = useState<RelationTaskState | null>(null)
  const [generationSettledTask, setGenerationSettledTask] = useState<RelationTaskState | null>(null)

  const [generationChoice, setGenerationChoice] = useState<GenerationChoice | null>(null)
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false)
  const [promptPreviewLoading, setPromptPreviewLoading] = useState(false)
  const [promptPreviewImage, setPromptPreviewImage] = useState<TImage | null>(null)
  const promptDraft = useGenerationDraft<
    { prompt: string },
    { imageId: number | null; images: string[]; useSuggestedImages: boolean },
    { prompt: string; images: string[] },
    { taskId: string | null }
  >({
    initialBase: { prompt: '' },
    initialContext: { imageId: null, images: [], useSuggestedImages: true },
    derive: async ({ base, context }) => {
      if (!assetId || !context.imageId) {
        throw new Error('asset image slot is required')
      }
      const result = await renderPrompt(assetId, context.imageId)
      return {
        prompt: (base.prompt || '').trim() || (result.prompt ?? ''),
        images: context.useSuggestedImages
          ? (Array.isArray(result.images) ? result.images.filter(Boolean) : [])
          : context.images,
      }
    },
    submit: async ({ context, derived }) => {
      if (!assetId || !context.imageId) {
        throw new Error('asset image slot is required')
      }
      const taskId = await createGenerationTask(assetId, context.imageId, {
        prompt: (derived.prompt || '').trim(),
        images: derived.images,
        generationChoice,
      })
      return { taskId }
    },
  })
  const promptPreviewDraft = promptDraft.base.prompt
  const promptPreviewRefFileIds = promptDraft.context.images

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyCandidates, setHistoryCandidates] = useState<HistoryCandidate<TImage>[]>([])
  const [editingSlotImage, setEditingSlotImage] = useState<TImage | null>(null)
  const [adoptingImageId, setAdoptingImageId] = useState<string | null>(null)
  const smartDetectRelationType = useMemo(() => getSmartDetectRelationType(relationType), [relationType])
  const smartDetectRelationEntityId = useMemo(
    () => (assetId && smartDetectRelationType ? `${relationType}:${assetId}` : null),
    [assetId, relationType, smartDetectRelationType],
  )
  const assetNavigateRelationType = useMemo(
    () => getAssetNavigateRelationType(relationType),
    [relationType],
  )
  const applySmartDetectResult = useCallback(async (taskId: string) => {
    await handleTaskResultSafely(taskId, {
      readErrorMessage: '读取智能检测结果失败',
      failedFallbackMessage: '智能检测失败',
      onSucceeded: (resultValue) => {
        const result = resultValue as Record<string, any>
        const issues = Array.isArray(result.issues)
          ? result.issues.filter((it: unknown): it is string => typeof it === 'string' && it.trim().length > 0)
          : []
        const optimizedDesc = String(result.optimized_description ?? '').trim()
        setSmartDetectIssues(issues)
        setSmartDetectOptimizedDesc(optimizedDesc)
        setSmartDetectOpen(true)
        if (issues.length > 0) message.warning(`发现 ${issues.length} 项可能缺失信息`)
        else message.success('未发现缺失信息')
      },
      onFailed: (errorMessage) => {
        message.error(errorMessage)
      },
      onReadError: () => {
        message.error('读取智能检测结果失败')
      },
    })
  }, [])
  const { task: smartDetectTask, settledTask: smartDetectSettledTask, trackTaskData: trackSmartDetectTaskData, applyCancelData: applySmartDetectCancelData } = useCancelableRelationTask({
    enabled: !!assetId && !!smartDetectRelationType && !!smartDetectRelationEntityId,
    relationType: smartDetectRelationType || '',
    relationEntityId: smartDetectRelationEntityId,
    onTaskSettled: applySmartDetectResult,
  })
  useTaskPageContext(
    [
      smartDetectRelationType && smartDetectRelationEntityId
        ? {
            relationType: smartDetectRelationType,
            relationEntityId: smartDetectRelationEntityId,
          }
        : null,
      assetNavigateRelationType && assetId
        ? {
            relationType: assetNavigateRelationType,
            relationEntityId: assetId,
          }
        : null,
    ],
  )
  const smartDetectBusy = smartDetectLoading || !!smartDetectTask

  const ensureImageSlots = useCallback(async (targetViewCount: number) => {
    if (!assetId) return []

    let current = await listImages(assetId)

    const byAngle = new Map<AssetViewAngle, TImage>()
    current.forEach((img) => {
      if (img.view_angle && !byAngle.has(img.view_angle)) {
        byAngle.set(img.view_angle, img)
      }
    })

    const requiredAngles = DEFAULT_ANGLES.slice(0, targetViewCount)
    let created = false

    for (const angle of requiredAngles) {
      if (!byAngle.get(angle)) {
        await createImageSlot(assetId, angle)
        created = true
      }
    }

    if (created) {
      current = await listImages(assetId)
    }

    return current
  }, [assetId, createImageSlot, listImages])

  const loadData = useCallback(async () => {
    if (!assetId) return

    setLoading(true)
    try {
      const nextAsset = await getAsset(assetId)
      if (!nextAsset) {
        message.error(`未找到${assetDisplayName}资产`)
        onNavigate(backTo, true)
        return
      }

      setAsset(nextAsset)
      setFormName(nextAsset.name)
      setFormDesc(nextAsset.description ?? '')
      setFormTags((nextAsset.tags ?? []).join(', '))
      {
        const nextVisual = (nextAsset.visual_style ?? defaultVisualStyle) as '现实' | '动漫'
        setFormVisualStyle(nextVisual)
        setFormStyle((nextAsset.style as string | undefined) ?? getDefaultStyle(nextVisual))
      }

      const targetCount = clampViewCount(nextAsset.view_count)
      setFormViewCount(targetCount)

      const imageRows = await ensureImageSlots(targetCount)
      setImages(imageRows)
    } catch {
      message.error(`加载${assetDisplayName}资产失败`)
    } finally {
      setLoading(false)
    }
  }, [assetId, assetDisplayName, backTo, defaultVisualStyle, ensureImageSlots, getAsset, getDefaultStyle, onNavigate])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useGenerationCompletion(generationTask?.taskId, (status) => {
    setGenerationTask(toRelationTaskStateFromStatusRead(status))
  }, async (status) => {
    if (status.status === 'succeeded' && assetId) {
      // Refresh only image slots: do not overwrite unsaved asset form edits.
      setImages(await listImages(assetId))
      setPromptPreviewOpen(false)
      setPromptPreviewImage(null)
    }
    setGenerationSettledTask(toRelationTaskStateFromStatusRead(status))
    setGenerationTask(null)
    setGeneratingByImageId({})
  })

  const slotItems = useMemo(() => {
    const count = clampViewCount(formViewCount)
    const byAngle = new Map<AssetViewAngle, TImage>()
    images.forEach((img) => {
      if (img.view_angle) byAngle.set(img.view_angle, img)
    })

    const angles = [...new Set([...DEFAULT_ANGLES.slice(0, count), ...images.flatMap(img => img.view_angle ? [img.view_angle] : [])])]
    return angles.map((angle) => {
      const image = byAngle.get(angle) ?? null
      return {
        angle,
        image,
        imageUrl: buildFileDownloadUrl(image?.file_id),
      }
    })
  }, [formViewCount, images])

  const minViewCount = useMemo(() => clampViewCount(asset?.view_count), [asset?.view_count])

  const handleSaveBaseInfo = async () => {
    if (!assetId || !asset) return
    if (!formName.trim()) {
      message.warning('请输入名称')
      return
    }

    setSavingBase(true)
    try {
      const nextViewCount = Math.max(minViewCount, clampViewCount(formViewCount))
      const payload: AssetUpdate = {
        name: formName.trim(),
        description: formDesc.trim(),
        tags: normalizeTags(formTags),
        view_count: nextViewCount,
        visual_style: formVisualStyle,
        style: formStyle,
      }
      const nextAsset = await updateAsset(assetId, payload)
      if (nextAsset) setAsset(nextAsset)
      message.success('基础信息已保存')
      await loadData()
    } catch {
      message.error('保存失败')
    } finally {
      setSavingBase(false)
    }
  }

  const handleSmartDetectMissing = async () => {
    if (!assetId) return
    if (!smartDetectRelationEntityId) return

    const description = (formDesc || '').trim()
    if (!description) {
      if (relationType === 'actor_image') message.warning('请先输入演员描述再进行智能检测')
      else if (relationType === 'scene_image') message.warning('请先输入场景描述再进行智能检测')
      else if (relationType === 'prop_image') message.warning('请先输入道具描述再进行智能检测')
      else if (relationType === 'costume_image') message.warning('请先输入服装描述再进行智能检测')
      return
    }

    if (notifyExistingTask(smartDetectTask, {
      cancellingMessage: taskCopy.cancellingMessage,
      runningMessage: taskCopy.runningMessage,
    })) {
      return
    }

    setSmartDetectLoading(true)
    try {
      const request = () => {
        if (relationType === 'actor_image') {
          const character_context = asset?.name ? `角色名：${formName}\n演员标签：${formTags}` : `演员标签：${formTags}`
          return ScriptProcessingService.analyzeCharacterPortraitAsyncApiV1ScriptProcessingAnalyzeCharacterPortraitAsyncPost({
            requestBody: {
              relation_entity_id: smartDetectRelationEntityId,
              character_description: description,
              character_context: (character_context || '').trim() || null,
            },
          })
        }
        if (relationType === 'scene_image') {
          const scene_context = asset?.name ? `场景名：${formName}\n标签：${formTags}` : `标签：${formTags}`
          return ScriptProcessingService.analyzeSceneInfoAsyncApiV1ScriptProcessingAnalyzeSceneInfoAsyncPost({
            requestBody: {
              relation_entity_id: smartDetectRelationEntityId,
              scene_description: description,
              scene_context: (scene_context || '').trim() || null,
            },
          })
        }
        if (relationType === 'prop_image') {
          const prop_context = asset?.name ? `道具名：${formName}\n标签：${formTags}` : `标签：${formTags}`
          return ScriptProcessingService.analyzePropInfoAsyncApiV1ScriptProcessingAnalyzePropInfoAsyncPost({
            requestBody: {
              relation_entity_id: smartDetectRelationEntityId,
              prop_description: description,
              prop_context: (prop_context || '').trim() || null,
            },
          })
        }
        const costume_context = asset?.name ? `服装名：${formName}\n标签：${formTags}` : `标签：${formTags}`
        return ScriptProcessingService.analyzeCostumeInfoAsyncApiV1ScriptProcessingAnalyzeCostumeInfoAsyncPost({
          requestBody: {
            relation_entity_id: smartDetectRelationEntityId,
            costume_description: description,
            costume_context: (costume_context || '').trim() || null,
          },
        })
      }

      await executeAsyncTaskCreate({
        request,
        trackTaskData: trackSmartDetectTaskData,
        startedMessage: taskCopy.startedMessage,
        reusedMessage: taskCopy.reusedMessage,
        fallbackErrorMessage: '智能检测失败',
        getErrorMessage: (error, fallbackMessage) => {
          const maybeAny = error as { response?: { status?: number }; status?: number }
          const status = maybeAny?.response?.status ?? maybeAny?.status
          if (status === 404) {
            return '接口未找到：请运行 `pnpm run openapi:update` 生成客户端代码后重试'
          }
          return defaultTaskActionErrorMessage(error, fallbackMessage)
        },
      })
    } catch {
      // executeAsyncTaskCreate 已统一处理错误提示
    } finally {
      setSmartDetectLoading(false)
    }
  }

  const handleCancelSmartDetectTask = async () => {
    if (!smartDetectTask?.taskId) return
    try {
      await executeTaskCancel({
        taskId: smartDetectTask.taskId,
        reason: `用户在${assetDisplayName}资产编辑页取消智能检测任务`,
        applyCancelData: applySmartDetectCancelData,
        cancelledImmediatelyMessage: taskCopy.cancelledImmediatelyMessage,
        cancelRequestedMessage: taskCopy.cancelRequestedMessage,
        fallbackErrorMessage: '取消智能检测任务失败',
      })
    } catch {
      // executeTaskCancel 已统一处理错误提示
    }
  }

  useRelationTaskNotification({
    task: smartDetectTask,
    settledTask: smartDetectSettledTask,
    title: taskCopy.title,
    sourceLabel: formName?.trim() ? `${assetDisplayName}：${formName.trim()}` : `${assetDisplayName}编辑页`,
    runningDescription: taskCopy.runningDescription,
    cancellingDescription: taskCopy.cancellingDescription,
    successDescription: taskCopy.successDescription,
    cancelledDescription: taskCopy.cancelledDescription,
    failedDescription: taskCopy.failedDescription,
    onCancel: smartDetectTask ? () => void handleCancelSmartDetectTask() : null,
    onNavigate: () => onNavigate(location.pathname),
  })
  useRelationTaskNotification({
    task: generationTask,
    settledTask: generationSettledTask,
    title: TASK_COPY.imageGeneration.title,
    sourceLabel: formName?.trim() ? `${assetDisplayName}：${formName.trim()}` : `${assetDisplayName}编辑页`,
    runningDescription: TASK_COPY.imageGeneration.runningDescription,
    cancellingDescription: TASK_COPY.imageGeneration.cancellingDescription,
    successDescription: TASK_COPY.imageGeneration.successDescription,
    cancelledDescription: TASK_COPY.imageGeneration.cancelledDescription,
    failedDescription: TASK_COPY.imageGeneration.failedDescription,
    onCancel:
      generationTask?.taskId
        ? () =>
            void executeTaskCancel({
              taskId: generationTask.taskId,
              reason: `用户在${assetDisplayName}资产编辑页取消图片生成任务`,
              applyCancelData: (data) => {
                setGenerationTask((current) =>
                  current
                    ? {
                        ...current,
                        taskId: data?.task_id || current.taskId,
                        status: (data?.status ?? current.status) as TaskStatus,
                        cancelRequested: data?.cancel_requested ?? true,
                      }
                    : current,
                )
                return null
              },
              cancelledImmediatelyMessage: TASK_COPY.imageGeneration.cancelledImmediatelyMessage,
              cancelRequestedMessage: TASK_COPY.imageGeneration.cancelRequestedMessage,
              fallbackErrorMessage: '取消图片生成任务失败',
            })
        : null,
    onNavigate: () => onNavigate(location.pathname),
  })

  const openPromptPreview = async (image: TImage) => {
    if (!assetId) return

    const needsAnchor = humanAsset && image.view_angle !== 'FRONT'
    if (needsAnchor && (!confirmedAnchor || !images.some(item => item.file_id === confirmedAnchor))) {
      message.warning('请先选择并确认主形象，其他视角将以这张图片保持人物与服装一致')
      return
    }
    try {
      setPromptPreviewOpen(true)
      setPromptPreviewLoading(true)
      setPromptPreviewImage(image)
      const nextContext = { imageId: image.id, images: needsAnchor ? [confirmedAnchor] : [], useSuggestedImages: !needsAnchor }
      promptDraft.hydrate({
        base: { prompt: '' },
        context: nextContext,
      })
      const derived = await promptDraft.deriveNow({
        base: { prompt: '' },
        context: nextContext,
      })
      if (derived) {
        const prompt = needsAnchor
          ? `${derived.prompt}

人物多视图要求：以关联图片1为同一人物的主形象基准，保持面部身份、年龄、体型比例、发型、服装款式与颜色。仅生成一张${ANGLE_LABEL_MAP[image.view_angle!]}全身视图，单人、完整构图；不要三联画、拼图或多个重复人物。不可见部分在保持同一人物与服装的前提下合理补足。`
          : derived.prompt
        promptDraft.hydrate({
          base: { prompt },
          context: { ...nextContext, images: derived.images },
          derived: { ...derived, prompt },
        })
      }
    } catch {
      message.error('获取提示词失败')
    } finally {
      setPromptPreviewLoading(false)
    }
  }

  const confirmGenerateWithPrompt = async () => {
    if (generationTask) {
      message.info('当前图片仍在生成，请等待完成或在任务中心取消')
      return
    }
    if (!assetId || !promptPreviewImage) return
    if (humanAsset && promptPreviewImage.view_angle !== 'FRONT' &&
        (!confirmedAnchor || promptPreviewRefFileIds.length !== 1 || promptPreviewRefFileIds[0] !== confirmedAnchor || !images.some(item => item.file_id === confirmedAnchor))) {
      message.warning('主形象参考已变化，请关闭预览并重新打开生成')
      return
    }
    const prompt = (promptPreviewDraft || '').trim()
    if (!prompt) {
      message.warning('请输入提示词')
      return
    }

    setGeneratingByImageId((prev) => ({ ...prev, [promptPreviewImage.id]: true }))
    try {
      const submitted = await promptDraft.submitNow()
      const taskId = submitted?.taskId
      if (!taskId) {
        message.error('生成任务创建失败：缺少任务 ID')
        return
      }
      setPromptPreviewOpen(false)
      window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId,title:'资产图片生成'}}))
      message.success('图片在后台生成，可继续编辑其他资产')
      setGenerationTask({
        taskId,
        status: 'pending',
        progress: 0,
        cancelRequested: false,
      })
      setGenerationSettledTask(null)

    } catch {
      message.error('发起生成失败')
    } finally {
      setGeneratingByImageId((prev) => ({ ...prev, [promptPreviewImage.id]: false }))
    }
  }

  const openHistoryModal = async (targetImage: TImage) => {
    setEditingSlotImage(targetImage)
    setHistoryOpen(true)
    setHistoryLoading(true)

    try {
      const links = await listTaskLinksNormalized({
        resourceType: 'image',
        relationType,
        relationEntityId: String(targetImage.id),
      })
      const imagesByFileId = new Map<string, TImage>()
      images.forEach((img) => {
        if (img.file_id) {
          imagesByFileId.set(img.file_id, img)
        }
      })

      const seenFileIds = new Set<string>()
      const taskLinkCandidates: HistoryCandidate<TImage>[] = links
        .filter((link) => Boolean(link.file_id))
        .map((link) => {
          const fileId = String(link.file_id)
          const matchedImage = imagesByFileId.get(fileId)
          return {
            id: `task-link-${link.id}`,
            file_id: fileId,
            view_angle: matchedImage?.view_angle ?? targetImage.view_angle,
            width: matchedImage?.width ?? null,
            height: matchedImage?.height ?? null,
            format: matchedImage?.format ?? null,
            source: 'task-link' as const,
            originalImage: matchedImage,
          }
        })
        .filter((candidate) => {
          if (seenFileIds.has(candidate.file_id)) return false
          seenFileIds.add(candidate.file_id)
          return true
        })

      const fallbackCandidates: HistoryCandidate<TImage>[] = images
        .filter((img) => img.file_id && img.id !== targetImage.id && !seenFileIds.has(String(img.file_id)))
        .map((img) => ({
          id: `image-${img.id}`,
          file_id: String(img.file_id),
          view_angle: img.view_angle,
          width: img.width ?? null,
          height: img.height ?? null,
          format: img.format ?? null,
          source: 'image' as const,
          originalImage: img,
        }))

      setHistoryCandidates(taskLinkCandidates.length > 0 ? taskLinkCandidates : fallbackCandidates)
    } catch {
      message.error('加载历史生成图片失败')
      setHistoryCandidates([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleAdoptHistoryImage = async (candidate: HistoryCandidate<TImage>) => {
    if (!assetId || !editingSlotImage || !candidate.file_id) return

    setAdoptingImageId(candidate.id)
    try {
      await updateImage(assetId, editingSlotImage.id, {
        file_id: candidate.file_id,
        width: candidate.width ?? null,
        height: candidate.height ?? null,
        format: candidate.format ?? null,
      })
      message.success('角度图片已更新')
      setHistoryOpen(false)
      setEditingSlotImage(null)
      await loadData()
    } catch {
      message.error('更新角度图片失败')
    } finally {
      setAdoptingImageId(null)
    }
  }

  if (!assetId) {
    return (
      <Card>
        <Empty description={missingAssetIdText} />
      </Card>
    )
  }

  return (
    <div className="space-y-4 h-full overflow-auto">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => onNavigate(backTo)}>
              返回{assetDisplayName}资产
            </Button>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {assetDisplayName}资产编辑
            </Typography.Title>
            {asset?.id ? <Tag>{asset.id}</Tag> : null}
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()} loading={loading}>
            刷新
          </Button>
        </div>
      </Card>

      {assetNavigateRelationType&&<WebResultCandidates targetType={assetNavigateRelationType} entityId={assetId} onAdopt={async()=>{setImages(await listImages(assetId))}}/>}
      {extraContent}
      <Collapse
        defaultActiveKey={['base', 'views']}
        items={[
          {
            key: 'base',
            label: '基础信息展示',
            children: loading ? (
              <div className="py-8 text-center">
                <Spin />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-gray-600 text-sm mb-1">名称</div>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} disabled={smartDetectBusy || savingBase} />
                </div>
                <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-gray-600 text-sm">描述</div>
                      {relationType === 'actor_image' ||
                      relationType === 'scene_image' ||
                      relationType === 'prop_image' ||
                      relationType === 'costume_image' ? (
                        <>
                          <Button
                            type="primary"
                            size="small"
                            onClick={() => void handleSmartDetectMissing()}
                            loading={smartDetectLoading}
                            disabled={Boolean(loading) || !!smartDetectTask}
                          >
                            {smartDetectTask ? '检测中' : '智能检测'}
                          </Button>
                          {smartDetectTask ? (
                            <Button
                              size="small"
                              danger
                              icon={<CloseCircleOutlined />}
                              disabled={smartDetectTask.cancelRequested}
                              onClick={() => void handleCancelSmartDetectTask()}
                            >
                              {smartDetectTask.cancelRequested ? '正在取消' : '取消检测'}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  <Input.TextArea
                    rows={4}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    disabled={smartDetectBusy || savingBase}
                  />
                </div>
                <div>
                  <div className="text-gray-600 text-sm mb-1">标签（逗号分隔）</div>
                  <Input value={formTags} onChange={(e) => setFormTags(e.target.value)} disabled={smartDetectBusy || savingBase} />
                </div>
                <div>
                  <div className="text-gray-600 text-sm mb-1">镜头数（仅可增加，最大 4）</div>
                  <InputNumber
                    min={minViewCount}
                    max={4}
                    precision={0}
                    value={formViewCount}
                    onChange={(v) => setFormViewCount(v ?? minViewCount)}
                    disabled={smartDetectBusy || savingBase}
                  />
                </div>
                <div>
                  <div className="text-gray-600 text-sm mb-1">创作设定</div>
                  {assetNavigateRelationType && <CreativeDirectionButton scope={assetNavigateRelationType as 'actor' | 'character' | 'scene' | 'prop' | 'costume'} entityId={assetId} label="编辑创作设定" />}
                </div>
                <Button type="primary" onClick={() => void handleSaveBaseInfo()} loading={savingBase || smartDetectLoading}>
                  保存基础信息
                </Button>
              </div>
            ),
          },
          {
            key: 'views',
            label: humanAsset ? '三视图与多角度参考' : '多镜头图片',
            children: (
              <>
              {humanAsset && <Card size="small" style={{ marginBottom: 16 }}>
                <Alert type="info" showIcon message="先确认主形象，再生成侧面与背面" description="建立槽位不调用模型、不产生生成费用。每个角度单独生成、单独确认费用，生成后检查身份和服装；三视图不会自动全部加入视频参考。重新进入页面需再次确认主形象。" />
                <Space wrap style={{ marginTop: 12 }}>
                  <Button onClick={() => void prepareThreeViews()} loading={creatingViews} disabled={!!generationTask}>建立三视图槽位</Button>
                  <Select aria-label="主形象参考" placeholder="选择已生成的主形象" style={{ minWidth: 210 }} value={anchorFileId || undefined}
                    onChange={value => { setAnchorFileId(value); setConfirmedAnchor('') }}
                    options={images.filter(item => item.file_id).map(item => ({ value: item.file_id!, label: `${ANGLE_LABEL_MAP[item.view_angle || 'FRONT']} · 图片 ${item.id}` }))} />
                  <Button disabled={!anchorFileId} onClick={() => setConfirmedAnchor(anchorFileId)}>确认主形象</Button>
                  {confirmedAnchor && <Tag color="green">已确认主形象</Tag>}
                  {anchorFileId && <Image width={72} height={90} style={{ objectFit: 'contain' }} src={buildFileDownloadUrl(anchorFileId)} />}
                </Space>
              </Card>}
              <Row gutter={[16, 16]}>
                {slotItems.map((slot) => (
                  <Col xs={24} sm={12} lg={8} xl={6} key={slot.angle}>
                    <DisplayImageCard
                      title={`照片角度：${ANGLE_LABEL_MAP[slot.angle]}`}
                      imageUrl={slot.imageUrl}
                      imageAlt={slot.angle}
                      placeholder="暂无图片"
                      hoverable={false}
                      imageHeightClassName="h-44"
                      extra={slot.image ? <Tag color="blue">ID {slot.image.id}</Tag> : null}
                      footer={
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="primary"
                            size="small"
                            disabled={!slot.image || !!generationTask}
                            loading={Boolean(slot.image && generatingByImageId[slot.image.id])}
                            onClick={() => slot.image && void openPromptPreview(slot.image)}
                          >
                            生成
                          </Button>
                          {slot.image&&assetNavigateRelationType&&assetId&&<ManualMediaButton target={{target_type:assetNavigateRelationType as 'actor'|'character'|'scene'|'prop'|'costume',entity_id:assetId,slot_id:slot.image.id}} title={ANGLE_LABEL_MAP[slot.angle]+' · 修改图片'} onAdopted={async()=>{setImages(await listImages(assetId));setConfirmedAnchor('')}}/>}
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            disabled={!slot.image}
                            onClick={() => slot.image && void openHistoryModal(slot.image)}
                          >
                            历史版本
                          </Button>
                        </div>
                      }
                    />
                  </Col>
                ))}
              </Row>
              </>
            ),
          },
          ...(assetNavigateRelationType && assetId
            ? [{
                key: 'attachments',
                label: '参考素材（照片 / 视频 / 文档 / 音频）',
                children: <AssetAttachmentsPanel entityType={assetNavigateRelationType} entityId={assetId} />,
              }]
            : []),
        ]}
      />

      <Modal
        title="历史生成图片"
        open={historyOpen}
        onCancel={() => {
          setHistoryOpen(false)
          setEditingSlotImage(null)
        }}
        footer={null}
        width={960}
      >
        {historyLoading ? (
          <div className="py-8 text-center">
            <Spin />
          </div>
        ) : historyCandidates.length === 0 ? (
          <Empty description="暂无可用历史图片" />
        ) : (
          <Row gutter={[16, 16]}>
            {historyCandidates.map((candidate) => (
              <Col xs={24} sm={12} md={8} key={candidate.id}>
                <DisplayImageCard
                  title={candidate.view_angle ? `角度：${ANGLE_LABEL_MAP[candidate.view_angle] ?? candidate.view_angle}` : candidate.source === 'task-link' ? '任务产物' : `图片 ${candidate.id}`}
                  imageUrl={buildFileDownloadUrl(candidate.file_id)}
                  imageAlt={candidate.id}
                  placeholder="无缩略图"
                  hoverable={false}
                  imageHeightClassName="h-44"
                  footer={
                    <Button
                      className="mt-2"
                      type="primary"
                      size="small"
                      block
                      disabled={!candidate.file_id}
                      loading={adoptingImageId === candidate.id}
                      onClick={() => void handleAdoptHistoryImage(candidate)}
                    >
                      选中并更新当前角度
                    </Button>
                  }
                />
              </Col>
            ))}
          </Row>
        )}
      </Modal>

      <Modal
        title="提示词内容预览"
        open={promptPreviewOpen}
        onCancel={() => {
          setPromptPreviewOpen(false)
          setPromptPreviewImage(null)
        }}
        okText="生成"
        cancelText="取消"
        confirmLoading={Boolean(promptPreviewImage && generatingByImageId[promptPreviewImage.id])}
        onOk={() => void confirmGenerateWithPrompt()}
        footer={(_, { OkBtn, CancelBtn }) => <Space wrap><CancelBtn /><GenerationChannelActions apiAction={<OkBtn/>} webAction={
          <WebImageButton key={`${assetId}:${promptPreviewImage?.id}`}
            disabled={!promptPreviewImage || !promptPreviewDraft.trim()}
            prepare={async () => {
              // Preserve the same portrait anchor guard used by the API channel.
              if (!assetId || !promptPreviewImage || !assetNavigateRelationType) throw new Error('请选择图片槽位')
              if (humanAsset && promptPreviewImage.view_angle !== 'FRONT' && (!confirmedAnchor || promptPreviewRefFileIds.length !== 1 || promptPreviewRefFileIds[0] !== confirmedAnchor || !images.some(item => item.file_id === confirmedAnchor))) throw new Error('主形象参考已变化，请重新打开预览')
              const targetType=assetNavigateRelationType as WebImageRequest['target_type']
              const entityId=assetId,slotId=promptPreviewImage.id,prompt=promptPreviewDraft,refs=[...promptPreviewRefFileIds]
              const target=await StudioWebGenerationService.targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({targetType,entityId,slotId})
              return {target_type:targetType,entity_id:entityId,slot_id:slotId,expected_version:target.version,prompt,reference_file_ids:refs}
            }}
            onAccepted={taskId=>{setPromptPreviewOpen(false);setGenerationTask({taskId,status:'pending',progress:0,cancelRequested:false});setGenerationSettledTask(null)}}
          />}/></Space>}

        destroyOnClose
        width={900}
      >
        {promptPreviewLoading ? (
          <div className="py-8 text-center">
            <Spin />
          </div>
        ) : (
          <div className="space-y-3">
            <GenerationOptionsPanel category="image" references={promptPreviewRefFileIds.length} onChange={setGenerationChoice} />
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs text-gray-500">{humanAsset && promptPreviewImage?.view_angle !== 'FRONT' ? '已确认主形象（本次生成的唯一图片参考）' : '关联图片（智能推荐，可选）'}</div>
                <Space size={4}>
                  <Button
                    size="small"
                    type="text"
                    disabled={(humanAsset && promptPreviewImage?.view_angle !== 'FRONT') || promptDraft.context.useSuggestedImages}
                    onClick={async () => {
                      const context = { ...promptDraft.context, useSuggestedImages: true }
                      promptDraft.setContext(context)
                      const derived = await promptDraft.deriveNow({ context })
                      if (derived) promptDraft.replaceContext({ ...context, images: derived.images })
                    }}
                  >
                    恢复智能推荐
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    danger
                    disabled={(humanAsset && promptPreviewImage?.view_angle !== 'FRONT') || promptPreviewRefFileIds.length === 0}
                    onClick={() => {
                      promptDraft.setContext((current) => ({ ...current, images: [], useSuggestedImages: false }))
                      promptDraft.setDerived(promptDraft.derived ? { ...promptDraft.derived, images: [] } : null)
                    }}
                  >
                    全部不使用
                  </Button>
                </Space>
              </div>
              {promptPreviewRefFileIds.length === 0 ? (
                <div className="text-xs text-gray-400">暂无关联图片</div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <Image.PreviewGroup>
                    {promptPreviewRefFileIds.map((fid) => (
                      <div key={fid} className="relative shrink-0">
                        <Image
                          width={72}
                          height={72}
                          style={{ objectFit: 'cover', borderRadius: 8 }}
                          src={buildFileDownloadUrl(fid)}
                        />
                        <Button
                          danger
                          type="primary"
                          size="small"
                          shape="circle"
                          icon={<CloseCircleOutlined />}
                          className="absolute -right-2 -top-2 z-10"
                          disabled={humanAsset && promptPreviewImage?.view_angle !== 'FRONT'}
                          onClick={() => {
                            const images = promptPreviewRefFileIds.filter((item) => item !== fid)
                            promptDraft.setContext((current) => ({ ...current, images, useSuggestedImages: false }))
                            promptDraft.setDerived(promptDraft.derived ? { ...promptDraft.derived, images } : null)
                          }}
                        />
                      </div>
                    ))}
                  </Image.PreviewGroup>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-2">提示词（可编辑）</div>
              <Input.TextArea
                rows={10}
                value={promptPreviewDraft}
                onChange={(e) => promptDraft.setBase({ prompt: e.target.value })}
                placeholder="请输入提示词…"
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="智能检测：缺失信息"
        open={smartDetectOpen}
        onCancel={() => setSmartDetectOpen(false)}
        footer={null}
        destroyOnClose
        width={880}
      >
        {smartDetectLoading ? (
          <div className="py-8 text-center">
            <Spin />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {smartDetectIssues.length === 0 ? (
                <div className="text-sm text-gray-600">未发现缺失信息。</div>
              ) : (
                <div className="text-sm text-gray-600">发现 {smartDetectIssues.length} 项可能缺失信息（建议参考下面优化后的描述）：</div>
              )}
              {smartDetectIssues.length > 0 ? (
                <div className="space-y-2">
                  {smartDetectIssues.map((it, idx) => (
                    <div key={`${idx}_${it}`} className="text-sm text-gray-800">
                      {idx + 1}. {it}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-2">优化后的描述（可直接填入）</div>
              <Input.TextArea rows={6} value={smartDetectOptimizedDesc} readOnly />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  const next = smartDetectOptimizedDesc.trim()
                  if (!next) {
                    message.warning('未返回有效的优化描述')
                    return
                  }
                  setFormDesc(next)
                  setSmartDetectOpen(false)
                  message.success('已填入描述')
                }}
                disabled={!smartDetectOptimizedDesc.trim()}
              >
                填入描述
              </Button>
              <Button onClick={() => setSmartDetectOpen(false)}>关闭</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
