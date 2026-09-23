import { ManualMediaButton } from '../../../components/ManualMediaButton'
import type { HandoffTarget } from '../../../components/WebHandoffButton'
import { GenerationChannelActions } from '../../../components/GenerationChannelActions'
import { WebResultCandidates } from '../../../components/WebResultCandidates'
import { WebImageButton } from '../../../components/WebImageButton'
import { WebHandoffButton } from '../../../components/WebHandoffButton'
import { StudioWebGenerationService } from '../../../services/generated'
import { CreativeDirectionButton } from '../../../components/CreativeDirectionButton'
import { BackgroundTaskNotice } from '../components/BackgroundTaskNotice'
import { flushSync } from 'react-dom'
import { useShotDetailSync } from './components/useShotDetailSync'
import { VideoSubjectReferences } from './components/VideoSubjectReferences'
import type { VideoSubjectMediaReference, VideoGenerationOptionsRead } from '../../../services/generated'
import { PreviewImage } from '../../../components/PreviewImage'
import { Alert } from 'antd'
import { ShotMoodTags } from './components/ShotMoodTags'
import { GenerationOptionsPanel } from '../components/GenerationOptionsPanel'
import { rateFor, reviewGenerationBatch, reviewGenerationRequest, type GenerationChoice } from '../components/GenerationParameterDialog'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VideoPromptWorkbench, VideoShotBrief } from './components/VideoPromptWorkbench'
import { GenerationQualityPanel } from './components/GenerationQualityPanel'
import type { QualityReviewRecord, ReviewGenerationContext_Input as ReviewGenerationContext } from '../../../services/generated'
import { FrameQualityWorkflow, frameInputKey, type FrameApplication } from './components/FrameQualityWorkflow'
import { QualityReviewPanel, reviewContextKey } from './components/QualityReviewPanel'
import { MediaFilePicker } from '../files/MediaFilePicker'
import { FrameReferenceSelector } from './components/FrameReferenceSelector'
import { VideoEditPanel } from './components/VideoEditPanel'
import {
  Badge,
  Button,
  Card,
  Divider,
  Dropdown,
  Image,
  Input,
  Layout,
  Modal,
  Radio,
  Segmented,
  Select,
  Slider,
  Spin,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  message,
} from 'antd'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CaretLeftOutlined,
  CaretRightOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileTextOutlined,
  LinkOutlined,
  MergeCellsOutlined,
  PauseCircleOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  ScissorOutlined,
  SettingOutlined,
  SoundOutlined,
  StopOutlined,
  TagOutlined,
  VideoCameraOutlined,
  ThunderboltOutlined,
  UndoOutlined,
  VideoCameraAddOutlined,
  PlusOutlined,
  UserOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import { useLocation, useParams, Link } from 'react-router-dom'
import {
  FilmService,
  LlmService,
  StudioChaptersService,
  StudioEntitiesService,
  StudioFilesService,
  StudioGenerationPromptsService,
  StudioGenerationTasksService,
  StudioProjectsService,
  StudioShotCharacterLinksService,
  StudioShotDetailsService,
  StudioShotDialogLinesService,
  StudioShotFrameImagesService,
  StudioShotLinksService,
  StudioShotsService,
} from '../../../services/generated'
import { StudioEntitiesApi } from '../../../services/studioEntities'
import type {
  CameraAngle,
  CameraMovement,
  CameraShotType,
  ChapterRead,
  EntityNameExistenceItem,
  ProjectActorLinkRead,
  ProjectCostumeLinkRead,
  ShotDetailRead,
  ShotDialogLineRead,
  ShotExtractedCandidateRead,
  ShotExtractedDialogueCandidateRead,
  ShotAssetsOverviewRead,
  ShotFrameImageRead,
  ShotCharacterLinkRead,
  ProjectPropLinkRead,
  FrameReferenceMappingSnapshot,
  ShotRead,
  ShotVideoReadinessRead,
  ShotRuntimeSummaryRead,
  ProjectSceneLinkRead,
  ShotStatus,
  ShotVideoPromptPackRead,
} from '../../../services/generated'
import { listTaskLinksNormalized } from '../../../services/filmTaskLinks'
import { buildFileDownloadUrl, resolveAssetUrl } from '../assets/utils'
import type { Chapter } from '../../../mocks/data'
import { executeTaskCancel } from '../components/taskActionHelpers'
import { useRelationTaskNotification } from '../components/taskNotificationHelpers'
import { TASK_COPY } from '../components/taskCopy'
import { loadAllPaginated } from '../../../services/loadAllPaginated'
import { ChapterStudioBatchToolbar } from './components/ChapterStudioBatchToolbar'
import { ChapterStudioMaintenancePanel } from './components/ChapterStudioMaintenancePanel'
import { ChapterStudioReadinessDiagnosisPanel } from './components/ChapterStudioReadinessDiagnosisPanel'
import { ChapterStudioVideoReadinessPanel } from './components/ChapterStudioVideoReadinessPanel'
import { ShotAudioTracksPanel } from './components/ShotAudioTracksPanel'
import { useGenerationDraft, type GenerationDraftState } from '../hooks/useGenerationDraft'
import { useTaskPageContext } from '../components/taskPageContext'
import type { RelationTaskState } from '../project/ProjectWorkbench/chapterDivisionTasks'
import { toRelationTaskStateFromStatusRead } from '../project/ProjectWorkbench/chapterDivisionTasks'
import { useProjectStyleOptions } from '../project/useProjectStyleOptions'
import './chapterStudio.separation.css'

const { Sider, Content } = Layout
const { TextArea } = Input

const FRAME_FILE_TAG_ADOPT = '采用'
const FRAME_FILE_TAG_ABANDON = '废弃'

type ShotFramePromptDebugContext = Record<string, unknown>
type ShotFramePromptQualityChecks = {
  passed: boolean
  issues: string[]
} | null
type FramePromptDerived = {
  sourceFingerprint?: string
  qualityReport?: unknown
  basePrompt: string
  renderedPrompt: string
  selectedGuidance: string[]
  droppedGuidance: string[]
  selectedGuidanceDetails: Array<{ text: string; category: string; reasonTag: string; reason: string }>
  droppedGuidanceDetails: Array<{ text: string; category: string; reasonTag: string; reason: string }>
  images: string[]
  mappings: FrameReferenceMappingSnapshot[]
}
type VideoReferenceMode = 'first' | 'last' | 'key' | 'first_last' | 'first_last_key' | 'text_only' | 'subjects'
type VideoPromptDerived = {
  sourceFingerprint?: string
  qualityReport?: unknown
  prompt: string
  images: string[]
  pack: ShotVideoPromptPackRead | null
}
type VideoFrameReferences = {
  first_frame_file_id?: string | null
  last_frame_file_id?: string | null
  key_frame_file_ids: string[]
}

/**
 * 将既有按 reference_mode 排序的帧文件列表映射为具名帧契约。
 *
 * 工作台仍维护原有首帧/尾帧/关键帧流程，映射仅在 API 边界执行，
 * 以避免将主体参考与镜头构图帧混入同一个数组。
 */
function buildVideoFrameReferences(mode: VideoReferenceMode, images: string[]): VideoFrameReferences {
  const refs = images.filter(Boolean)
  if (mode === 'first') return { first_frame_file_id: refs[0] ?? null, key_frame_file_ids: [] }
  if (mode === 'last') return { last_frame_file_id: refs[0] ?? null, key_frame_file_ids: [] }
  if (mode === 'key') return { key_frame_file_ids: refs.slice(0, 1) }
  if (mode === 'first_last') {
    return { first_frame_file_id: refs[0] ?? null, last_frame_file_id: refs[1] ?? null, key_frame_file_ids: [] }
  }
  if (mode === 'first_last_key') {
    return { first_frame_file_id: refs[0] ?? null, last_frame_file_id: refs[1] ?? null, key_frame_file_ids: refs.slice(2, 3) }
  }
  return { key_frame_file_ids: [] }
}

function normalizeFrameExclusiveTags(tags: string[]): string[] {
  const cleaned = (tags || []).map((x) => String(x ?? '').trim()).filter(Boolean)
  const hasAdopt = cleaned.includes(FRAME_FILE_TAG_ADOPT)
  const hasAbandon = cleaned.includes(FRAME_FILE_TAG_ABANDON)
  const rest = cleaned.filter((t) => t !== FRAME_FILE_TAG_ADOPT && t !== FRAME_FILE_TAG_ABANDON)
  if (hasAdopt && !hasAbandon) return [FRAME_FILE_TAG_ADOPT, ...rest]
  if (!hasAdopt && hasAbandon) return [FRAME_FILE_TAG_ABANDON, ...rest]
  // 两者都没有或同时存在：同时存在时默认保留“采用”
  if (hasAdopt && hasAbandon) return [FRAME_FILE_TAG_ADOPT, ...rest]
  return rest
}

function readDebugContextText(
  context: ShotFramePromptDebugContext | null,
  key: string,
): string {
  if (!context) return ''
  const value = context[key]
  return typeof value === 'string' ? value.trim() : ''
}

function buildKeyframeGuidanceSummary(items: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  items
    .flatMap((item) => item.split('；'))
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) return
      seen.add(item)
      result.push(item)
    })
  return result
}

function stripDirectiveLevelPrefix(item: string): string {
  const text = String(item || '').trim()
  if (text.startsWith('必须：')) return text.slice(3).trim()
  if (text.startsWith('优先：')) return text.slice(3).trim()
  return text
}

function parseDirectorCommandSummary(summary: string): Array<{
  level: 'must' | 'prefer'
  text: string
}> {
  return String(summary || '')
    .split('；')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item.startsWith('必须：')) {
        return { level: 'must' as const, text: item.slice(3).trim() }
      }
      if (item.startsWith('优先：')) {
        return { level: 'prefer' as const, text: item.slice(3).trim() }
      }
      return { level: 'prefer' as const, text: item }
    })
}

function buildGuidanceLevelSummary(
  parsedDirectorCommands: Array<{ level: 'must' | 'prefer'; text: string }>,
  guidanceSummary: string[],
): { must: number; prefer: number; normal: number } {
  const must = parsedDirectorCommands.filter((item) => item.level === 'must').length
  const prefer = parsedDirectorCommands.filter((item) => item.level === 'prefer').length
  const parsedTexts = new Set(parsedDirectorCommands.map((item) => item.text.trim()).filter(Boolean))
  const normal = guidanceSummary
    .map((item) => stripDirectiveLevelPrefix(item))
    .filter((item) => item && !parsedTexts.has(item)).length
  return { must, prefer, normal }
}

function buildActionBeatPhaseTags(summary: string): Array<{ text: string; phaseLabel: string }> {
  return String(summary || '')
    .split('；')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const matched = item.match(/^\d+\.\s*(触发|峰值|收束)\s*·\s*(.+)$/)
      if (!matched) {
        return { phaseLabel: '阶段', text: item }
      }
      return {
        phaseLabel: matched[1],
        text: matched[2].trim(),
      }
    })
}

type InspectorMode = 'push' | 'overlay'
type ShotFilter = 'all' | 'pendingConfirm' | 'generating' | 'ready' | 'hidden' | 'problem'

type StudioShot = ShotRead & {
  hidden?: boolean
  hasProblem?: boolean
  hasSpeech?: boolean
  hasMusic?: boolean
}

type ShotRuntimeState = {
  has_active_tasks: boolean
  has_active_video_tasks: boolean
  has_active_prompt_tasks: boolean
  has_active_frame_tasks: boolean
  active_task_count: number
}

type LayoutPrefs = {
  leftWidth: number
  rightWidth: number
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  autoOpenInspector: boolean
  timelineCollapsed: boolean
}

type KeyframeCardState = {
  loading: boolean
  taskStatus: string | null
  taskId: string | null
  thumbs: Array<{ linkId: number; fileId: string; thumbUrl: string }>
  modalOpen: boolean
  applyingFileId: string | null
}


type InspectorTabKey = 'ops' | 'camera' | 'prompt_image' | 'dialogue' | 'keyframe_gen' | 'gen_ref'

const LAYOUT_STORAGE_KEY = 'jellyfish_chapter_studio_layout_v1'
type PromptFrameType = 'first' | 'key' | 'last'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}


function mapGenerationDraftStateToRenderState(
  state: GenerationDraftState,
): 'idle' | 'stale' | 'syncing' | 'clean' | 'error' {
  if (state === 'derived' || state === 'submitted') return 'clean'
  if (state === 'deriving' || state === 'submitting') return 'syncing'
  if (state === 'draft_changed' || state === 'context_changed') return 'stale'
  if (state === 'error') return 'error'
  return 'idle'
}

function getKeyframeRenderStatusMeta(state: GenerationDraftState) {
  const renderState = mapGenerationDraftStateToRenderState(state)
  if (renderState === 'clean') {
    return {
      color: 'green' as const,
      label: '已同步',
      description: '当前最终提示词已与基础提示词和参考图顺序保持一致。',
    }
  }
  if (renderState === 'syncing') {
    return {
      color: 'blue' as const,
      label: '同步中',
      description: '正在根据当前基础提示词和参考图顺序更新最终提示词…',
    }
  }
  if (renderState === 'error') {
    return {
      color: 'red' as const,
      label: '同步失败',
      description: '自动更新失败，请重试。若问题持续存在，请检查基础提示词和参考图。',
    }
  }
  if (renderState === 'idle') {
    return {
      color: 'default' as const,
      label: '待生成',
      description: '请先输入基础提示词，系统会自动生成最终提示词。',
    }
  }
  return {
    color: 'gold' as const,
    label: '待同步',
    description: '基础提示词或参考图顺序已变化，最终提示词正在等待更新。',
  }
}

function applyTaskCancelState(
  currentTask: RelationTaskState | null,
  data?: { task_id?: string | null; status?: string | null; cancel_requested?: boolean | null } | null,
): RelationTaskState | null {
  if (!currentTask) return null
  return {
    ...currentTask,
    taskId: data?.task_id || currentTask.taskId,
    status: (data?.status ?? currentTask.status) as RelationTaskState['status'],
    cancelRequested: data?.cancel_requested ?? true,
  }
}

function reorder<T>(list: T[], startIndex: number, endIndex: number) {
  const result = [...list]
  const [removed] = result.splice(startIndex, 1)
  result.splice(endIndex, 0, removed)
  return result
}

function normalizeAssetName(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function uniqueNames(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []
  values.forEach((value) => {
    const raw = String(value ?? '').trim()
    if (!raw) return
    const key = normalizeAssetName(raw)
    if (!key || seen.has(key)) return
    seen.add(key)
    result.push(raw)
  })
  return result
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.isContentEditable) return true
  return Boolean(target.closest('[contenteditable="true"]'))
}

function toUIChapter(c: ChapterRead): Chapter {
  return {
    id: c.id,
    projectId: c.project_id,
    index: c.index,
    title: c.title,
    summary: c.summary ?? '',
    storyboardCount: c.shot_count ?? c.storyboard_count ?? 0,
    status: c.status ?? 'draft',
    updatedAt: new Date().toISOString(),
  }
}

const CAMERA_SHOT_OPTIONS: { value: CameraShotType; label: string }[] = [
  { value: 'ECU', label: '极特写' },
  { value: 'CU', label: '特写' },
  { value: 'MCU', label: '中近景' },
  { value: 'MS', label: '中景' },
  { value: 'MLS', label: '中远景' },
  { value: 'LS', label: '远景' },
  { value: 'ELS', label: '大全景' },
]

const CAMERA_ANGLE_OPTIONS: { value: CameraAngle; label: string }[] = [
  { value: 'EYE_LEVEL', label: '平视' },
  { value: 'HIGH_ANGLE', label: '俯视' },
  { value: 'LOW_ANGLE', label: '仰视' },
  { value: 'BIRD_EYE', label: '鸟瞰' },
  { value: 'DUTCH', label: '倾斜' },
  { value: 'OVER_SHOULDER', label: '越肩' },
]

const CAMERA_MOVEMENT_OPTIONS: { value: CameraMovement; label: string }[] = [
  { value: 'STATIC', label: '固定' },
  { value: 'PAN', label: '摇镜' },
  { value: 'TILT', label: '俯仰' },
  { value: 'DOLLY_IN', label: '推进' },
  { value: 'DOLLY_OUT', label: '拉出' },
  { value: 'TRACK', label: '跟拍' },
  { value: 'CRANE', label: '升降' },
  { value: 'HANDHELD', label: '手持' },
  { value: 'STEADICAM', label: '稳定器' },
  { value: 'ZOOM_IN', label: '变焦推' },
  { value: 'ZOOM_OUT', label: '变焦拉' },
]

function useLocalStoragePrefs() {
  const [prefs, setPrefs] = useState<LayoutPrefs>(() => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (!raw) {
        return {
          leftWidth: 280,
          rightWidth: 420,
          inspectorOpen: false,
          inspectorMode: 'push',
          autoOpenInspector: true,
          timelineCollapsed: false,
        }
      }
      const parsed = JSON.parse(raw) as Partial<LayoutPrefs>
      return {
        leftWidth: typeof parsed.leftWidth === 'number' ? parsed.leftWidth : 280,
        rightWidth: typeof parsed.rightWidth === 'number' ? parsed.rightWidth : 420,
        inspectorOpen: typeof parsed.inspectorOpen === 'boolean' ? parsed.inspectorOpen : false,
        inspectorMode: parsed.inspectorMode === 'overlay' ? 'overlay' : 'push',
        autoOpenInspector: typeof parsed.autoOpenInspector === 'boolean' ? parsed.autoOpenInspector : true,
        timelineCollapsed: typeof parsed.timelineCollapsed === 'boolean' ? parsed.timelineCollapsed : false,
      }
    } catch {
      return {
        leftWidth: 280,
        rightWidth: 420,
        inspectorOpen: false,
        inspectorMode: 'push',
        autoOpenInspector: true,
        timelineCollapsed: false,
      }
    }
  })

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(prefs))
  }, [prefs])

  return [prefs, setPrefs] as const
}

const ChapterStudio: React.FC = () => {
  const [imageChoice, setImageChoice] = useState<GenerationChoice | null>(null)
  const [videoChoice, setVideoChoice] = useState<GenerationChoice | null>(null)
  const [videoModelOverride, setVideoModelId] = useState<string | undefined>()
  const defaultModelReadSequence = useRef(0)
  const [defaultVideoModelId, setDefaultVideoModelId] = useState<string | undefined>()
  const videoModelId = videoModelOverride || defaultVideoModelId
  const [generationSyncing, setGenerationSyncing] = useState(false)
  const generationSyncLock = useRef<Promise<void> | null>(null)
  const { projectId, chapterId } = useParams<{
    projectId?: string
    chapterId?: string
  }>()
  const location = useLocation()
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [projectVisualStyle, setProjectVisualStyle] = useState<'现实' | '动漫'>('现实')
  const [projectStyle, setProjectStyle] = useState<string>('真人都市')
  const [projectDefaultVideoRatio, setProjectDefaultVideoRatio] = useState<string>('')
  const { videoRatioOptions, defaultVideoRatio: capabilityDefaultVideoRatio } = useProjectStyleOptions()
  const [shots, setShots] = useState<StudioShot[]>([])
  const metadataSaves = useRef(new Map<string, Promise<void>>())
  const [shotRuntimeMap, setShotRuntimeMap] = useState<Record<string, ShotRuntimeState>>({})
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([])
  const locationSelectionAppliedRef = useRef(false)
  const lastSelectedIndexRef = useRef<number>(-1)
  const { store: detailStore, shotDetail, saving, error: detailSaveError, revision: detailSyncRevision } = useShotDetailSync(selectedShotId)
  const activeShotRef = useRef(selectedShotId)
  activeShotRef.current = selectedShotId
  const cameraUpdating = generationSyncing
  const [dialogLines, setDialogLines] = useState<ShotDialogLineRead[]>([])
  const [frameImages, setFrameImages] = useState<ShotFrameImageRead[]>([])
  const [sceneLinks, setSceneLinks] = useState<ProjectSceneLinkRead[]>([])
  const [actorImageLinks, setActorImageLinks] = useState<ProjectActorLinkRead[]>([])
  const [propLinks, setPropLinks] = useState<ProjectPropLinkRead[]>([])
  const [costumeLinks, setCostumeLinks] = useState<ProjectCostumeLinkRead[]>([])
  const [shotCharacterLinks, setShotCharacterLinks] = useState<ShotCharacterLinkRead[]>([])
  const [shotCandidateItems, setShotCandidateItems] = useState<ShotExtractedCandidateRead[]>([])
  const [shotDialogueCandidateItems, setShotDialogueCandidateItems] = useState<ShotExtractedDialogueCandidateRead[]>([])
  const shotCandidatesRequestSeqRef = useRef(0)
  const [shotDurations, setShotDurations] = useState<Record<string, number>>({})
  const [loadingShots, setLoadingShots] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [prefs, setPrefs] = useLocalStoragePrefs()
  const [generating, setGenerating] = useState(false)
  const [batchSkipExtractionUpdating, setBatchSkipExtractionUpdating] = useState(false)
  const [batchVideoReadinessOpen, setBatchVideoReadinessOpen] = useState(false)
  const [batchVideoReadinessLoading, setBatchVideoReadinessLoading] = useState(false)
  const [batchVideoReadinessItems, setBatchVideoReadinessItems] = useState<
    Array<{ shot: StudioShot; readiness: ShotVideoReadinessRead | null; error?: string }>
  >([])
  const [promptAssetsUpdating, setPromptAssetsUpdating] = useState(false)

  const [frameTab, setFrameTab] = useState<'head' | 'keyframes' | 'tail' | 'compare'>('keyframes')
  const [frameFileTagsMap, setFrameFileTagsMap] = useState<Record<string, string[]>>({})
  const [frameFileTagsLoading, setFrameFileTagsLoading] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [loopCurrent, setLoopCurrent] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [previewVideoFileId, setPreviewVideoFileId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoTime, setVideoTime] = useState(0)

  const [filter, setFilter] = useState<ShotFilter>('all')
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editingTitleValue, setEditingTitleValue] = useState('')
  const [draggingShotId, setDraggingShotId] = useState<string | null>(null)
  const [dragOverShotId, setDragOverShotId] = useState<string | null>(null)
  const [isResizing, setIsResizing] = useState(false)



  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<null | { type: 'left' | 'right'; startX: number; startLeft: number; startRight: number }>(null)
  const resizeRafRef = useRef<number | null>(null)
  const pendingResizeRef = useRef<null | { leftWidth?: number; rightWidth?: number }>(null)
  const showPreviewMinimizeButton = false
  const showPreviewFrameSegmented = false
  const showChapterTimeline = false
  const resolveShotVideoRatio = useCallback(
    (detail?: ShotDetailRead | null) => {
      const shotRatio = String(detail?.override_video_ratio ?? '').trim()
      const projectRatio = String(projectDefaultVideoRatio ?? '').trim()
      const fallbackRatio = String(capabilityDefaultVideoRatio ?? '').trim()
      return shotRatio || projectRatio || fallbackRatio
    },
    [capabilityDefaultVideoRatio, projectDefaultVideoRatio],
  )

  const hiddenKey = useMemo(() => (chapterId ? `jellyfish_hidden_shots_${chapterId}` : null), [chapterId])
  const hiddenIds = useMemo(() => {
    if (!hiddenKey) return new Set<string>()
    try {
      const raw = window.localStorage.getItem(hiddenKey)
      const arr = raw ? (JSON.parse(raw) as unknown) : []
      return new Set(Array.isArray(arr) ? (arr.filter((x) => typeof x === 'string') as string[]) : [])
    } catch {
      return new Set<string>()
    }
  }, [hiddenKey])

  const saveHiddenIds = (next: Set<string>) => {
    if (!hiddenKey) return
    try {
      window.localStorage.setItem(hiddenKey, JSON.stringify(Array.from(next)))
    } catch {
      // ignore
    }
  }

  const toggleHiddenShots = (ids: string[]) => {
    if (!hiddenKey) return
    const next = new Set(hiddenIds)
    ids.forEach((id) => {
      if (next.has(id)) next.delete(id)
      else next.add(id)
    })
    saveHiddenIds(next)
    setShots((prev) => prev.map((s) => (ids.includes(s.id) ? { ...s, hidden: next.has(s.id) } : s)))
  }

  const loadShots = async () => {
    if (!chapterId) return
    setLoadingShots(true)
    try {
      const [allShots, runtimeRes] = await Promise.all([
        loadAllPaginated<ShotRead>((page, pageSize) =>
          StudioShotsService.listShotsApiV1StudioShotsGet({
            chapterId,
            page,
            pageSize,
            order: 'index',
            isDesc: false,
          }),
        ),
        StudioShotsService.listShotRuntimeSummaryApiV1StudioShotsRuntimeSummaryGet({
          chapterId,
        }),
      ])
      const arr = allShots
      const runtimeItems: ShotRuntimeSummaryRead[] = runtimeRes.data ?? []
      setShotRuntimeMap(
        Object.fromEntries(
          runtimeItems.map((item) => [
            item.shot_id,
            {
              has_active_tasks: item.has_active_tasks,
              has_active_video_tasks: item.has_active_video_tasks,
              has_active_prompt_tasks: item.has_active_prompt_tasks,
              has_active_frame_tasks: item.has_active_frame_tasks,
              active_task_count: item.active_task_count,
            },
          ]),
        ),
      )
      // 给分镜补充一些“工作台态”的展示字段（后续可由后端返回）
      const enriched: StudioShot[] = arr
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((s, idx) => ({
          ...s,
          hidden: hiddenIds.has(s.id),
          hasProblem: idx === 4,
          hasSpeech: false,
          hasMusic: idx % 3 !== 0,
        }))

      setShots(enriched)

      // 剪辑工作台可在新标签页精确回到需返工的镜头；仅采纳本章真实 ID。
      const queryShotId = new URLSearchParams(location.search).get('shotId')
      const locationState = (location.state as { focusShotId?: string; selectedShotIds?: string[] } | null)
        || (queryShotId ? { focusShotId: queryShotId, selectedShotIds: [queryShotId] } : null)
      if (!locationSelectionAppliedRef.current && locationState) {
        const nextSelectedIds = (locationState.selectedShotIds ?? []).filter((id) =>
          enriched.some((shot) => shot.id === id),
        )
        const focusShotId =
          locationState.focusShotId && enriched.some((shot) => shot.id === locationState.focusShotId)
            ? locationState.focusShotId
            : nextSelectedIds[0] ?? null

        if (nextSelectedIds.length > 0) {
          setSelectedShotIds(nextSelectedIds)
        }
        if (focusShotId) {
          setSelectedShotId(focusShotId)
        }
        locationSelectionAppliedRef.current = true
        return
      }

      const selectedExists = selectedShotId ? enriched.some((s) => s.id === selectedShotId) : false
      if (!selectedShotId || !selectedExists) {
        const firstUnfinished = enriched.find((s) => !s.hidden && s.status !== 'ready')
        const firstVisible = enriched.find((s) => !s.hidden)
        setSelectedShotId((firstUnfinished ?? firstVisible ?? enriched[0])?.id ?? null)
      }
    } catch {
      message.error('加载分镜失败')
    } finally {
      setLoadingShots(false)
    }
  }

  const patchShotInList = (shotId: string, patch: Partial<StudioShot>) => {
    setShots((prev) => prev.map((s) => (s.id === shotId ? { ...s, ...patch } : s)))
  }

  /** 标题/剧本备注按镜头排队，回包只合并已提交字段，生成前等待队尾。 */
  const saveShotMetadata = (shotId: string, patch: { title?: string; script_excerpt?: string }) => {
    const work = (metadataSaves.current.get(shotId) || Promise.resolve()).catch(() => {}).then(async () => {
      const result = await StudioShotsService.updateShotApiV1StudioShotsShotIdPatch({ shotId, requestBody: patch })
      if (!result.data) throw new Error('镜头信息保存未返回结果')
      patchShotInList(shotId, Object.fromEntries(Object.keys(patch).map(key => [key, (result.data as any)[key]])))
    })
    metadataSaves.current.set(shotId, work)
    return work
  }
  /** 标题属于生成来源，失败向上抛出以阻止按旧标题生成。 */
  const updateShotTitleInOps = async (shotId: string, title: string) => {
    try { await saveShotMetadata(shotId, { title }) }
    catch (error) { message.error('保存标题失败'); throw error }
  }
  /** 镜头剧本备注与标题共享串行写入，防止迟到的完整响应相互覆盖。 */
  const updateShotScriptExcerptInOps = async (shotId: string, script_excerpt: string) => {
    try { await saveShotMetadata(shotId, { script_excerpt }) }
    catch (error) { message.error('保存备注失败'); throw error }
  }

  const deleteShotFromOps = async (shotId: string) => {
    try {
      await StudioShotsService.deleteShotApiV1StudioShotsShotIdDelete({ shotId })
      await loadShots()
      message.success('已删除')
    } catch {
      message.error('删除失败')
    }
  }

  const loadChapter = async () => {
    if (!chapterId) return
    try {
      const [chapterRes, projectRes] = await Promise.all([
        StudioChaptersService.getChapterApiV1StudioChaptersChapterIdGet({ chapterId }),
        projectId ? StudioProjectsService.getProjectApiV1StudioProjectsProjectIdGet({ projectId }) : Promise.resolve(null),
      ])
      const data = chapterRes.data
      if (!data) {
        setChapter(null)
        return
      }
      setChapter(toUIChapter(data))
      const nextVisualStyle = projectRes?.data?.visual_style
      const nextStyle = projectRes?.data?.style
      const nextDefaultRatio = typeof projectRes?.data?.default_video_ratio === 'string' ? projectRes.data.default_video_ratio : ''
      if (nextVisualStyle === '现实' || nextVisualStyle === '动漫') {
        setProjectVisualStyle(nextVisualStyle)
      }
      if (typeof nextStyle === 'string' && nextStyle.trim()) {
        setProjectStyle(nextStyle)
      }
      setProjectDefaultVideoRatio(nextDefaultRatio)
    } catch {
      // 章节信息仅用于标题展示，失败不阻断工作台
      setChapter(null)
      setProjectDefaultVideoRatio('')
    }
  }

  useEffect(() => {
    void loadShots()
    void loadChapter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, location.state, projectId])

  useEffect(() => {
    if (!selectedShotId) {
      shotCandidatesRequestSeqRef.current += 1
      detailStore.load('', null)
      setDialogLines([])
      setFrameImages([])
      setSceneLinks([])
      setActorImageLinks([])
      setPropLinks([])
      setCostumeLinks([])
      setShotCharacterLinks([])
      setShotCandidateItems([])
      setShotDialogueCandidateItems([])
      return
    }
    setLoadingDetail(true)
    const reqSeq = ++shotCandidatesRequestSeqRef.current
    setShotCandidateItems([])
    setShotDialogueCandidateItems([])
    Promise.all([
      StudioShotDetailsService.getShotDetailApiV1StudioShotDetailsShotIdGet({ shotId: selectedShotId }).then((r: any) => r.data ?? null),
      StudioShotDialogLinesService.listShotDialogLinesApiV1StudioShotDialogLinesGet({
        shotDetailId: selectedShotId,
        q: null,
        order: 'index',
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => r.data?.items ?? []),
      StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({
        shotDetailId: selectedShotId,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => r.data?.items ?? []),
      StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'scene',
        projectId: projectId ?? null,
        chapterId: chapterId ?? null,
        shotId: selectedShotId,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => r.data?.items ?? []),
      StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'actor',
        projectId: projectId ?? null,
        chapterId: chapterId ?? null,
        shotId: selectedShotId,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => r.data?.items ?? []),
      StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'prop',
        projectId: projectId ?? null,
        chapterId: chapterId ?? null,
        shotId: selectedShotId,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => r.data?.items ?? []),
      StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'costume',
        projectId: projectId ?? null,
        chapterId: chapterId ?? null,
        shotId: selectedShotId,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => r.data?.items ?? []),
      StudioShotCharacterLinksService.listShotCharacterLinksApiV1StudioShotCharacterLinksGet({
        shotId: selectedShotId,
      }).then((r: any) => (r.data ?? []) as ShotCharacterLinkRead[]),
      StudioShotsService.getShotExtractedCandidatesApiV1StudioShotsShotIdExtractedCandidatesGet({
        shotId: selectedShotId,
      }).then((r) => r.data ?? []),
      StudioShotsService.getShotExtractedDialogueCandidatesApiV1StudioShotsShotIdExtractedDialogueCandidatesGet({
        shotId: selectedShotId,
      }).then((r) => r.data ?? []),
    ])
      .then(([detail, dialogs, frames, scenes, actors, props, costumes, shotCharacters, candidates, dialogueCandidates]) => {
        if (reqSeq !== shotCandidatesRequestSeqRef.current) return
        detailStore.load(selectedShotId, detail)
        setDialogLines(dialogs)
        setFrameImages(frames)
        setSceneLinks(scenes)
        setActorImageLinks(actors)
        setPropLinks(props)
        setCostumeLinks(costumes)
        setShotCharacterLinks(shotCharacters)
        setShotCandidateItems(candidates as ShotExtractedCandidateRead[])
        setShotDialogueCandidateItems(dialogueCandidates as ShotExtractedDialogueCandidateRead[])
        if (detail?.duration != null) {
          setShotDurations((prev) => ({ ...prev, [selectedShotId]: detail.duration ?? 0 }))
        }
      })
      .catch(() => {
        if (reqSeq !== shotCandidatesRequestSeqRef.current) return
        message.error('加载分镜详情失败')
      })
      .finally(() => {
        if (reqSeq !== shotCandidatesRequestSeqRef.current) return
        setLoadingDetail(false)
      })
  }, [selectedShotId])

  useEffect(() => {
    // 选中分镜时同步多选的“主选中项”
    if (!selectedShotId) return
    if (selectedShotIds.includes(selectedShotId)) return
    setSelectedShotIds([selectedShotId])
  }, [selectedShotId, selectedShotIds])

  const selectedShot = useMemo(() => shots.find((s) => s.id === selectedShotId) ?? null, [shots, selectedShotId])
  useTaskPageContext(
    selectedShotId
      ? [
          {
            relationType: 'shot',
            relationEntityId: selectedShotId,
          },
        ]
      : [],
  )
  const selectedShots = useMemo(
    () => shots.filter((shot) => selectedShotIds.includes(shot.id)),
    [selectedShotIds, shots],
  )
  const currentPreviewVideoFileId = previewVideoFileId || selectedShot?.generated_video_file_id || null
  const currentPreviewVideoUrl = currentPreviewVideoFileId ? buildFileDownloadUrl(currentPreviewVideoFileId) ?? '' : ''

  useEffect(() => {
    // 切换分镜时：主预览区视频跟随分镜（清空手动选择的预览视频）
    setPreviewVideoFileId(null)
  }, [selectedShotId])

  const refreshDialogLines = async (shotId: string) => {
    const res = await StudioShotDialogLinesService.listShotDialogLinesApiV1StudioShotDialogLinesGet({
      shotDetailId: shotId,
      q: null,
      order: 'index',
      isDesc: false,
      page: 1,
      pageSize: 100,
    })
    setDialogLines(res.data?.items ?? [])
  }

  const refreshShotFrameImages = useCallback(async () => {
    if (!selectedShotId) return
    try {
      const res = await StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({
        shotDetailId: selectedShotId,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      })
      setFrameImages((res.data?.items ?? []) as ShotFrameImageRead[])
    } catch {
      message.error('刷新关键帧类型失败')
    }
  }, [selectedShotId])

  const deleteDialogLine = async (lineId: number) => {
    if (!selectedShotId) return
    await StudioShotDialogLinesService.deleteShotDialogLineApiV1StudioShotDialogLinesLineIdDelete({ lineId })
    await refreshDialogLines(selectedShotId)
  }

  const refreshPromptAssetLinks = async (shotId: string) => {
    const [scenes, actors, props, costumes] = await Promise.all([
      StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'scene',
        projectId: projectId ?? null,
        chapterId: chapterId ?? null,
        shotId,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => (r.data?.items ?? []) as ProjectSceneLinkRead[]),
      StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'actor',
        projectId: projectId ?? null,
        chapterId: chapterId ?? null,
        shotId,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => (r.data?.items ?? []) as ProjectActorLinkRead[]),
      StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'prop',
        projectId: projectId ?? null,
        chapterId: chapterId ?? null,
        shotId,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => (r.data?.items ?? []) as ProjectPropLinkRead[]),
      StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'costume',
        projectId: projectId ?? null,
        chapterId: chapterId ?? null,
        shotId,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      }).then((r: any) => (r.data?.items ?? []) as ProjectCostumeLinkRead[]),
    ])
    setSceneLinks(scenes)
    setActorImageLinks(actors)
    setPropLinks(props)
    setCostumeLinks(costumes)
  }

  const loadShotCandidateItems = useCallback(async (shotId: string) => {
    try {
      const res = await StudioShotsService.getShotExtractedCandidatesApiV1StudioShotsShotIdExtractedCandidatesGet({
        shotId,
      })
      setShotCandidateItems(res.data ?? [])
    } catch {
      setShotCandidateItems([])
    }
  }, [])

  const loadShotDialogueCandidateItems = useCallback(async (shotId: string) => {
    try {
      const res = await StudioShotsService.getShotExtractedDialogueCandidatesApiV1StudioShotsShotIdExtractedDialogueCandidatesGet({
        shotId,
      })
      setShotDialogueCandidateItems(res.data ?? [])
    } catch {
      setShotDialogueCandidateItems([])
    }
  }, [])

  const batchUpdateSkipExtraction = useCallback(
    async (skip: boolean) => {
      const targetShots = selectedShots.filter((shot) => Boolean(shot.skip_extraction) !== skip)
      if (targetShots.length === 0) {
        message.info(skip ? '所选分镜已全部标记为无需提取' : '所选分镜已全部恢复提取')
        return
      }
      setBatchSkipExtractionUpdating(true)
      try {
        const results = await Promise.all(
          targetShots.map(async (shot) => {
            const res = await StudioShotsService.updateShotSkipExtractionApiV1StudioShotsShotIdSkipExtractionPatch({
              shotId: shot.id,
              requestBody: { skip },
            })
            return { shotId: shot.id, data: res.data?.state.shot ?? null }
          }),
        )
        results.forEach(({ shotId, data }) => {
          if (data) {
            patchShotInList(shotId, data as Partial<StudioShot>)
          } else {
            patchShotInList(shotId, { skip_extraction: skip })
          }
        })
        if (selectedShotId && targetShots.some((shot) => shot.id === selectedShotId)) {
          await Promise.all([
            loadShotCandidateItems(selectedShotId),
            loadShotDialogueCandidateItems(selectedShotId),
          ])
        }
        message.success(
          skip
            ? `已批量标记 ${targetShots.length} 条分镜为无需提取`
            : `已批量恢复 ${targetShots.length} 条分镜的提取确认流程`,
        )
      } catch {
        message.error(skip ? '批量标记无需提取失败' : '批量恢复提取失败')
      } finally {
        setBatchSkipExtractionUpdating(false)
      }
    },
    [loadShotCandidateItems, loadShotDialogueCandidateItems, patchShotInList, selectedShotId, selectedShots],
  )

  const fetchBatchVideoReadiness = useCallback(async () => {
    if (selectedShots.length === 0) {
      message.info('请先选择要检查的视频分镜')
      return [] as Array<{ shot: StudioShot; readiness: ShotVideoReadinessRead | null; error?: string }>
    }
    const capability = (await LlmService.getVideoGenerationOptionsApiV1LlmVideoGenerationOptionsGet({})).data
    if (!capability) throw new Error('无法读取视频模型能力，请先配置默认视频模型')
    return Promise.all(
      selectedShots
        .slice()
        .sort((a, b) => a.index - b.index)
        .map(async (shot) => {
          try {
            const res = await StudioShotsService.getShotVideoReadinessApiApiV1StudioShotsShotIdVideoReadinessGet({
              shotId: shot.id,
              referenceMode: capability.requires_first_frame ? 'first' : 'text_only',
            })
            return {
              shot,
              readiness: (res.data ?? null) as ShotVideoReadinessRead | null,
            }
          } catch {
            return {
              shot,
              readiness: null,
              error: '视频准备度检查失败，请稍后重试',
            }
          }
        }),
    )
  }, [selectedShots])

  const batchInspectVideoReadiness = useCallback(async () => {
    setBatchVideoReadinessOpen(true)
    setBatchVideoReadinessLoading(true)
    try {
      const results = await fetchBatchVideoReadiness()
      setBatchVideoReadinessItems(results)
    } finally {
      setBatchVideoReadinessLoading(false)
    }
  }, [fetchBatchVideoReadiness])

  /** Build independent web requests from each shot's saved state, without reading an API model. */
  const prepareWebBatch = async (ids:string[],video:boolean,frameType:'first'|'key'|'last'='key'):Promise<HandoffTarget[]> => {
    const prepared:HandoffTarget[]=[]
    if(ids.length>50)throw new Error('每批最多 50 个镜头，请分批选择')
    for(const id of [...ids]){
      const detail=(await StudioShotDetailsService.getShotDetailApiV1StudioShotDetailsShotIdGet({shotId:id})).data
      if(!detail)throw new Error(`镜头 ${id} 已不存在`)
      const frames=(await StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({shotDetailId:id,pageSize:100})).data?.items||[]
      if(video){
        const seconds=Number(detail.duration),ratio=resolveShotVideoRatio(detail)
        if(!seconds||!ratio)throw new Error(`镜头 ${id} 缺少时长或画幅，未提交本批任务`)
        const first=frames.find(f=>f.frame_type==='first'&&f.file_id)?.file_id
        const refs=first?[first]:[]
        const rendered=await StudioGenerationPromptsService.renderShotVideoPromptApiV1StudioGenerationPromptsShotsShotIdVideoRenderPost({shotId:id,requestBody:{reference_mode:first?'first':'text_only',prompt:null,image_file_ids:refs}})
        const version=await StudioWebGenerationService.targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({targetType:'shot',entityId:id,slotId:1})
        prepared.push({target_type:'shot',entity_id:id,expected_version:version.version,prompt:rendered.data?.execution_prompt||'',reference_file_ids:refs,duration_seconds:seconds,aspect_ratio:ratio,reference_mode:first?'first_frame':'text'})
      }else{
        let slot=frames.find(f=>f.frame_type===frameType)
        if(!slot)slot=(await StudioShotFrameImagesService.createShotFrameImageApiV1StudioShotFrameImagesPost({requestBody:{shot_detail_id:id,frame_type:frameType}})).data||undefined
        if(!slot)throw new Error(`镜头 ${id} 无法准备关键帧槽位`)
        const refs=(detail as any).frame_reference_selections?.[frameType]||[]
        const rendered=await StudioGenerationPromptsService.renderShotFramePromptApiV1StudioGenerationPromptsShotsShotIdFramesFrameTypeRenderPost({shotId:id,frameType,requestBody:{prompt:(frameType==='first'?detail.first_frame_prompt:frameType==='last'?detail.last_frame_prompt:detail.key_frame_prompt)||undefined,images:refs.map((file_id:string)=>({type:'file',id:file_id,name:file_id,file_id}))}})
        const version=await StudioWebGenerationService.targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({targetType:'frame',entityId:id,slotId:slot.id})
        prepared.push({target_type:'frame',entity_id:id,slot_id:slot.id,expected_version:version.version,prompt:rendered.data?.execution_prompt||'',reference_file_ids:refs})
      }
    }
    if(prepared.some(item=>!item.prompt.trim()))throw new Error('部分镜头未能生成有效提示词，未提交本批任务')
    return prepared
  }

  const runBatchGenerateFrames = useCallback(
    async (targetShotIds: string[]) => {
      const prepared: Parameters<typeof StudioGenerationTasksService.submitShotFrameGenerationTaskApiV1StudioGenerationTasksShotsShotIdFramesFrameTypePost>[0][] = []
      for (const id of targetShotIds) {
        const framesRes = await StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({
          shotDetailId: id,
          order: null,
          isDesc: false,
          page: 1,
          pageSize: 100,
        })
        const frames = framesRes.data?.items ?? []
        const target = frames.find((x) => x.frame_type === 'key') ?? frames[0]
        if (!target) continue

        const detailRes: any = await StudioShotDetailsService.getShotDetailApiV1StudioShotDetailsShotIdGet({ shotId: id })
        const d = detailRes?.data as any
        const prompt =
          (target.frame_type === 'first'
            ? d?.first_frame_prompt
            : target.frame_type === 'last'
              ? d?.last_frame_prompt
              : d?.key_frame_prompt) ?? ''
        if (!String(prompt || '').trim()) continue

        const linked = await StudioShotsService.listShotLinkedAssetsApiV1StudioShotsShotIdLinkedAssetsGet({
          shotId: id,
          page: 1,
          pageSize: 100,
        })
        const items = (linked.data?.items ?? []) as any[]
        const extractFileId = (thumbnail?: string | null): string | null => {
          const v = (thumbnail || '').trim()
          if (!v) return null
          if (!v.includes('/') && !v.includes(':')) return v
          try {
            const url = new URL(v, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
            const m = url.pathname.match(/\/api\/v1\/studio\/files\/([^/]+)\/download\/?$/)
            if (m?.[1]) return decodeURIComponent(m[1])
          } catch {
            // ignore
          }
          return null
        }
        const imagesPayload = items
          .map((x) => {
            const fileId = typeof x?.file_id === 'string' && x.file_id.trim() ? x.file_id.trim() : extractFileId(x?.thumbnail)
            return fileId
              ? {
                  type: x?.type as any,
                  id: String(x?.id ?? ''),
                  name: String(x?.name ?? x?.id ?? ''),
                  file_id: fileId,
                }
              : null
          })
          .filter(Boolean)
        const selectedIds = d?.frame_reference_selections?.[target.frame_type] ?? imagesPayload.map(image => image!.file_id)
        const selectedItems = selectedIds.map((fid: string) => imagesPayload.find(image => image?.file_id === fid)
          ?? { type: 'file' as const, id: fid, name: fid, file_id: fid })
        const rendered = await StudioGenerationPromptsService.renderShotFramePromptApiV1StudioGenerationPromptsShotsShotIdFramesFrameTypeRenderPost({
          shotId: id, frameType: target.frame_type, requestBody: { prompt, images: selectedItems },
        })
        const targetRatio = resolveShotVideoRatio(d)
        if (!targetRatio) continue
        prepared.push({
          shotId: id,
          frameType: target.frame_type,
          requestBody: {
            model_id: null,
            execution_prompt: rendered.data?.execution_prompt || prompt,
            media: {
              references: selectedItems.map((image: { file_id: string }, ordinal: number) => ({
                file_id: image.file_id,
                media_kind: 'image' as const,
                ordinal,
              })),
            },
            operation_input: {
              kind: 'image_generation',
              target_ratio: targetRatio,
              count: 1,
            },
          },
        })
      }
      const reviewed = await reviewGenerationBatch(prepared.map(item => item.requestBody))
      for (const [index, item] of prepared.entries()) {
        await StudioGenerationTasksService.submitShotFrameGenerationTaskApiV1StudioGenerationTasksShotsShotIdFramesFrameTypePost({ ...item, requestBody: reviewed[index] })
      }
    },
    [resolveShotVideoRatio],
  )

  // 视频批处理必须提交 video_generation，避免历史实现把“批量生成”误路由成关键帧图片任务。
  const runBatchGenerateVideos = useCallback(
    async (targetShotIds: string[]) => {
      const prepared: Parameters<typeof StudioGenerationTasksService.submitShotVideoGenerationTaskApiV1StudioGenerationTasksShotsShotIdVideoPost>[0][] = []
      let submitted = 0
      let skipped = 0
      const capability = (await LlmService.getVideoGenerationOptionsApiV1LlmVideoGenerationOptionsGet({})).data
      if (!capability) throw new Error('无法读取视频模型能力')
      if (capability.requires_subject_reference) throw new Error('该型号必须提供主体参考，当前批量入口不支持，请改用支持主体素材的生成入口')
      for (const id of targetShotIds) {
        const detailRes: any = await StudioShotDetailsService.getShotDetailApiV1StudioShotDetailsShotIdGet({ shotId: id })
        const detail = detailRes?.data as any
        const ratio = resolveShotVideoRatio(detail)
        const seconds = Number(detail?.duration ?? 0)
        if (!ratio || !Number.isFinite(seconds) || seconds <= 0) {
          skipped += 1
          continue
        }
        let firstFrameFileId: string | null = null
        if (capability.requires_first_frame) {
          const frames = await StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({ shotDetailId: id, pageSize: 100 })
          firstFrameFileId = frames.data?.items.find((frame) => frame.frame_type === 'first' && frame.file_id)?.file_id ?? null
          if (!firstFrameFileId) { skipped += 1; continue }
        }
        const rendered = await StudioGenerationPromptsService.renderShotVideoPromptApiV1StudioGenerationPromptsShotsShotIdVideoRenderPost({
          shotId: id,
          requestBody: {
            reference_mode: firstFrameFileId ? 'first' : 'text_only',
            prompt: null,
            image_file_ids: firstFrameFileId ? [firstFrameFileId] : [],
          },
        })
        const executionPrompt = String(rendered.data?.execution_prompt ?? '').trim()
        if (!executionPrompt) {
          skipped += 1
          continue
        }
        prepared.push({
          shotId: id,
          requestBody: {
            model_id: capability.model_id,
            execution_prompt: executionPrompt,
            media: {
              frames: { first: firstFrameFileId ? { file_id: firstFrameFileId, media_kind: 'image' } : null, last: null, keys: [] },
              subjects: [],
            },
            operation_input: {
              kind: 'video_generation',
              ratio,
              seconds,
            },
          },
        })
      }
      const reviewed = await reviewGenerationBatch(prepared.map(item => item.requestBody))
      for (const [index, item] of prepared.entries()) {
        await StudioGenerationTasksService.submitShotVideoGenerationTaskApiV1StudioGenerationTasksShotsShotIdVideoPost({ ...item, requestBody: reviewed[index] })
        submitted += 1
      }
      return { submitted, skipped }
    },
    [resolveShotVideoRatio],
  )

  const updatePromptProps = async (propIds: string[]) => {
    if (!selectedShotId || !projectId) return
    const next = Array.from(new Set(propIds.map((x) => x.trim()).filter(Boolean)))
    setPromptAssetsUpdating(true)
    try {
      const currentLinks = propLinks.filter((l) => (l.shot_id ?? null) === selectedShotId)
      await Promise.all(currentLinks.map((l) => StudioShotLinksService.deleteProjectPropLinkApiV1StudioShotLinksPropLinkIdDelete({ linkId: l.id })))
      await Promise.all(
        next.map((pid) =>
          StudioShotLinksService.createProjectPropLinkApiV1StudioShotLinksPropPost({
            requestBody: { project_id: projectId, chapter_id: chapterId ?? null, shot_id: selectedShotId, asset_id: pid },
          }),
        ),
      )
      await refreshPromptAssetLinks(selectedShotId)
      await loadShotCandidateItems(selectedShotId)
    } catch {
      message.error('更新道具失败')
    } finally {
      setPromptAssetsUpdating(false)
    }
  }

  const updatePromptCostumes = async (costumeIds: string[]) => {
    if (!selectedShotId || !projectId) return
    const next = Array.from(new Set(costumeIds.map((x) => x.trim()).filter(Boolean)))
    setPromptAssetsUpdating(true)
    try {
      const currentLinks = costumeLinks.filter((l) => (l.shot_id ?? null) === selectedShotId)
      await Promise.all(currentLinks.map((l) => StudioShotLinksService.deleteProjectCostumeLinkApiV1StudioShotLinksCostumeLinkIdDelete({ linkId: l.id })))
      await Promise.all(
        next.map((cid) =>
          StudioShotLinksService.createProjectCostumeLinkApiV1StudioShotLinksCostumePost({
            requestBody: { project_id: projectId, chapter_id: chapterId ?? null, shot_id: selectedShotId, asset_id: cid },
          }),
        ),
      )
      await refreshPromptAssetLinks(selectedShotId)
      await loadShotCandidateItems(selectedShotId)
    } catch {
      message.error('更新服装失败')
    } finally {
      setPromptAssetsUpdating(false)
    }
  }

  const updatePromptScene = async (sceneId?: string) => {
    if (!selectedShotId || !projectId) return
    setPromptAssetsUpdating(true)
    try {
      const currentLinks = sceneLinks.filter((l) => (l.shot_id ?? null) === selectedShotId)
      await Promise.all(currentLinks.map((l) => StudioShotLinksService.deleteProjectSceneLinkApiV1StudioShotLinksSceneLinkIdDelete({ linkId: l.id })))
      const nextSceneId = (sceneId ?? '').trim()
      if (nextSceneId) {
        await StudioShotLinksService.createProjectSceneLinkApiV1StudioShotLinksScenePost({
          requestBody: {
            project_id: projectId,
            chapter_id: chapterId ?? null,
            shot_id: selectedShotId,
            asset_id: nextSceneId,
          },
        })
      }
      await refreshPromptAssetLinks(selectedShotId)
      await loadShotCandidateItems(selectedShotId)
      patchShotDetailLocal({ scene_id: nextSceneId || null })
    } catch {
      message.error('更新场景失败')
    } finally {
      setPromptAssetsUpdating(false)
    }
  }

  const updatePromptActors = async (actorIds: string[]) => {
    if (!selectedShotId) return
    const next = Array.from(new Set(actorIds.map((x) => x.trim()).filter(Boolean)))
    const current = shotCharacterLinks
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((x) => x.character_id)
    const removed = current.filter((id) => !next.includes(id))
    if (removed.length > 0) {
      message.warning('当前接口暂不支持移除已关联角色，仅会新增或重排')
    }
    if (next.length === 0) return
    setPromptAssetsUpdating(true)
    try {
      await Promise.all(
        next.map((characterId, index) =>
          StudioShotCharacterLinksService.upsertShotCharacterLinkApiV1StudioShotCharacterLinksPost({
            requestBody: { shot_id: selectedShotId, character_id: characterId, index, note: '' },
          }),
        ),
      )
      const refreshed = await StudioShotCharacterLinksService.listShotCharacterLinksApiV1StudioShotCharacterLinksGet({ shotId: selectedShotId })
      setShotCharacterLinks((refreshed.data ?? []) as ShotCharacterLinkRead[])
      await loadShotCandidateItems(selectedShotId)
    } catch {
      message.error('更新角色失败')
    } finally {
      setPromptAssetsUpdating(false)
    }
  }

  const generateFrameImageTask = async (apiConfirmed=false) => {
    if (!selectedShotId) return
    if(!apiConfirmed){
      const id=selectedShotId,type=frameTab==='head'?'first':frameTab==='tail'?'last':'key'
      const dialog=Modal.info({title:'生成当前帧 · 选择通道',content:'快捷键只打开生成选择，不直接调用模型。',footer:()=> <GenerationChannelActions apiAction={<Button type="primary" onClick={()=>{dialog.destroy();void generateFrameImageTask(true)}}>API 生成</Button>} webAction={<WebHandoffButton prepare={async()=>(await prepareWebBatch([id],false,type))[0]} onAccepted={()=>dialog.destroy()}/>}/>})
      return
    }
    const target =
      (frameTab === 'head' && frameImages.find((x) => x.frame_type === 'first')) ||
      (frameTab === 'tail' && frameImages.find((x) => x.frame_type === 'last')) ||
      frameImages.find((x) => x.frame_type === 'key') ||
      frameImages[0]
    if (!target) {
      message.warning('请先添加一张分镜帧图（frame image）')
      return
    }
    const prompt =
      (target.frame_type === 'first'
        ? shotDetail?.first_frame_prompt
        : target.frame_type === 'last'
          ? shotDetail?.last_frame_prompt
          : shotDetail?.key_frame_prompt) ?? ''
    if (!prompt.trim()) {
      message.warning('请先生成或填写提示词')
      return
    }
    setGenerating(true)
    try {
      const linked = await StudioShotsService.listShotLinkedAssetsApiV1StudioShotsShotIdLinkedAssetsGet({
        shotId: selectedShotId,
        page: 1,
        pageSize: 100,
      })
      const items = (linked.data?.items ?? []) as any[]
      const extractFileId = (thumbnail?: string | null): string | null => {
        const v = (thumbnail || '').trim()
        if (!v) return null
        if (!v.includes('/') && !v.includes(':')) return v
        try {
          const url = new URL(v, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
          const m = url.pathname.match(/\/api\/v1\/studio\/files\/([^/]+)\/download\/?$/)
          if (m?.[1]) return decodeURIComponent(m[1])
        } catch {
          // ignore
        }
        return null
      }
      const imagesPayload = items
        .map((x) => {
          const fileId = typeof x?.file_id === 'string' && x.file_id.trim() ? x.file_id.trim() : extractFileId(x?.thumbnail)
          return fileId
            ? {
                type: x?.type as any,
                id: String(x?.id ?? ''),
                name: String(x?.name ?? x?.id ?? ''),
                file_id: fileId,
              }
            : null
        })
        .filter(Boolean)
      const selectedIds = shotDetail?.frame_reference_selections?.[target.frame_type] ?? imagesPayload.map(image => image!.file_id)
      const selectedItems = selectedIds.map((fid: string) => imagesPayload.find(image => image?.file_id === fid)
        ?? { type: 'file' as const, id: fid, name: fid, file_id: fid })
      const rendered = await StudioGenerationPromptsService.renderShotFramePromptApiV1StudioGenerationPromptsShotsShotIdFramesFrameTypeRenderPost({
        shotId: selectedShotId, frameType: target.frame_type, requestBody: { prompt, images: selectedItems },
      })
      const targetRatio = resolveShotVideoRatio(shotDetail)
      if (!targetRatio) {
        message.warning('请先设置视频比例')
        return
      }
      await StudioGenerationTasksService.submitShotFrameGenerationTaskApiV1StudioGenerationTasksShotsShotIdFramesFrameTypePost({
        shotId: selectedShotId,
        frameType: target.frame_type,
        requestBody: await reviewGenerationRequest({
          model_id: null,
          execution_prompt: rendered.data?.execution_prompt || prompt,
          media: {
            references: selectedItems.map((image: { file_id: string }, ordinal: number) => ({
              file_id: image.file_id,
              media_kind: 'image' as const,
              ordinal,
            })),
          },
          operation_input: {
            kind: 'image_generation',
            target_ratio: targetRatio,
            count: 1,
          },
        }, undefined, imageChoice),
      })
      message.success('已创建生成任务')
    } catch {
      message.error('创建生成任务失败')
    } finally {
      setGenerating(false)
    }
  }

  const currentFrameSlot = useMemo(() => {
    if (frameTab === 'head') return frameImages.find((x) => x.frame_type === 'first') ?? null
    if (frameTab === 'tail') return frameImages.find((x) => x.frame_type === 'last') ?? null
    return frameImages.find((x) => x.frame_type === 'key') ?? frameImages[0] ?? null
  }, [frameImages, frameTab])

  const currentFrameFileId = useMemo(() => {
    const fid = currentFrameSlot?.file_id ?? null
    return fid ? String(fid) : null
  }, [currentFrameSlot?.file_id])

  const currentFrameFileTags = useMemo(() => {
    if (!currentFrameFileId) return []
    return frameFileTagsMap[currentFrameFileId] ?? []
  }, [currentFrameFileId, frameFileTagsMap])

  useEffect(() => {
    if (!currentFrameFileId) return
    if (frameFileTagsMap[currentFrameFileId]) return
    let canceled = false
    setFrameFileTagsLoading(true)
    void (async () => {
      try {
        const res = await StudioFilesService.getFileDetailApiV1StudioFilesFileIdGet({ fileId: currentFrameFileId })
        if (canceled) return
        const tagsRaw = Array.isArray((res.data as any)?.tags) ? ((res.data as any).tags as string[]).filter(Boolean) : []
        setFrameFileTagsMap((prev) => ({ ...prev, [currentFrameFileId]: normalizeFrameExclusiveTags(tagsRaw) }))
      } catch {
        if (!canceled) setFrameFileTagsMap((prev) => ({ ...prev, [currentFrameFileId]: [] }))
      } finally {
        if (!canceled) setFrameFileTagsLoading(false)
      }
    })()
    return () => {
      canceled = true
    }
  }, [currentFrameFileId, frameFileTagsMap])

  const updateCurrentFrameFileTags = useCallback(
    async (nextTags: string[]) => {
      if (!currentFrameFileId) return
      const cleaned = Array.from(
        new Set(
          (nextTags || [])
            .map((x) => String(x ?? '').trim())
            .filter((x) => x.length > 0),
        ),
      )
      const normalized = normalizeFrameExclusiveTags(cleaned)
      setFrameFileTagsLoading(true)
      setFrameFileTagsMap((prev) => ({ ...prev, [currentFrameFileId]: normalized }))
      try {
        await StudioFilesService.updateFileMetaApiV1StudioFilesFileIdPatch({
          fileId: currentFrameFileId,
          requestBody: { tags: normalized } as any,
        })
      } catch {
        message.error('更新标签失败')
      } finally {
        setFrameFileTagsLoading(false)
      }
    },
    [currentFrameFileId],
  )

  // 选中分镜后若开启自动展开属性面板：默认展开（尤其是未就绪分镜）
  useEffect(() => {
    if (!selectedShot) return
    if (!prefs.autoOpenInspector) return
    if (prefs.inspectorOpen) return
    // “若无视频则自动展开”：这里用 status !== ready 作为近似判定
    if (selectedShot.status !== 'ready') {
      setPrefs((p) => ({ ...p, inspectorOpen: true }))
    }
  }, [prefs.autoOpenInspector, prefs.inspectorOpen, selectedShot, setPrefs])

  /** 所有标签页编辑使用同一镜头草稿；网络回包不能整份覆盖尚未保存的字段。 */
  const patchShotDetailLocal = (patch: Partial<ShotDetailRead>) => {
    if (!selectedShotId) return
    // 帧引用已有独立保存接口，此处只接收已保存值，避免重复PATCH只读字段。
    if ('frame_reference_selections' in patch) {
      detailStore.load(selectedShotId, { ...shotDetail!, ...patch }); return
    }
    detailStore.patch(selectedShotId, patch)
  }
  /** 情绪标签复用同一串行队列，切镜头后保存仍绑定原镜头。 */
  const saveShotMoodTags = async (shotId: string, tags: string[]) => {
    detailStore.patch(shotId, { mood_tags: tags }); await detailStore.flush(shotId)
  }
  /** 镜头语言即时显示并保存；失败保留编辑，统一阻止生成。 */
  const patchShotDetailImmediate = async (patch: Partial<ShotDetailRead>) => {
    if (!selectedShotId) return
    detailStore.patch(selectedShotId, patch)
    try { await detailStore.flush(selectedShotId) } catch { message.error('镜头设置保存失败，请重试后生成') }
  }
  /** 生成前和返回视频页时先完成保存，再读取真实详情、已采用帧和当前默认配置。 */
  const syncGenerationInputs = async () => {
    if (generationSyncLock.current) return generationSyncLock.current
    const shotId = activeShotRef.current
    if (!shotId) throw new Error('请先选择镜头')
    const work = (async () => {
      setGenerationSyncing(true)
      try {
        await metadataSaves.current.get(shotId)
        await detailStore.flush(shotId)
        const readRevision = detailStore.revision
        const [detail, frames, settings, project, shot] = await Promise.all([
          StudioShotDetailsService.getShotDetailApiV1StudioShotDetailsShotIdGet({ shotId }),
          StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({ shotDetailId: shotId, page: 1, pageSize: 100 }),
          LlmService.getModelSettingsApiV1LlmModelSettingsGet(),
          projectId ? StudioProjectsService.getProjectApiV1StudioProjectsProjectIdGet({ projectId }) : Promise.resolve(null),
          StudioShotsService.getShotApiV1StudioShotsShotIdGet({ shotId }),
        ])
        if (activeShotRef.current !== shotId) throw new Error('已切换镜头，请在当前镜头重新操作')
        if (!detail.data) throw new Error('未取得最新镜头设置')
        if (detailStore.revision !== readRevision || Object.keys(detailStore.entry(shotId).pending).length) throw new Error('设置又有修改，请保存完成后重新生成')
        // 在调用方继续构建预览前，提交同一批最新状态，避免异步闭包读取上次渲染值。
        flushSync(() => {
          detailStore.load(shotId, detail.data!)
          if (shot.data) patchShotInList(shotId, shot.data as any)
          setFrameImages(frames.data?.items || [])
          defaultModelReadSequence.current++
          setDefaultVideoModelId(settings.data?.default_video_model_id || undefined)
          setProjectDefaultVideoRatio(project?.data?.default_video_ratio || '')
        })
      } finally { setGenerationSyncing(false) }
    })()
    generationSyncLock.current = work
    try { await work } finally { generationSyncLock.current = null }
  }
  /** 默认模型是当前系统的共享配置；项目设置入口目前也跳转此处。 */
  useEffect(() => {
    let active = true
    setVideoModelId(undefined)
    const loadDefault = () => { const requestId = ++defaultModelReadSequence.current; void LlmService.getModelSettingsApiV1LlmModelSettingsGet().then(response => {
      if (active && requestId === defaultModelReadSequence.current) setDefaultVideoModelId(response.data?.default_video_model_id || undefined)
    }).catch(() => { if (active) message.warning('默认视频模型读取失败，请刷新后重试') }) }
    loadDefault(); window.addEventListener('focus', loadDefault)
    return () => { active = false; window.removeEventListener('focus', loadDefault) }
  }, [projectId])
  useEffect(() => {
    if (selectedShotId && shotDetail?.duration != null) setShotDurations(values => ({ ...values, [selectedShotId]: shotDetail.duration! }))
  }, [selectedShotId, shotDetail?.duration])

  // 播放器：同步时间与状态
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTimeUpdate = () => setVideoTime(v.currentTime || 0)
    const onLoaded = () => setVideoDuration(v.duration || 0)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('loadedmetadata', onLoaded)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [selectedShotId])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.loop = loopCurrent
  }, [loopCurrent])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !currentPreviewVideoUrl) return
    v.load()
    void v.play().catch(() => {
      // 浏览器策略可能阻止自动播放，保留静默失败
    })
  }, [currentPreviewVideoUrl])

  // 快捷键：←/→ 切换分镜，Space 播放暂停，P/Ctrl+I 面板，H 隐藏，M 合并，Ctrl/Cmd+Enter 保存并生成
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const key = e.key.toLowerCase()

      if (key === 'p' || (key === 'i' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        setPrefs((p) => ({ ...p, inspectorOpen: !p.inspectorOpen }))
        return
      }

      if (key === ' ') {
        e.preventDefault()
        const v = videoRef.current
        if (!v) return
        if (v.paused) void v.play()
        else v.pause()
        return
      }

      if (key === 'arrowleft' || key === 'arrowright') {
        e.preventDefault()
        const visible = shots.filter((s) => !s.hidden)
        const idx = visible.findIndex((s) => s.id === selectedShotId)
        if (idx === -1) return
        const next = key === 'arrowleft' ? visible[idx - 1] : visible[idx + 1]
        if (next) setSelectedShotId(next.id)
        return
      }

      if ((e.ctrlKey || e.metaKey) && key === 'enter') {
        e.preventDefault()
        void generateFrameImageTask()
        return
      }

      if (key === 'h') {
        e.preventDefault()
        if (!selectedShotId) return
        toggleHiddenShots([selectedShotId])
        return
      }

      if (key === 'm') {
        e.preventDefault()
        if (selectedShotIds.length < 2) {
          message.info('请先多选至少 2 个分镜再合并')
          return
        }
        Modal.confirm({
          title: `合并 ${selectedShotIds.length} 个分镜？`,
          content: '将它们合并为一个新的分镜（Mock 行为）。',
          okText: '合并',
          cancelText: '取消',
          onOk: () => {
            message.success('已合并（Mock）')
          },
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedShotId, selectedShotIds.length, shots, setPrefs])

  const statusTag = (status: ShotStatus | undefined) => {
    const s = status ?? 'pending'
    const map = { pending: 'default', generating: 'processing', ready: 'success' } as const
    const text = { pending: '待确认', generating: '生成中', ready: '已就绪' } as const
    return <Tag color={map[s]}>{text[s]}</Tag>
  }

  const statusDotClass = (status: ShotStatus | undefined) => {
    if (status === 'generating') return 'cs-generating'
    if (status === 'ready') return 'cs-ready'
    return 'cs-pending'
  }

  const getShotReadinessFlags = useCallback((shot: StudioShot) => {
    const runtime = shotRuntimeMap[shot.id]
    const isReady = !shot.hidden && shot.status === 'ready'
    const isGenerating = !shot.hidden && Boolean(runtime?.has_active_tasks)
    const isPendingConfirm = !shot.hidden && shot.status === 'pending'
    const hasProblem = Boolean(shot.hasProblem)
    const missing: string[] = []
    if (isPendingConfirm) missing.push('待确认')
    if (isGenerating) missing.push('生成中')
    return {
      isReady,
      isGenerating,
      isPendingConfirm,
      hasProblem,
      missing,
    }
  }, [shotRuntimeMap])

  const getShotProgressCount = useCallback(
    (shot: StudioShot) => {
      return [shot.status !== 'pending', shot.status === 'ready'].filter(Boolean).length
    },
    [getShotReadinessFlags],
  )

  const getShotPrimaryHint = useCallback(
    (shot: StudioShot) => {
      const flags = getShotReadinessFlags(shot)
      if (flags.hasProblem) return '存在待处理问题'
      if (flags.isGenerating) {
        const runtime = shotRuntimeMap[shot.id]
        return `镜头相关任务进行中（${runtime?.active_task_count ?? 1}）`
      }
      if (flags.isPendingConfirm) {
        return shot.skip_extraction
          ? '已标记无需提取，等待系统完成流程状态同步'
          : '请先完成信息提取确认'
      }
      return '镜头已具备视频生成前置条件'
    },
    [getShotReadinessFlags, shotRuntimeMap],
  )

  const chapterTitle = useMemo(() => {
    if (!chapter) return '章节生成工作台'
    return `第${chapter.index}章 · ${chapter.title.replace(/^第\d+[集章：:\s]*/g, '').trim() || chapter.title}`
  }, [chapter])

  const filteredShots = useMemo(() => {
    const list = shots.slice().sort((a, b) => a.index - b.index)
    switch (filter) {
      case 'pendingConfirm':
        return list.filter((s) => getShotReadinessFlags(s).isPendingConfirm)
      case 'generating':
        return list.filter((s) => getShotReadinessFlags(s).isGenerating)
      case 'ready':
        return list.filter((s) => getShotReadinessFlags(s).isReady)
      case 'hidden':
        return list.filter((s) => Boolean(s.hidden))
      case 'problem':
        return list.filter((s) => !s.hidden && Boolean(s.hasProblem))
      default:
        return list
    }
  }, [filter, getShotReadinessFlags, shots])

  const shotFilterCounts = useMemo(() => {
    const list = shots.slice()
    return {
      all: list.length,
      pendingConfirm: list.filter((s) => getShotReadinessFlags(s).isPendingConfirm).length,
      generating: list.filter((s) => getShotReadinessFlags(s).isGenerating).length,
      ready: list.filter((s) => getShotReadinessFlags(s).isReady).length,
      hidden: list.filter((s) => Boolean(s.hidden)).length,
      problem: list.filter((s) => !s.hidden && Boolean(s.hasProblem)).length,
    } satisfies Record<ShotFilter, number>
  }, [getShotReadinessFlags, shots])

  const multiToolbarVisible = selectedShotIds.length > 1

  const handleSelectShot = (shotId: string, indexInFiltered: number, e: React.MouseEvent) => {
    setSelectedShotId(shotId)
    const isRange = e.shiftKey && lastSelectedIndexRef.current >= 0
    const isToggle = e.ctrlKey || e.metaKey

    if (isRange) {
      const start = Math.min(lastSelectedIndexRef.current, indexInFiltered)
      const end = Math.max(lastSelectedIndexRef.current, indexInFiltered)
      const rangeIds = filteredShots.slice(start, end + 1).map((s) => s.id)
      setSelectedShotIds(Array.from(new Set([...selectedShotIds, ...rangeIds])))
      return
    }

    if (isToggle) {
      setSelectedShotIds((prev) => (prev.includes(shotId) ? prev.filter((id) => id !== shotId) : [...prev, shotId]))
      lastSelectedIndexRef.current = indexInFiltered
      return
    }

    setSelectedShotIds([shotId])
    lastSelectedIndexRef.current = indexInFiltered
  }

  const matchesFilter = (s: StudioShot, f: ShotFilter) => {
    const flags = getShotReadinessFlags(s)
    switch (f) {
      case 'pendingConfirm':
        return flags.isPendingConfirm
      case 'generating':
        return flags.isGenerating
      case 'ready':
        return flags.isReady
      case 'hidden':
        return Boolean(s.hidden)
      case 'problem':
        return !s.hidden && flags.hasProblem
      default:
        return true
    }
  }

  const reorderWithinFilter = (sourceId: string, destId: string) => {
    if (sourceId === destId) return
    setShots((prev) => {
      const ordered = prev.slice().sort((a, b) => a.index - b.index)
      const subset = ordered.filter((s) => matchesFilter(s, filter))
      const sourceIndex = subset.findIndex((s) => s.id === sourceId)
      const destIndex = subset.findIndex((s) => s.id === destId)
      if (sourceIndex === -1 || destIndex === -1) return prev
      const movedSubset = reorder(subset, sourceIndex, destIndex)
      const movedQueue = [...movedSubset]
      const replaced = ordered.map((s) => (matchesFilter(s, filter) ? (movedQueue.shift() as StudioShot) : s))
      const next = replaced.map((s, idx) => ({ ...s, index: idx + 1 }))

      // 后台同步排序（不阻塞 UI）
      const beforeMap = new Map(prev.map((s) => [s.id, s.index]))
      void (async () => {
        try {
          const changed = next.filter((s) => beforeMap.get(s.id) !== s.index)
          await Promise.all(
            changed.map((s) =>
              StudioShotsService.updateShotApiV1StudioShotsShotIdPatch({
                shotId: s.id,
                requestBody: { index: s.index },
              }),
            ),
          )
        } catch {
          message.error('同步排序失败')
        }
      })()

      return next
    })
  }

  const beginResize = (type: 'left' | 'right', e: React.PointerEvent) => {
    if (!containerRef.current) return
    const startX = e.clientX
    dragStateRef.current = {
      type,
      startX,
      startLeft: prefs.leftWidth,
      startRight: prefs.rightWidth,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setIsResizing(true)
  }

  const onResizeMove = (e: React.PointerEvent) => {
    const st = dragStateRef.current
    if (!st) return
    const dx = e.clientX - st.startX
    const minLeft = 240
    const maxLeft = 360
    const minRight = 360
    const maxRight = 720
    if (st.type === 'left') {
      pendingResizeRef.current = { leftWidth: clamp(st.startLeft + dx, minLeft, maxLeft) }
    } else {
      // right：推挤/覆盖都复用 width 偏好
      pendingResizeRef.current = { rightWidth: clamp(st.startRight - dx, minRight, maxRight) }
    }

    if (resizeRafRef.current) return
    resizeRafRef.current = window.requestAnimationFrame(() => {
      const pending = pendingResizeRef.current
      pendingResizeRef.current = null
      resizeRafRef.current = null
      if (!pending) return
      setPrefs((p) => ({
        ...p,
        ...(typeof pending.leftWidth === 'number' ? { leftWidth: pending.leftWidth } : null),
        ...(typeof pending.rightWidth === 'number' ? { rightWidth: pending.rightWidth } : null),
      }))
    })
  }

  const endResize = () => {
    dragStateRef.current = null
    pendingResizeRef.current = null
    if (resizeRafRef.current) {
      window.cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
    }
    setIsResizing(false)
  }

  const shotContextMenu = (shot: StudioShot) => ([
    {
      key: 'copy',
      icon: <LinkOutlined />,
      label: '复制分镜',
      onClick: () => message.success('已复制（Mock）'),
    },
    {
      key: 'insert_after',
      icon: <VideoCameraAddOutlined />,
      label: '在后插入新分镜',
      onClick: () => message.success('已插入（Mock）'),
    },
    {
      key: 'transition',
      icon: <ScissorOutlined />,
      label: '设为转场点',
      onClick: () => message.success('已设置（Mock）'),
    },
    { type: 'divider' as const },
    {
      key: 'toggle_hide',
      icon: shot.hidden ? <EyeOutlined /> : <EyeInvisibleOutlined />,
      label: shot.hidden ? '取消隐藏' : '隐藏',
      onClick: () => toggleHiddenShots([shot.id]),
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      danger: true,
      label: '删除',
      onClick: () =>
        Modal.confirm({
          title: '删除分镜？',
          content: '此操作不可撤销。',
          okText: '删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: async () => {
            try {
              await StudioShotsService.deleteShotApiV1StudioShotsShotIdDelete({ shotId: shot.id })
              await loadShots()
              message.success('已删除')
            } catch {
              message.error('删除失败')
            }
          },
        }),
    },
  ])

  const batchMenuItems = [
    {
      key: 'merge',
      icon: <MergeCellsOutlined />,
      label: '合并',
      disabled: selectedShotIds.length < 2,
      onClick: () => {
        if (selectedShotIds.length < 2) return
        Modal.confirm({
          title: `合并 ${selectedShotIds.length} 个分镜？`,
          okText: '合并',
          cancelText: '取消',
          onOk: () => message.success('已合并（Mock）'),
        })
      },
    },
    {
      key: 'hide',
      icon: <EyeInvisibleOutlined />,
      label: '隐藏',
      onClick: () => toggleHiddenShots(selectedShotIds),
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      danger: true,
      label: '删除',
      onClick: () =>
        Modal.confirm({
          title: `删除 ${selectedShotIds.length} 个分镜？`,
          okText: '删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: async () => {
            try {
              await Promise.all(selectedShotIds.map((id) => StudioShotsService.deleteShotApiV1StudioShotsShotIdDelete({ shotId: id })))
              await loadShots()
              message.success('已删除')
            } catch {
              message.error('删除失败')
            }
          },
        }),
    },
    { type: 'divider' as const },
    {
      key: 'skip-extraction',
      icon: <StopOutlined />,
      danger: true,
      label: '维护：标记无需提取',
      onClick: () =>
        Modal.confirm({
          title: `确认以维护方式将 ${selectedShotIds.length} 个分镜标记为无需提取？`,
          content: '这属于准备阶段的维护性调整。标记后这些分镜会直接按“提取确认已完成”处理。',
          okText: '确认',
          okButtonProps: { danger: true, loading: batchSkipExtractionUpdating },
          cancelText: '取消',
          cancelButtonProps: { disabled: batchSkipExtractionUpdating },
          onOk: () => batchUpdateSkipExtraction(true),
        }),
    },
    {
      key: 'restore-extraction',
      icon: <UndoOutlined />,
      label: '维护：恢复提取',
      disabled: batchSkipExtractionUpdating,
      onClick: () => batchUpdateSkipExtraction(false),
    },
    { type: 'divider' as const },
    {
      key: 'generate-frames',
      icon: <ThunderboltOutlined />,
      label: '批量生成关键帧',
      onClick: () => {
        if (selectedShotIds.length === 0) return
        const generationDialog=Modal.confirm({
          footer:(_,{OkBtn,CancelBtn})=><Space wrap><CancelBtn/><GenerationChannelActions apiAction={<OkBtn/>} webAction={<WebHandoffButton prepare={()=>prepareWebBatch([...selectedShotIds],false)} onAccepted={()=>generationDialog.destroy()}/>}/></Space>,
          title: `批量生成 ${selectedShotIds.length} 个分镜的关键帧？`,
          content: 'API 使用默认图片模型；平台网页在下一步选择平台、模型和账号。各镜头独立记录，均可能消耗权益。',
          okText: '开始',
          cancelText: '取消',
          onOk: async () => {
            setGenerating(true)
            try {
              await runBatchGenerateFrames(selectedShotIds)
              message.success('已创建批量关键帧任务')
            } catch {
              message.error('批量生成关键帧失败')
            } finally {
              setGenerating(false)
            }
          },
        })
      },
    },
    {
      key: 'generate-videos',
      icon: <VideoCameraOutlined />,
      label: '批量生成视频',
      onClick: () => {
        if (selectedShotIds.length === 0) return
        const generationDialog=Modal.confirm({
          footer:(_,{OkBtn,CancelBtn})=><Space wrap><CancelBtn/><GenerationChannelActions apiAction={<OkBtn/>} webAction={<WebHandoffButton prepare={()=>prepareWebBatch([...selectedShotIds],true)} onAccepted={()=>generationDialog.destroy()}/>}/></Space>,
          title: `批量生成 ${selectedShotIds.length} 个镜头视频？`,
          content: 'API 使用默认视频模型并检查准备度；平台网页独立核对模型及输入规格。每个镜头保留独立结果，均可能产生费用。',
          okText: '确认并开始',
          cancelText: '取消',
          onOk: async () => {
            setGenerating(true)
            try {
              const readinessResults = await fetchBatchVideoReadiness()
              const readyShots = readinessResults.filter((item) => item.readiness?.ready)
              const blockedShots = readinessResults.filter((item) => !item.readiness?.ready)
              if (blockedShots.length > 0) {
                setBatchVideoReadinessItems(readinessResults)
                setBatchVideoReadinessOpen(true)
              }
              if (readyShots.length === 0) {
                message.warning('当前选中的镜头都未通过视频准备度检查，已展开检查结果')
                return
              }
              const result = await runBatchGenerateVideos(readyShots.map((item) => item.shot.id))
              if (result.submitted === 0) {
                message.warning('没有可提交的视频任务，请检查镜头时长、比例和提示词')
                return
              }
              const suffix = result.skipped > 0 ? `，另有 ${result.skipped} 条缺少必要信息被跳过` : ''
              message.success(`已创建 ${result.submitted} 个视频生成任务${suffix}`)
            } catch {
              message.error('批量生成视频失败')
            } finally {
              setGenerating(false)
            }
          },
        })
      },
    },
  ]

  const batchMaintenanceMenuItems = batchMenuItems.filter(
    (item) => item.key !== 'generate-frames' && item.key !== 'generate-videos',
  )

  const toolbarSettingsItems = [
    {
      key: 'mode',
      icon: <AppstoreOutlined />,
      label: (
        <div className="flex items-center justify-between gap-3">
          <span>属性面板模式</span>
          <Select
            size="small"
            value={prefs.inspectorMode}
            style={{ width: 120 }}
            onChange={(v) => setPrefs((p) => ({ ...p, inspectorMode: v }))}
            options={[
              { value: 'push', label: '推挤模式' },
              { value: 'overlay', label: '覆盖模式' },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'autoOpen',
      icon: <SettingOutlined />,
      label: (
        <div className="flex items-center justify-between gap-3">
          <span>选中分镜自动展开</span>
          <Switch
            size="small"
            checked={prefs.autoOpenInspector}
            onChange={(v) => setPrefs((p) => ({ ...p, autoOpenInspector: v }))}
          />
        </div>
      ),
    },
  ]

  const subtitleLines = useMemo(() => {
    if (!selectedShot || dialogLines.length === 0) return []
    const dur = Math.max(1, shotDetail?.duration ?? shotDurations[selectedShot.id] ?? 1)
    const per = dur / dialogLines.length
    return dialogLines.map((d, i) => ({
      key: `${selectedShot.id}-${d.id}`,
      role: d.speaker_character_id ?? '—',
      text: d.text,
      start: i * per,
      end: (i + 1) * per,
    }))
  }, [dialogLines, selectedShot, shotDetail?.duration, shotDurations])

  const activeSubtitleIndex = useMemo(() => {
    if (!selectedShot || subtitleLines.length === 0) return -1
    const t = videoTime
    return subtitleLines.findIndex((l) => t >= l.start && t < l.end)
  }, [selectedShot, subtitleLines, videoTime])

  return (
    <div className={['cs-studio w-full h-full min-h-0 flex flex-col', isResizing ? 'cs-resizing' : ''].join(' ')} ref={containerRef}>
      {/* 顶部工具栏（常驻） */}
      <div
        className="cs-topbar flex items-center gap-4 px-4 py-3"
        style={{
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {projectId && (
            <Link
              to={`/projects/${projectId}?tab=chapters`}
              className="text-sm text-gray-600 hover:text-blue-600 flex items-center gap-1 shrink-0"
            >
              <ArrowLeftOutlined /> 返回
            </Link>
          )}
          <Divider type="vertical" />
          <div className="min-w-0">
            <div className="font-medium text-gray-900 truncate">{chapterTitle}</div>
            <div className="text-xs text-gray-500">
              {saving ? (
                <span className="inline-flex items-center gap-1">
                  <ClockCircleOutlined /> 自动保存中…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <CheckCircleOutlined /> 已保存
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0" />

        <div className="flex items-center gap-2 shrink-0">
          <Dropdown menu={{ items: toolbarSettingsItems }} trigger={['click']}>
            <Tooltip title="工作台设置">
              <Button size="small" icon={<SettingOutlined />} />
            </Tooltip>
          </Dropdown>
          <Tooltip title={prefs.inspectorOpen ? '收起属性面板（P / Ctrl/Cmd+I）' : '展开属性面板（P / Ctrl/Cmd+I）'}>
            <Button
              size="small"
              icon={prefs.inspectorOpen ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
              onClick={() => setPrefs((p) => ({ ...p, inspectorOpen: !p.inspectorOpen }))}
            />
          </Tooltip>
        </div>
      </div>

      {/* 三栏动态布局 */}
      <Layout
        className="flex-1 min-h-0"
        style={{
          background: 'transparent',
          position: 'relative',
          overflow: 'hidden',
        }}
        onPointerMove={onResizeMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      >
        {/* 左侧：分镜列表 */}
        <Sider
          width={prefs.leftWidth}
          collapsedWidth={0}
          className="cs-left flex flex-col"
          style={{
            overflow: 'hidden',
          }}
        >
          <div className="cs-group m-3 mb-2 flex flex-col gap-2 min-w-0">
            <div className="cs-group-title mb-0 flex items-center gap-2 shrink-0">
              <FileTextOutlined /> 分镜列表
            </div>
            <div className="overflow-x-auto min-w-0 -mx-1 px-1">
              <Segmented
                size="small"
                value={filter}
                onChange={(v) => setFilter(v as ShotFilter)}
                options={[
                  { label: `全部 ${shotFilterCounts.all}`, value: 'all' },
                  { label: `待确认 ${shotFilterCounts.pendingConfirm}`, value: 'pendingConfirm' },
                  { label: `生成中 ${shotFilterCounts.generating}`, value: 'generating' },
                  { label: `已就绪 ${shotFilterCounts.ready}`, value: 'ready' },
                  { label: `隐藏 ${shotFilterCounts.hidden}`, value: 'hidden' },
                  { label: `有问题 ${shotFilterCounts.problem}`, value: 'problem' },
                ]}
              />
            </div>
          </div>

          {multiToolbarVisible && (
            <ChapterStudioBatchToolbar
              selectedCount={selectedShotIds.length}
              batchVideoReadinessLoading={batchVideoReadinessLoading}
              generating={generating}
              maintenanceMenuItems={batchMaintenanceMenuItems}
              onBatchInspectVideoReadiness={() => void batchInspectVideoReadiness()}
              onBatchGenerateFrames={() => batchMenuItems.find((item) => item.key === 'generate-frames')?.onClick?.()}
              onBatchGenerateVideos={() => batchMenuItems.find((item) => item.key === 'generate-videos')?.onClick?.()}
            />
          )}

          {!multiToolbarVisible && selectedShotIds.length === 1 && (
            <div className="cs-group m-3 mt-0 mb-2">
              <div className="rounded-lg border border-solid border-gray-200 bg-white/80 px-3 py-2 text-xs text-gray-600">
                已选 1 项，继续按 <span className="font-medium text-gray-700">Command/Ctrl + 点击</span> 可加入多选
              </div>
            </div>
          )}

          <div className="cs-left-scroll px-3 pb-3">
            {loadingShots ? (
              <div className="text-gray-500 text-center py-4">加载中...</div>
            ) : (
              <div>
                {filteredShots.map((s, i) => {
                  const isActive = selectedShotId === s.id
                  const isSelected = selectedShotIds.includes(s.id)
                  const isDragging = draggingShotId === s.id
                  const isDragOver = dragOverShotId === s.id && draggingShotId && draggingShotId !== s.id
                  const readiness = getShotReadinessFlags(s)
                  const progressCount = getShotProgressCount(s)
                  const primaryHint = getShotPrimaryHint(s)
                  return (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingShotId(s.id)
                        setDragOverShotId(null)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', s.id)
                      }}
                      onDragEnter={() => {
                        if (!draggingShotId || draggingShotId === s.id) return
                        setDragOverShotId(s.id)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        const sourceId = e.dataTransfer.getData('text/plain') || draggingShotId
                        if (!sourceId) return
                        reorderWithinFilter(sourceId, s.id)
                        setDraggingShotId(null)
                        setDragOverShotId(null)
                      }}
                      onDragEnd={() => {
                        setDraggingShotId(null)
                        setDragOverShotId(null)
                      }}
                      style={{
                        opacity: isDragging ? 0.92 : 1,
                        outline: isDragOver ? '2px dashed var(--ant-color-primary)' : 'none',
                        borderRadius: 8,
                      }}
                    >
                      <Tooltip
                        title={
                          selectedShotIds.length === 0
                            ? 'Command/Ctrl + 点击可多选'
                            : selectedShotIds.length === 1 && !isSelected
                              ? '继续按 Command/Ctrl 点击可加入多选'
                              : undefined
                        }
                        placement="right"
                      >
                        <Dropdown menu={{ items: shotContextMenu(s) }} trigger={['contextMenu']}>
                          <Card
                            size="small"
                            className={[
                              'cs-shot-item mb-2 cursor-pointer transition-colors',
                              isSelected ? 'cs-shot-selected' : '',
                              isActive ? 'cs-shot-active' : '',
                            ].filter(Boolean).join(' ')}
                            style={{
                              opacity: s.hidden ? 0.55 : 1,
                            }}
                            onClick={(e) => handleSelectShot(s.id, i, e)}
                            onDoubleClick={() => {
                              setEditingTitleId(s.id)
                              setEditingTitleValue(s.title)
                            }}
                          >
                            <div className="flex gap-2">
                            <div className="w-16 h-10 rounded bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-400 text-xs overflow-hidden">
                              <span>16:9</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`cs-dot ${statusDotClass(s.status)}`} />
                                <span className="text-xs text-gray-500 shrink-0">
                                  {String(s.index).padStart(2, '0')}
                                </span>
                                {editingTitleId === s.id ? (
                                  <Input
                                    size="small"
                                    value={editingTitleValue}
                                    autoFocus
                                    onChange={(ev) => setEditingTitleValue(ev.target.value)}
                                    onBlur={() => {
                                      const nextTitle = editingTitleValue.trim()
                                      setShots((prev) => prev.map((x) => (x.id === s.id ? { ...x, title: nextTitle || x.title } : x)))
                                      if (nextTitle && nextTitle !== s.title) {
                                        void StudioShotsService.updateShotApiV1StudioShotsShotIdPatch({
                                          shotId: s.id,
                                          requestBody: { title: nextTitle },
                                        }).catch(() => message.error('保存标题失败'))
                                      }
                                      setEditingTitleId(null)
                                    }}
                                    onKeyDown={(ev) => {
                                      if (ev.key === 'Enter') {
                                        (ev.currentTarget as HTMLInputElement).blur()
                                      }
                                      if (ev.key === 'Escape') {
                                        setEditingTitleId(null)
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="font-medium text-sm truncate" title="双击编辑标题">
                                    {s.title}
                                  </div>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-1 truncate">
                                {shotDetail?.movement ? `${CAMERA_MOVEMENT_OPTIONS.find((x) => x.value === shotDetail.movement)?.label ?? shotDetail.movement} · ` : ''}
                                {((shotDurations[s.id] ?? shotDetail?.duration ?? 0) || 0).toFixed(1)}s
                              </div>
                              <div className="cs-shot-progress mt-1">
                                <div className="cs-shot-progress__dots" aria-hidden="true">
                                  {[0, 1].map((idx) => (
                                    <span
                                      key={idx}
                                      className={[
                                        'cs-shot-progress__dot',
                                        idx < progressCount ? 'is-on' : '',
                                      ].join(' ')}
                                    />
                                  ))}
                                </div>
                                <span className="cs-shot-progress__text">{progressCount}/2</span>
                              </div>
                              <div className="cs-shot-hint mt-1">
                                {primaryHint}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1 items-center">
                                {readiness.isReady ? (
                                  <Tag className="m-0" color="success">已就绪</Tag>
                                ) : readiness.isGenerating ? (
                                  <Tag className="m-0" color="processing">生成中</Tag>
                                ) : (
                                  <Tag className="m-0" color="gold">待确认</Tag>
                                )}
                                {s.skip_extraction && (
                                  <Tag className="m-0" color="cyan">
                                    无需提取
                                  </Tag>
                                )}
                                {s.hasMusic && <Tag icon={<SoundOutlined />} className="m-0" color="default">音乐</Tag>}
                                {statusTag(s.status)}
                                {s.hidden && <Tag icon={<EyeInvisibleOutlined />} className="m-0">隐藏</Tag>}
                                {s.hasProblem && <Tag color="error" className="m-0">有问题</Tag>}
                              </div>
                            </div>
                            </div>
                          </Card>
                        </Dropdown>
                      </Tooltip>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Sider>

        {/* 左侧拖拽条 */}
        <div
          role="separator"
          className="cs-sep h-full"
          style={{
            width: 10,
            cursor: 'col-resize',
            background: 'transparent',
            flexShrink: 0,
          }}
          onPointerDown={(e) => beginResize('left', e)}
          title="拖拽调整左侧宽度"
        />

        {/* 中央：主预览区 */}
        <Content className="cs-main min-w-0 min-h-0 flex flex-col" style={{ padding: 16, position: 'relative', overflow: 'hidden' }}>
          <Card
            title={
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-medium">主预览区</span>
                {selectedShot && <VideoEditPanel key={selectedShot.id} shotId={selectedShot.id} currentFileId={selectedShot.generated_video_file_id || null} onAdopted={loadShots} />}
                {selectedShot && (
                  <span className="text-xs text-gray-500 truncate">
                    当前分镜：{String(selectedShot.index).padStart(2, '0')} · {selectedShot.title}
                  </span>
                )}
              </div>
            }
            extra={
              <Space size="small">
                {showPreviewMinimizeButton && (
                  <Tooltip title="最小化预览（占位）">
                    <Button size="small" icon={<DoubleRightOutlined />} onClick={() => message.info('最小化预览（Mock）')} />
                  </Tooltip>
                )}
                <Tooltip title="截取当前帧（Mock）">
                  <Button size="small" icon={<ScissorOutlined />} onClick={() => message.success('已截取当前帧（Mock）')} />
                </Tooltip>
                <Tooltip title={currentPreviewVideoFileId ? '下载当前预览视频' : '暂无可下载视频'}>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    disabled={!currentPreviewVideoFileId || !currentPreviewVideoUrl}
                    onClick={() => {
                      if (!currentPreviewVideoUrl) return
                      window.open(currentPreviewVideoUrl, '_blank', 'noopener,noreferrer')
                    }}
                  />
                </Tooltip>
              </Space>
            }
            className="cs-preview-card flex-1 min-h-0"
            bodyStyle={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div className="flex items-center justify-between gap-2">
              {showPreviewFrameSegmented ? (
                <Segmented
                  size="small"
                  value={frameTab}
                  onChange={(v) => setFrameTab(v as typeof frameTab)}
                  options={[
                    { label: '首帧', value: 'head' },
                    { label: '关键帧列表', value: 'keyframes' },
                    { label: '尾帧', value: 'tail' },
                    { label: '参考对比', value: 'compare' },
                  ]}
                />
              ) : (
                <div />
              )}
              <Space size="small">
                <Select
                  size="small"
                  value={playbackRate}
                  style={{ width: 86 }}
                  onChange={(v) => setPlaybackRate(v)}
                  options={[0.5, 1, 1.25, 1.5, 2].map((v) => ({ label: `${v}x`, value: v }))}
                />
                <Tooltip title="循环当前分镜">
                  <Switch size="small" checked={loopCurrent} onChange={setLoopCurrent} />
                </Tooltip>
                <Space size={4} className="max-w-[320px]">
                  <Radio.Group
                    size="small"
                    buttonStyle="solid"
                    disabled={!currentFrameFileId || frameFileTagsLoading}
                    value={currentFrameFileTags.includes(FRAME_FILE_TAG_ADOPT) ? FRAME_FILE_TAG_ADOPT : currentFrameFileTags.includes(FRAME_FILE_TAG_ABANDON) ? FRAME_FILE_TAG_ABANDON : ''}
                    onChange={(e) => {
                      const v = String(e?.target?.value ?? '')
                      const base = currentFrameFileTags.filter((t) => t !== FRAME_FILE_TAG_ADOPT && t !== FRAME_FILE_TAG_ABANDON)
                      if (!v) void updateCurrentFrameFileTags(base)
                      else void updateCurrentFrameFileTags([v, ...base])
                    }}
                  >
                    <Radio.Button value={FRAME_FILE_TAG_ADOPT}>采用</Radio.Button>
                    <Radio.Button value={FRAME_FILE_TAG_ABANDON}>废弃</Radio.Button>
                  </Radio.Group>
                  <Select
                    mode="tags"
                    size="small"
                    style={{ minWidth: 160, maxWidth: 220 }}
                    placeholder="自定义标签"
                    disabled={!currentFrameFileId || frameFileTagsLoading}
                    loading={frameFileTagsLoading}
                    value={currentFrameFileTags.filter((t) => t !== FRAME_FILE_TAG_ADOPT && t !== FRAME_FILE_TAG_ABANDON)}
                    onChange={(vals) => {
                      const base = Array.isArray(vals) ? (vals as any[]).map((v) => String(v)) : []
                      const keep =
                        currentFrameFileTags.find((t) => t === FRAME_FILE_TAG_ADOPT || t === FRAME_FILE_TAG_ABANDON) ?? null
                      void updateCurrentFrameFileTags(keep ? [keep, ...base] : base)
                    }}
                  />
                </Space>
                <Tooltip title="当前镜头数据">
                  <Tag className="m-0">
                    帧图 {frameImages.length} · 关联 {sceneLinks.length + actorImageLinks.length + propLinks.length + costumeLinks.length}
                  </Tag>
                </Tooltip>
              </Space>
            </div>

            <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-8 pr-1">
              <div className="relative">
                <div className="cs-player-shell">
                  <div className="aspect-video bg-black rounded overflow-hidden flex items-center justify-center">
                  {/* Mock：没有真实视频源时仍可展示播放器结构 */}
                  <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    controls={false}
                    muted
                    playsInline
                    preload="metadata"
                    src={currentPreviewVideoUrl || undefined}
                  />
                  {!selectedShot && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                      请选择分镜
                    </div>
                  )}
                  {selectedShot && !currentPreviewVideoUrl && selectedShot.status !== 'ready' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Badge
                        status={shotRuntimeMap[selectedShot.id]?.has_active_tasks ? 'processing' : 'default'}
                        text={shotRuntimeMap[selectedShot.id]?.has_active_tasks ? '生成中…' : '未生成'}
                      />
                    </div>
                  )}
                  </div>
                </div>

                {/* 播放控制条 */}
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="small"
                    icon={<CaretLeftOutlined />}
                    onClick={() => message.info('帧退（Mock）')}
                  />
                  <Button
                    size="small"
                    type="primary"
                    icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    onClick={() => {
                      const v = videoRef.current
                      if (!v) return
                      if (v.paused) void v.play()
                      else v.pause()
                    }}
                  >
                    {isPlaying ? '暂停' : '播放'}
                  </Button>
                  <Button
                    size="small"
                    icon={<CaretRightOutlined />}
                    onClick={() => message.info('帧进（Mock）')}
                  />
                  <div className="flex-1 min-w-0">
                    <Slider
                      tooltip={{ formatter: null }}
                      min={0}
                      max={Math.max(1, videoDuration || shotDetail?.duration || (selectedShotId ? shotDurations[selectedShotId] : 0) || 1)}
                      value={videoTime}
                      onChange={(v) => {
                        const vv = videoRef.current
                        if (!vv) return
                        vv.currentTime = Number(v)
                        setVideoTime(Number(v))
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 w-[110px] text-right">
                    {videoTime.toFixed(1)} / {Math.max(videoDuration || 0, shotDetail?.duration || (selectedShotId ? shotDurations[selectedShotId] : 0) || 0).toFixed(1)}s
                  </div>
                </div>

                {/* 对白字幕条 */}
                <div className="cs-subtitle mt-2 px-3 py-2">
                  {subtitleLines.length === 0 ? (
                    <div className="text-sm opacity-80">暂无对白字幕</div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {subtitleLines.map((l, idx) => {
                        const active = idx === activeSubtitleIndex
                        return (
                          <div
                            key={l.key}
                            className="cs-sub-line text-sm cursor-pointer"
                            style={{ opacity: active ? 1 : 0.6, fontWeight: active ? 600 : 400 }}
                            onClick={() => {
                              const v = videoRef.current
                              if (!v) return
                              v.currentTime = l.start
                              setVideoTime(l.start)
                            }}
                          >
                            <span style={{ opacity: 0.9 }}>{l.role}：</span>
                            <span>{l.text}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 章节级时间轴（可折叠，固定在底部不参与滚动） */}
            {showChapterTimeline && (
              <div
                className="rounded border border-solid border-gray-200 flex-shrink-0 min-h-0 flex flex-col"
                style={{ background: 'var(--ant-color-bg-container)' }}
              >
                <div className="px-3 py-2 flex items-center justify-between flex-shrink-0">
                  <div className="text-sm font-medium">章节时间轴</div>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => setPrefs((p) => ({ ...p, timelineCollapsed: !p.timelineCollapsed }))}
                  >
                    {prefs.timelineCollapsed ? '展开' : '折叠'}
                  </Button>
                </div>
                {!prefs.timelineCollapsed && (
                  <div className="px-3 pb-3 flex-shrink-0 overflow-hidden">
                    <div className="flex items-center gap-2 overflow-x-auto py-1 min-h-[32px]">
                      {shots
                        .slice()
                        .sort((a, b) => a.index - b.index)
                        .filter((s) => !s.hidden)
                        .map((s) => {
                          const active = s.id === selectedShotId
                          return (
                            <div
                              key={s.id}
                              className="shrink-0 cursor-pointer rounded"
                              style={{
                                width: clamp(18 + ((shotDurations[s.id] ?? 1) || 1) * 6, 24, 96),
                                height: 14,
                                background:
                                  shotRuntimeMap[s.id]?.has_active_tasks
                                    ? 'rgba(59,130,246,0.45)'
                                    : s.status === 'ready'
                                    ? 'rgba(34,197,94,0.45)'
                                    : 'rgba(156,163,175,0.45)',
                                outline: active ? '2px solid var(--ant-color-primary)' : '1px solid rgba(0,0,0,0.06)',
                              }}
                              title={`${String(s.index).padStart(2, '0')} · ${s.title}`}
                              onClick={() => setSelectedShotId(s.id)}
                            />
                          )
                        })}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      点击条块跳转分镜；隐藏分镜不参与预览
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </Content>

        {/* 右侧：属性面板（推挤 / 覆盖） */}
        {prefs.inspectorMode === 'push' ? (
          <>
            {/* 右侧拖拽条（推挤模式） */}
            {prefs.inspectorOpen && (
              <div
                role="separator"
                className="cs-sep cs-sep-strong h-full"
                style={{
                  width: 10,
                  cursor: 'col-resize',
                  background: 'transparent',
                  flexShrink: 0,
                }}
                onPointerDown={(e) => beginResize('right', e)}
                title="拖拽调整属性面板宽度"
              />
            )}
            <Sider
              width={prefs.inspectorOpen ? prefs.rightWidth : 0}
              collapsedWidth={0}
              collapsed={!prefs.inspectorOpen}
              className="cs-right"
              style={{
                overflow: 'hidden',
              }}
            >
              <Inspector
                imageChoice={imageChoice} videoChoice={videoChoice} onImageChoice={setImageChoice} onVideoChoice={setVideoChoice} videoModelId={videoModelId} onVideoModelId={setVideoModelId}
                usingDefaultVideoModel={!videoModelOverride} detailSaving={saving} detailSaveError={detailSaveError}
                detailSyncRevision={detailSyncRevision} generationSyncing={generationSyncing} onSyncGenerationInputs={syncGenerationInputs}
                projectId={projectId}
                chapterId={chapterId}
                projectVisualStyle={projectVisualStyle}
                projectStyle={projectStyle}
                projectDefaultVideoRatio={projectDefaultVideoRatio}
                capabilityDefaultVideoRatio={capabilityDefaultVideoRatio}
                videoRatioOptions={videoRatioOptions}
                loadingDetail={loadingDetail}
                shotDetail={shotDetail}
                dialogLines={dialogLines}
                frameImages={frameImages}
                sceneLinks={sceneLinks}
                propLinks={propLinks}
                costumeLinks={costumeLinks}
                shotCharacterLinks={shotCharacterLinks}
                shotCandidateItems={shotCandidateItems}
                shotDialogueCandidateItems={shotDialogueCandidateItems}
                cameraUpdating={cameraUpdating}
                promptAssetsUpdating={promptAssetsUpdating}
                onDeleteDialogLine={deleteDialogLine}
                onUpdatePromptScene={updatePromptScene}
                onUpdatePromptActors={updatePromptActors}
                onUpdatePromptProps={updatePromptProps}
                onUpdatePromptCostumes={updatePromptCostumes}
                selectedShot={selectedShot}
                onUpdateShotTitle={updateShotTitleInOps}
                onUpdateShotScriptExcerpt={updateShotScriptExcerptInOps}
                onDeleteShotOps={deleteShotFromOps}
                onSaveMoodTags={saveShotMoodTags}
                onPatchShotDetail={patchShotDetailLocal}
                onPatchShotDetailImmediate={patchShotDetailImmediate}
                onSelectPreviewVideo={setPreviewVideoFileId} onVideoAdopted={loadShots}
                onRefreshShotFrameImages={refreshShotFrameImages}
                onClose={() => setPrefs((p) => ({ ...p, inspectorOpen: false }))}
              />
            </Sider>

            {!prefs.inspectorOpen && (
              <div
                className="cs-right-strip"
                onClick={() => setPrefs((p) => ({ ...p, inspectorOpen: true }))}
                title="展开属性面板（P / Ctrl/Cmd+I）"
              >
                <span>属性</span>
              </div>
            )}
          </>
        ) : (
          <>
            {/* 覆盖模式：右侧抽屉覆盖中央 */}
            {prefs.inspectorOpen && (
              <div
                className="absolute top-0 right-0 h-full"
                style={{
                  width: prefs.rightWidth,
                  background: '#f9fafc',
                  borderLeft: '2px solid #cbd5e1',
                  zIndex: 20,
                  boxShadow: '-4px 0 12px rgba(0,0,0,0.06)',
                  display: 'flex',
                  flexDirection: 'row',
                }}
              >
                <div
                  role="separator"
                  className="cs-sep cs-sep-strong"
                  style={{ width: 10, flexShrink: 0 }}
                  onPointerDown={(e) => beginResize('right', e)}
                  title="拖拽调整覆盖宽度"
                />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <Inspector
                imageChoice={imageChoice} videoChoice={videoChoice} onImageChoice={setImageChoice} onVideoChoice={setVideoChoice} videoModelId={videoModelId} onVideoModelId={setVideoModelId}
                usingDefaultVideoModel={!videoModelOverride} detailSaving={saving} detailSaveError={detailSaveError}
                detailSyncRevision={detailSyncRevision} generationSyncing={generationSyncing} onSyncGenerationInputs={syncGenerationInputs}
                    projectId={projectId}
                    chapterId={chapterId}
                    projectVisualStyle={projectVisualStyle}
                    projectStyle={projectStyle}
                    projectDefaultVideoRatio={projectDefaultVideoRatio}
                    capabilityDefaultVideoRatio={capabilityDefaultVideoRatio}
                    videoRatioOptions={videoRatioOptions}
                    loadingDetail={loadingDetail}
                    shotDetail={shotDetail}
                    dialogLines={dialogLines}
                    frameImages={frameImages}
                    sceneLinks={sceneLinks}
                    propLinks={propLinks}
                    costumeLinks={costumeLinks}
                    shotCharacterLinks={shotCharacterLinks}
                    shotCandidateItems={shotCandidateItems}
                    shotDialogueCandidateItems={shotDialogueCandidateItems}
                    cameraUpdating={cameraUpdating}
                    promptAssetsUpdating={promptAssetsUpdating}
                    onDeleteDialogLine={deleteDialogLine}
                    onUpdatePromptScene={updatePromptScene}
                    onUpdatePromptActors={updatePromptActors}
                    onUpdatePromptProps={updatePromptProps}
                    onUpdatePromptCostumes={updatePromptCostumes}
                    selectedShot={selectedShot}
                    onUpdateShotTitle={updateShotTitleInOps}
                    onUpdateShotScriptExcerpt={updateShotScriptExcerptInOps}
                    onDeleteShotOps={deleteShotFromOps}
                    onSaveMoodTags={saveShotMoodTags}
                onPatchShotDetail={patchShotDetailLocal}
                    onPatchShotDetailImmediate={patchShotDetailImmediate}
                    onSelectPreviewVideo={setPreviewVideoFileId} onVideoAdopted={loadShots}
                    onRefreshShotFrameImages={refreshShotFrameImages}
                    onClose={() => setPrefs((p) => ({ ...p, inspectorOpen: false }))}
                  />
                </div>
              </div>
            )}

            {/* 覆盖模式下，右侧边缘常驻开关 */}
            <Tooltip title={prefs.inspectorOpen ? '收起属性面板' : '展开属性面板'}>
              <Button
                size="small"
                className="absolute top-1/2 -translate-y-1/2"
                style={{ right: 4, zIndex: 30 }}
                icon={prefs.inspectorOpen ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
                onClick={() => setPrefs((p) => ({ ...p, inspectorOpen: !p.inspectorOpen }))}
              />
            </Tooltip>
          </>
        )}

        <Modal
          title={`批量视频准备度（${selectedShots.length} 条）`}
          open={batchVideoReadinessOpen}
          onCancel={() => {
            if (batchVideoReadinessLoading) return
            setBatchVideoReadinessOpen(false)
          }}
          footer={[
            <Button key="close" onClick={() => setBatchVideoReadinessOpen(false)} disabled={batchVideoReadinessLoading}>
              关闭
            </Button>,
            <Button
              key="refresh"
              type="primary"
              icon={<VideoCameraOutlined />}
              loading={batchVideoReadinessLoading}
              onClick={() => void batchInspectVideoReadiness()}
            >
              重新检查
            </Button>,
          ]}
          width={880}
          destroyOnClose={false}
        >
          {batchVideoReadinessLoading ? (
            <div className="py-10 text-center">
              <Spin />
            </div>
          ) : batchVideoReadinessItems.length === 0 ? (
            <div className="text-sm text-gray-500">暂无批量视频准备度结果</div>
          ) : (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              <div className="text-xs text-gray-500">
                按当前默认视频型号检查：需要首帧的型号检查镜头首帧，其余检查纯文本模式；准备度不代表套餐权限已经通过。
              </div>
              {batchVideoReadinessItems.map(({ shot, readiness, error }) => {
                const failedChecks = (readiness?.checks ?? []).filter((item) => !item.ok)
                return (
                  <div key={shot.id} className="rounded-lg border border-solid border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {String(shot.index).padStart(2, '0')} · {shot.title}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {error
                            ? error
                            : readiness?.ready
                              ? '当前镜头已满足视频生成条件。'
                              : `当前镜头还有 ${failedChecks.length} 项待补齐。`}
                        </div>
                      </div>
                      <Tag color={error ? 'red' : readiness?.ready ? 'green' : 'gold'}>
                        {error ? '检查失败' : readiness?.ready ? '可生成' : '待补齐'}
                      </Tag>
                    </div>
                    {!error ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(readiness?.checks ?? []).map((check) => (
                          <Tooltip key={check.key} title={check.message}>
                            <Tag color={check.ok ? 'green' : 'default'}>
                              {check.ok ? '通过' : '未通过'} · {check.key}
                            </Tag>
                          </Tooltip>
                        ))}
                      </div>
                    ) : null}
                    {!error && failedChecks.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {failedChecks.map((check) => (
                          <div key={check.key} className="text-xs text-gray-600">
                            • {check.message}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </Modal>
      </Layout>
    </div>
  )
}

export default ChapterStudio

function Inspector(props: {
  imageChoice: GenerationChoice | null
  videoChoice: GenerationChoice | null
  onImageChoice: (value: GenerationChoice | null) => void
  videoModelId?: string
  usingDefaultVideoModel: boolean
  detailSaving: boolean
  detailSaveError: string
  detailSyncRevision: number
  generationSyncing: boolean
  onSyncGenerationInputs: () => Promise<void>
  onVideoModelId: (id: string | undefined) => void
  onVideoChoice: (value: GenerationChoice | null) => void
  projectId?: string
  chapterId?: string
  projectVisualStyle: '现实' | '动漫'
  projectStyle: string
  projectDefaultVideoRatio: string
  capabilityDefaultVideoRatio: string
  videoRatioOptions: Array<{ value: string; label: React.ReactNode }>
  loadingDetail: boolean
  shotDetail: ShotDetailRead | null
  dialogLines: ShotDialogLineRead[]
  frameImages: ShotFrameImageRead[]
  sceneLinks: ProjectSceneLinkRead[]
  propLinks: ProjectPropLinkRead[]
  costumeLinks: ProjectCostumeLinkRead[]
  shotCharacterLinks: ShotCharacterLinkRead[]
  shotCandidateItems: ShotExtractedCandidateRead[]
  shotDialogueCandidateItems: ShotExtractedDialogueCandidateRead[]
  cameraUpdating: boolean
  promptAssetsUpdating: boolean
  onDeleteDialogLine: (lineId: number) => Promise<void>
  onUpdatePromptScene: (sceneId?: string) => Promise<void>
  onUpdatePromptActors: (actorIds: string[]) => Promise<void>
  onUpdatePromptProps: (propIds: string[]) => Promise<void>
  onUpdatePromptCostumes: (costumeIds: string[]) => Promise<void>
  selectedShot: StudioShot | null
  onUpdateShotTitle: (shotId: string, title: string) => Promise<void>
  onUpdateShotScriptExcerpt: (shotId: string, script_excerpt: string) => Promise<void>
  onDeleteShotOps: (shotId: string) => Promise<void>
  onClose: () => void
  onSaveMoodTags: (shotId: string, tags: string[]) => Promise<void>
  onPatchShotDetail: (patch: Partial<ShotDetailRead>) => void
  onPatchShotDetailImmediate: (patch: Partial<ShotDetailRead>) => Promise<void>
  onVideoAdopted: () => Promise<void>
  onSelectPreviewVideo: (fileId: string) => void
  /** 下拉展开时拉取最新分镜帧图，用于「参考」关键帧类型选项动态更新 */
  onRefreshShotFrameImages?: () => Promise<void>
}) {
  const {
    projectId,
    chapterId,
    projectVisualStyle,
    projectStyle,
    projectDefaultVideoRatio,
    capabilityDefaultVideoRatio,
    videoRatioOptions,
    loadingDetail,
    shotDetail,
    dialogLines,
    frameImages,
    sceneLinks,
    propLinks,
    costumeLinks,
    shotCharacterLinks,
    shotCandidateItems,
    shotDialogueCandidateItems,
    cameraUpdating,
    promptAssetsUpdating,
    onDeleteDialogLine,
    onUpdatePromptScene,
    onUpdatePromptActors,
    onUpdatePromptProps,
    onUpdatePromptCostumes,
    selectedShot,
    onUpdateShotTitle,
    onUpdateShotScriptExcerpt,
    onDeleteShotOps,
    onClose,
    onPatchShotDetail,
    onSaveMoodTags,
    onPatchShotDetailImmediate,
    onSelectPreviewVideo,
    onRefreshShotFrameImages,
  } = props
  const { imageChoice, videoChoice, onImageChoice, onVideoChoice } = props
  const currentChapterId = chapterId ?? null
  const [imageVersion, setImageVersion] = useState('v1')
  const [refImageType, setRefImageType] = useState<string | undefined>(undefined)
  const { videoModelId, onVideoModelId: setVideoModelId } = props
  const [videoModels, setVideoModels] = useState<Array<{value:string;label:string}>>([])
  const [videoCapability, setVideoCapability] = useState<VideoGenerationOptionsRead | null>(null)
  const [subjectDraft, setSubjectDraft] = useState<{shotId:string;items:VideoSubjectMediaReference[]}>({shotId:'',items:[]})
  const videoSubjects = useMemo(() => subjectDraft.shotId === selectedShot?.id ? subjectDraft.items : [], [subjectDraft, selectedShot?.id])
  /** Browser-local reference drafts are scoped to the exact shot; submitted tasks retain their own snapshot. */
  useEffect(() => {
    const id = selectedShot?.id || ''
    try { setSubjectDraft({shotId:id,items:JSON.parse(localStorage.getItem(`jellyfish.video-subjects.${id}`) || '[]')}) }
    catch { setSubjectDraft({shotId:id,items:[]}) }
    setRefImageType(undefined)
  }, [selectedShot?.id])
  const changeVideoSubjects = (items:VideoSubjectMediaReference[]) => {
    const id = selectedShot?.id || ''; setSubjectDraft({shotId:id,items})
    try { localStorage.setItem(`jellyfish.video-subjects.${id}`,JSON.stringify(items)) }
    catch { message.warning('浏览器无法保存参考草稿，本次仍可使用；关闭页面后需重新选择') }
  }
  /** Read configured accounts only; changing this selector never changes the system default. */
  useEffect(() => {
    let active = true
    LlmService.getModelOverviewApiV1LlmModelOverviewGet({domesticOnly:false}).then(r => {
      if (active) setVideoModels((r.data?.models || []).filter(m => m.category === 'video' && (m.scenario_keys || []).some(k => k !== 'edit')).flatMap(m => (m.configurations || []).map(c => ({value:c.model_id,label:`${c.provider_name} · ${m.model_name}`}))))
    }).catch(() => { if(active) message.warning('视频模型清单读取失败，可继续使用默认模型') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true; setVideoCapability(null)
    LlmService.getVideoGenerationOptionsApiV1LlmVideoGenerationOptionsGet({modelId:videoModelId}).then(r => {
      if(active) setVideoCapability(r.data || null)
    }).catch(() => { if(active) message.warning('所选型号不支持普通视频生成或能力读取失败，请检查模型配置') })
    return () => { active = false }
  }, [videoModelId, videoChoice?.revision])

  const [refFrameTypeSelectLoading, setRefFrameTypeSelectLoading] = useState(false)
  const [hideShot, setHideShot] = useState(false)
  const [inspectorTabKey, setInspectorTabKey] = useState<InspectorTabKey>('camera')
  const [sceneNameMap, setSceneNameMap] = useState<Record<string, string>>({})
  const [characterNameMap, setCharacterNameMap] = useState<Record<string, string>>({})
  const [linkRoleOpen, setLinkRoleOpen] = useState(false)
  const [linkRoleLoading, setLinkRoleLoading] = useState(false)
  const [linkRoleSelectedIds, setLinkRoleSelectedIds] = useState<string[]>([])
  const [projectRoleOptions, setProjectRoleOptions] = useState<
    Array<{ value: string; label: React.ReactNode; searchLabel: string; disabled?: boolean }>
  >([])
  const [shotLinkedAssets, setShotLinkedAssets] = useState<
    Array<{ type: string; id: string; name?: string; thumbnail?: string; image_id?: number | null }>
  >([])
  const [shotAssetsOverview, setShotAssetsOverview] = useState<ShotAssetsOverviewRead | null>(null)
  const shotAssetsOverviewRequestSeqRef = useRef(0)
  const [shotRenderPromptLoading, setShotRenderPromptLoading] = useState(false)
  const [shotExtractStatus, setShotExtractStatus] = useState<{
    source: 'idle'
    updatedAt: number | null
    message: string
  }>({
    source: 'idle',
    updatedAt: null,
    message: '',
  })
  const [readinessExistenceMap, setReadinessExistenceMap] = useState<Record<string, EntityNameExistenceItem>>({})
  const [readinessExistenceLoading, setReadinessExistenceLoading] = useState(false)
  const [linkSceneOpen, setLinkSceneOpen] = useState(false)
  const [linkSceneLoading, setLinkSceneLoading] = useState(false)
  const [projectSceneOptions, setProjectSceneOptions] = useState<Array<{ value: string; label: React.ReactNode; searchLabel: string }>>([])

  const [linkPropOpen, setLinkPropOpen] = useState(false)
  const [linkPropLoading, setLinkPropLoading] = useState(false)
  const [linkPropSelectedIds, setLinkPropSelectedIds] = useState<string[]>([])
  const [projectPropOptions, setProjectPropOptions] = useState<Array<{ value: string; label: React.ReactNode; searchLabel: string; disabled?: boolean }>>([])

  const [linkCostumeOpen, setLinkCostumeOpen] = useState(false)
  const [linkCostumeLoading, setLinkCostumeLoading] = useState(false)
  const [linkCostumeSelectedIds, setLinkCostumeSelectedIds] = useState<string[]>([])
  const [projectCostumeOptions, setProjectCostumeOptions] = useState<Array<{ value: string; label: React.ReactNode; searchLabel: string; disabled?: boolean }>>([])
  const opsEdits = useRef<{ title?: string; note?: string }>({})
  const [opsTitleDraft, setOpsTitleDraft] = useState('')
  const [opsNoteDraft, setOpsNoteDraft] = useState('')
  const opsTitleSaveTimerRef = useRef<number | null>(null)
  const opsNoteSaveTimerRef = useRef<number | null>(null)
  const [keyframePromptPreviewOpen, setKeyframePromptPreviewOpen] = useState(false)
  const [keyframePromptPreviewLoading, setKeyframePromptPreviewLoading] = useState(false)
  const [keyframePromptActionLoading, setKeyframePromptActionLoading] = useState(false)
  const [keyframePromptPreviewFrameType, setKeyframePromptPreviewFrameType] = useState<PromptFrameType>('key')
  const [keyframePromptDebugContext, setKeyframePromptDebugContext] = useState<ShotFramePromptDebugContext | null>(null)
  const [keyframePromptDebugCollapsed, setKeyframePromptDebugCollapsed] = useState(true)
  const [keyframeDirectiveCollapsed, setKeyframeDirectiveCollapsed] = useState(true)
  const [keyframePromptDecisionCollapsed, setKeyframePromptDecisionCollapsed] = useState(true)
  const [keyframePromptQualityChecks, setKeyframePromptQualityChecks] = useState<ShotFramePromptQualityChecks>(null)
  const [generationChannel,setGenerationChannel]=useState<'api'|'web'>('api')
  const [videoPromptPreviewOpen, setVideoPromptPreviewOpen] = useState(false)
  const [videoPromptPreviewLoading, setVideoPromptPreviewLoading] = useState(false)
  const [videoPromptPreviewSubmitting, setVideoPromptPreviewSubmitting] = useState(false)
  const [videoPromptContextCollapsed, setVideoPromptContextCollapsed] = useState(true)
  const resolveVideoRatioForRequest = useCallback(() => {
    const shotRatio = String(shotDetail?.override_video_ratio ?? '').trim()
    const projectRatio = String(projectDefaultVideoRatio ?? '').trim()
    const fallbackRatio = String(capabilityDefaultVideoRatio ?? '').trim()
    return shotRatio || projectRatio || fallbackRatio
  }, [capabilityDefaultVideoRatio, projectDefaultVideoRatio, shotDetail?.override_video_ratio])
  const resolvedKeyframeRatio = resolveVideoRatioForRequest()
  const [videoPreviewTab, setVideoPreviewTab] = useState('prompt')
  const [videoPreviewContextKey, setVideoPreviewContextKey] = useState('')
  const [videoPreviewSourceKey, setVideoPreviewSourceKey] = useState('')
  const videoSourceKey = JSON.stringify([selectedShot?.id, selectedShot?.title, selectedShot?.script_excerpt, shotDetail, frameImages, dialogLines, sceneLinks, propLinks, costumeLinks, shotCharacterLinks, videoSubjects, refImageType, projectDefaultVideoRatio])
  const videoSubmissionVersion = useRef('')
  const videoSubmitLock = useRef(false)
  const videoRequestSent = useRef(false)
  const [videoRestoredDraftNotice, setVideoRestoredDraftNotice] = useState<string | null>(null)
  const [videoReviewLineage, setVideoReviewLineage] = useState<QualityReviewRecord | null>(null)
  const videoPromptDraft = useGenerationDraft<
    { prompt: string },
    { referenceMode: VideoReferenceMode; images: string[]; subjects?: VideoSubjectMediaReference[] },
    VideoPromptDerived,
    { taskId: string | null }
  >({
    initialBase: { prompt: '' },
    initialContext: { referenceMode: 'text_only', images: [] },
    derive: async ({ base, context }) => {
      if (!selectedShot?.id) {
        throw new Error('shot is required')
      }
      const ratio = resolveVideoRatioForRequest()
      if (!ratio) {
        throw new Error('video ratio is required')
      }
      const res = await StudioGenerationPromptsService.renderShotVideoPromptApiV1StudioGenerationPromptsShotsShotIdVideoRenderPost({
        shotId: selectedShot.id,
        requestBody: {
          reference_mode: context.referenceMode,
          subjects: context.subjects || [],
          model_revision_id: videoChoice?.revision,
          prompt: (base.prompt || '').trim() || null,
          image_file_ids: context.images,
        },
      })
      const data = (res as any)?.data ?? null
      const pack =
        data?.variables_snapshot && typeof data.variables_snapshot === 'object'
          ? (data.variables_snapshot as Record<string, unknown>).pack ?? null
          : null
      // Explicit shot frames keep their identity/order; asset recommendations are not first/last frames.
      const images = context.images
      return {
        prompt: typeof data?.execution_prompt === 'string' ? data.execution_prompt : '',
        images,
        pack: pack as ShotVideoPromptPackRead | null,
        qualityReport: data?.variables_snapshot?.quality_report,
        sourceFingerprint: data?.variables_snapshot?.quality_source_fingerprint,
      }
    },
    submit: async ({ derived, context }) => {
      if (!selectedShot?.id) {
        throw new Error('shot is required')
      }
      const ratio = resolveVideoRatioForRequest()
      if (!ratio) {
        throw new Error('video ratio is required')
      }
      const frameReferences = buildVideoFrameReferences(context.referenceMode, derived.images)
      const reviewedVersion = videoSubmissionVersion.current
      const reviewedRequest = await reviewGenerationRequest({
          model_id: videoModelId || null,
          execution_prompt: (derived.prompt || '').trim(),
          quality_source_fingerprint: derived.sourceFingerprint,
          quality_review_task_id: videoReviewLineage?.action === 'review' ? videoReviewLineage.task_id : videoReviewLineage?.source_task_id,
          quality_revision_task_id: videoReviewLineage?.action === 'revise' ? videoReviewLineage.task_id : undefined,
          media: {
            frames: {
              first: frameReferences.first_frame_file_id
                ? { file_id: frameReferences.first_frame_file_id, media_kind: 'image' }
                : null,
              last: frameReferences.last_frame_file_id
                ? { file_id: frameReferences.last_frame_file_id, media_kind: 'image' }
                : null,
              keys: frameReferences.key_frame_file_ids.map((file_id, ordinal) => ({
                file_id,
                media_kind: 'image' as const,
                ordinal,
              })),
            },
            subjects: context.subjects || [],
          },
          operation_input: {
            kind: 'video_generation',
            ratio,
            seconds: shotDetail?.duration ?? null,
          },
        }, undefined, videoChoice, true)
      await props.onSyncGenerationInputs()
      if (videoSubmissionVersion.current !== reviewedVersion) throw new Error('确认期间镜头设置或模型已变化，请更新发送预览后重新确认')
      videoRequestSent.current = true
      const created = await StudioGenerationTasksService.submitShotVideoGenerationTaskApiV1StudioGenerationTasksShotsShotIdVideoPost({
        shotId: selectedShot.id, requestBody: reviewedRequest,
      })
      return {
        taskId: created.data?.task_id ?? null,
      }
    },
  })
  const videoReviewContext: ReviewGenerationContext = {
    model_revision_id: videoChoice?.revision ?? null,
    reference_mode: videoPromptDraft.context.referenceMode,
    subjects: videoPromptDraft.context.subjects || [],
    image_file_ids: videoPromptDraft.context.images,
    ratio: resolveVideoRatioForRequest() || null,
    seconds: shotDetail?.duration ?? null,
    resolution: videoChoice?.value ?? null,
    generate_audio: videoChoice?.audio ?? null,
  }
  videoSubmissionVersion.current = JSON.stringify([videoSourceKey, videoModelId, reviewContextKey(videoReviewContext), videoPromptDraft.base.prompt])
  const videoPreviewFresh = !props.detailSaving && !props.detailSaveError && videoChoice?.spec?.model_id === videoModelId && videoPromptDraft.state === 'derived' && videoPreviewContextKey === reviewContextKey(videoReviewContext) && videoPreviewSourceKey === videoSourceKey
  // Keep the disabled state and its visible explanation on the same decision path.
  const videoApiDisabledReason = videoPromptPreviewLoading ? '正在整理生成内容，请稍候。'
    : props.detailSaving || props.generationSyncing ? '正在同步镜头设置，完成后才可继续。'
    : props.detailSaveError ? `镜头设置保存失败：${props.detailSaveError}。请返回工作室重试保存。`
    : !videoChoice || videoChoice.spec?.model_id !== videoModelId ? 'API 模型配置尚未就绪。请返回工作室检查模型配置，或选择平台网页。'
    : !videoPromptDraft.base.prompt.trim() ? '提示词为空，请先在“提示词与发送预览”填写内容。'
    : videoPromptDraft.state === 'deriving' ? '正在更新发送预览，请稍候。'
    : !videoPreviewFresh ? (videoPromptDraft.error ? `发送预览更新失败：${videoPromptDraft.error}。修正后请重试更新。` : '提示词、参考图或参数有变化，尚未更新发送预览。请先更新，再确认生成费用。')
    : ''
  const videoCanRefreshFromFooter = !!videoApiDisabledReason && !videoPromptPreviewLoading && !props.detailSaving && !props.generationSyncing && !props.detailSaveError && !!videoChoice && videoChoice.spec?.model_id === videoModelId && !!videoPromptDraft.base.prompt.trim() && videoPromptDraft.state !== 'deriving'
  const videoReviewedPrompt = videoPreviewFresh ? videoPromptDraft.derived?.prompt || '' : videoPromptDraft.base.prompt
  /** 免费更新完整发送稿；参数中途变化时仍要求重新确认，输入不会被后台回写。 */
  const refreshVideoSendPreview = async () => {
    const key = reviewContextKey(videoReviewContext)
    const result = await videoPromptDraft.deriveNow()
    if (result) { setVideoPreviewContextKey(key); setVideoPreviewSourceKey(videoSourceKey) }
  }
  const videoReviewVersion = useRef('')
  videoReviewVersion.current = JSON.stringify([selectedShot?.id, videoPromptDraft.base.prompt, reviewContextKey(videoReviewContext)])
  /** 应用前重新本地渲染/校验，保存具体版本标记成功后更新草稿；不调用生成模型。 */
  const applyVideoReview = async (record: QualityReviewRecord, proposed: string) => {
    const beforePrompt = record.application?.active ? record.application.prompt : record.prompt
    if (!selectedShot || beforePrompt !== videoReviewedPrompt || reviewContextKey(record.generation_context) !== reviewContextKey(videoReviewContext)) throw new Error('当前视频版本已变化，请重新调整')
    const version = videoReviewVersion.current
    const previousDerived = videoPromptDraft.derived
    const previousState = videoPromptDraft.state
    const derived = await videoPromptDraft.deriveNow({ base: { prompt: proposed } })
    if (!derived || videoReviewVersion.current !== version) throw new Error('草稿已变化，未应用优化')
    // deriveNow会更新派生值；保存应用记录前还原，失败时生成仍使用原稿。
    videoPromptDraft.setDerived(previousDerived)
    videoPromptDraft.setState(previousState)
    const saved = await StudioGenerationTasksService.applyQualityRevisionApiV1StudioGenerationTasksShotsShotIdQualityReviewsTaskIdApplyPost({
      shotId: selectedShot.id, taskId: record.task_id, requestBody: { prompt: derived.prompt, before_prompt: beforePrompt,
        image_file_ids: videoPromptDraft.context.images, generation_context: videoReviewContext },
    })
    if (videoReviewVersion.current !== version) throw new Error('优化方案已保存；页面已切换，请回到对应镜头查看')
    videoPromptDraft.hydrate({ base: { prompt: derived.prompt }, context: videoPromptDraft.context, derived })
    setVideoReviewLineage(saved.data || null)
    setVideoRestoredDraftNotice(null)
    setVideoPreviewContextKey(reviewContextKey(videoReviewContext))
    setVideoPreviewSourceKey(videoSourceKey)
    setVideoPreviewTab('prompt')
  }
  const videoPromptPreviewDraft = videoPromptDraft.base.prompt
  const videoPromptPreviewImages = videoPromptDraft.context.images
  // Readiness follows the visible selection immediately; preview context is only built when its dialog opens.
  const videoReferenceMode = (refImageType || (videoCapability?.requires_subject_reference ? 'subjects' : (videoCapability?.requires_first_frame || (!videoCapability?.supports_text_to_video && videoCapability?.supports_first_frame)) ? (videoCapability?.requires_last_frame ? 'first_last' : 'first') : 'text_only')) as VideoReferenceMode
  const videoPromptPreviewPack = videoPromptDraft.derived?.pack ?? null
  const videoActionBeatPhases = videoPromptPreviewPack?.action_beat_phases ?? []
  const videoActionBeats = videoActionBeatPhases.length > 0
    ? videoActionBeatPhases.map((item) => ({
        text: item.text,
        phase: item.phase,
      }))
    : (videoPromptPreviewPack?.action_beats ?? []).map((text) => ({
        text,
        phase: null,
      }))
  const videoVisibleActionBeats = videoPromptContextCollapsed
    ? videoActionBeats.slice(0, 2)
    : videoActionBeats
  const hiddenVideoActionBeatCount = Math.max(0, videoActionBeats.length - videoVisibleActionBeats.length)
  const [videoTaskPolling, setVideoTaskPolling] = useState(false)
  const [videoTaskStatus, setVideoTaskStatus] = useState<string | null>(null)
  const [videoTaskId, setVideoTaskId] = useState<string | null>(null)
  const [videoTask, setVideoTask] = useState<RelationTaskState | null>(null)
  const [videoSettledTask, setVideoSettledTask] = useState<RelationTaskState | null>(null)
  const [frameImageTask, setFrameImageTask] = useState<RelationTaskState | null>(null)
  const [frameImageSettledTask, setFrameImageSettledTask] = useState<RelationTaskState | null>(null)
  const [generatedVideos, setGeneratedVideos] = useState<Array<{ linkId: number; fileId: string; url: string }>>([])
  const [videoReadiness, setVideoReadiness] = useState<ShotVideoReadinessRead | null>(null)
  const [videoReadinessLoading, setVideoReadinessLoading] = useState(false)
  const [keyframeCards, setKeyframeCards] = useState<Record<PromptFrameType, KeyframeCardState>>({
    first: { loading: false, taskStatus: null, taskId: null, thumbs: [], modalOpen: false, applyingFileId: null },
    key: { loading: false, taskStatus: null, taskId: null, thumbs: [], modalOpen: false, applyingFileId: null },
    last: { loading: false, taskStatus: null, taskId: null, thumbs: [], modalOpen: false, applyingFileId: null },
  })
  // Ignore late frame requests after a shot switch or panel unmount.
  const frameRequestEpoch = useRef(0)
  useEffect(() => {
    frameRequestEpoch.current += 1
    setKeyframePromptActionLoading(false)
    setFrameImageTask(null)
    setFrameImageSettledTask(null)
    setKeyframeCards({
      first: { loading: false, taskStatus: null, taskId: null, thumbs: [], modalOpen: false, applyingFileId: null },
      key: { loading: false, taskStatus: null, taskId: null, thumbs: [], modalOpen: false, applyingFileId: null },
      last: { loading: false, taskStatus: null, taskId: null, thumbs: [], modalOpen: false, applyingFileId: null },
    })
    return () => { frameRequestEpoch.current += 1 }
  }, [selectedShot?.id])
  const selectedShotSourceLabel = useMemo(() => {
    if (!selectedShot) return '分镜工作室'
    const shotTitle = selectedShot.title?.trim()
    return shotTitle ? `镜头：${shotTitle}` : `镜头：第 ${selectedShot.index} 镜`
  }, [selectedShot])
  useRelationTaskNotification({
    task: videoTask,
    settledTask: videoSettledTask,
    title: TASK_COPY.videoGeneration.title,
    sourceLabel: selectedShotSourceLabel,
    runningDescription: TASK_COPY.videoGeneration.runningDescription,
    cancellingDescription: TASK_COPY.videoGeneration.cancellingDescription,
    successDescription: TASK_COPY.videoGeneration.successDescription,
    cancelledDescription: TASK_COPY.videoGeneration.cancelledDescription,
    failedDescription: TASK_COPY.videoGeneration.failedDescription,
    onCancel:
      videoTask?.taskId
        ? () =>
            void executeTaskCancel({
              taskId: videoTask.taskId,
              reason: '用户在分镜工作室取消视频生成任务',
              applyCancelData: (data) => {
                setVideoTask((current) => applyTaskCancelState(current, data))
                return null
              },
              cancelledImmediatelyMessage: TASK_COPY.videoGeneration.cancelledImmediatelyMessage,
              cancelRequestedMessage: TASK_COPY.videoGeneration.cancelRequestedMessage,
              fallbackErrorMessage: '取消视频生成任务失败',
            })
        : null,
    onNavigate: () => undefined,
  })
  useRelationTaskNotification({
    task: frameImageTask,
    settledTask: frameImageSettledTask,
    title: TASK_COPY.shotFrameImage.title,
    sourceLabel: selectedShotSourceLabel,
    runningDescription: TASK_COPY.shotFrameImage.runningDescription,
    cancellingDescription: TASK_COPY.shotFrameImage.cancellingDescription,
    successDescription: TASK_COPY.shotFrameImage.successDescription,
    cancelledDescription: TASK_COPY.shotFrameImage.cancelledDescription,
    failedDescription: TASK_COPY.shotFrameImage.failedDescription,
    onCancel:
      frameImageTask?.taskId
        ? () =>
            void executeTaskCancel({
              taskId: frameImageTask.taskId,
              reason: '用户在分镜工作室取消关键帧图片生成任务',
              applyCancelData: (data) => {
                setFrameImageTask((current) => applyTaskCancelState(current, data))
                return null
              },
              cancelledImmediatelyMessage: TASK_COPY.shotFrameImage.cancelledImmediatelyMessage,
              cancelRequestedMessage: TASK_COPY.shotFrameImage.cancelRequestedMessage,
              fallbackErrorMessage: '取消关键帧图片生成任务失败',
            })
        : null,
    onNavigate: () => undefined,
  })
  const showAvTab = false
  const showGenRefVersions = false

  const getInspectorTabForSelectedShot = useCallback(
    (shot: StudioShot | null): InspectorTabKey => {
      if (!shot) return 'camera'
      if (shot.hasProblem) return 'ops'
      if (!(shot.script_excerpt ?? '').trim() || shot.status !== 'ready') return 'prompt_image'
      if (shot.status === 'ready') return 'gen_ref'
      if (!shot.hasSpeech) return 'dialogue'
      return 'camera'
    },
    [],
  )

  useEffect(() => {
    setInspectorTabKey(getInspectorTabForSelectedShot(selectedShot))
  }, [getInspectorTabForSelectedShot, selectedShot?.id])

  useEffect(() => {
    setHideShot(Boolean(selectedShot?.hidden))
  }, [selectedShot?.hidden])

  useEffect(() => {
    if (!selectedShot?.id) {
      setVideoReadiness(null)
      return
    }
    if (props.detailSaving || props.generationSyncing || props.detailSaveError) {
      setVideoReadiness(null); setVideoReadinessLoading(!props.detailSaveError); return
    }
    let canceled = false
    setVideoReadiness(null)
    setVideoReadinessLoading(true)
    void (async () => {
      try {
        const res = await StudioShotsService.getShotVideoReadinessApiApiV1StudioShotsShotIdVideoReadinessGet({
          shotId: selectedShot.id,
          referenceMode: videoReferenceMode,
          modelId: videoModelId,
          subjectImageCount: videoReferenceMode === 'subjects' ? videoSubjects.reduce((n, s) => n + (s.media?.length ?? 0), 0) : 0,
        })
        if (canceled) return
        setVideoReadiness((res.data ?? null) as ShotVideoReadinessRead | null)
      } catch {
        if (canceled) return
        setVideoReadiness(null)
      } finally {
        if (!canceled) setVideoReadinessLoading(false)
      }
    })()
    return () => {
      canceled = true
    }
  }, [
    selectedShot?.id,
    selectedShot?.status,
    videoReferenceMode,
    videoModelId,
    videoSubjects,
    videoChoice?.revision,
    props.detailSaving, props.detailSyncRevision, props.generationSyncing, props.detailSaveError,
    projectDefaultVideoRatio, shotDetail, dialogLines, sceneLinks, propLinks, costumeLinks, shotCharacterLinks,
    shotDetail?.duration,
    shotDetail?.first_frame_prompt,
    shotDetail?.key_frame_prompt,
    shotDetail?.last_frame_prompt,
    frameImages.map((x) => `${x.id}:${x.file_id ?? ''}`).join('|'),
  ])

  useEffect(() => {
    if (!selectedShot?.id) {
      setGeneratedVideos([])
      return
    }
    let canceled = false
    void (async () => {
      try {
        const [currentLinks, legacyLinks] = await Promise.all([
          listTaskLinksNormalized({
            resourceType: 'video',
            relationType: 'shot_video',
            relationEntityId: selectedShot.id,
            order: 'updated_at',
            isDesc: true,
            page: 1,
            pageSize: 100,
          }),
          listTaskLinksNormalized({
            resourceType: 'video',
            relationType: 'video',
            relationEntityId: selectedShot.id,
            order: 'updated_at',
            isDesc: true,
            page: 1,
            pageSize: 100,
          }),
        ])
        const links = [...currentLinks, ...legacyLinks]
        if (canceled) return
        const seen = new Set<string>()
        const list = links
          .filter((l) => Boolean(l.file_id))
          .map((l) => ({
            linkId: l.id,
            fileId: String(l.file_id),
            url: buildFileDownloadUrl(String(l.file_id)) ?? '',
          }))
          .filter((v) => Boolean(v.url))
          .filter((v) => {
            if (seen.has(v.fileId)) return false
            seen.add(v.fileId)
            return true
          })
        const currentId = selectedShot.generated_video_file_id?.trim() || ''
        if (currentId && !list.some((x) => x.fileId === currentId)) {
          const currentUrl = buildFileDownloadUrl(currentId) ?? ''
          if (currentUrl) list.unshift({ linkId: -1, fileId: currentId, url: currentUrl })
        }
        setGeneratedVideos(list)
      } catch {
        if (!canceled) setGeneratedVideos([])
      }
    })()
    return () => {
      canceled = true
    }
  }, [selectedShot?.id, selectedShot?.generated_video_file_id, videoTaskStatus, videoTaskPolling])

  useEffect(() => {
    opsEdits.current = {}
    setOpsTitleDraft(selectedShot?.title ?? '')
    setOpsNoteDraft(selectedShot?.script_excerpt ?? '')
    if (opsTitleSaveTimerRef.current) window.clearTimeout(opsTitleSaveTimerRef.current)
    if (opsNoteSaveTimerRef.current) window.clearTimeout(opsNoteSaveTimerRef.current)
    opsTitleSaveTimerRef.current = null
    opsNoteSaveTimerRef.current = null
  }, [selectedShot?.id])

  /** 未编辑的维护字段跟随服务器刷新；旧回包不覆盖仍在输入的标题或备注。 */
  useEffect(() => {
    if (opsEdits.current.title === selectedShot?.title) delete opsEdits.current.title
    if (opsEdits.current.note === selectedShot?.script_excerpt) delete opsEdits.current.note
    if (opsEdits.current.title === undefined) setOpsTitleDraft(selectedShot?.title ?? '')
    if (opsEdits.current.note === undefined) setOpsNoteDraft(selectedShot?.script_excerpt ?? '')
  }, [selectedShot?.id, selectedShot?.title, selectedShot?.script_excerpt])

  useEffect(() => {
    if (!selectedShot?.id || opsEdits.current.title === undefined) return
    if (opsTitleDraft === (selectedShot.title ?? '')) return

    if (opsTitleSaveTimerRef.current) window.clearTimeout(opsTitleSaveTimerRef.current)
    opsTitleSaveTimerRef.current = window.setTimeout(() => {
      void onUpdateShotTitle(selectedShot.id, opsTitleDraft).catch(() => {})
      opsTitleSaveTimerRef.current = null
    }, 500)

    return () => {
      if (opsTitleSaveTimerRef.current) window.clearTimeout(opsTitleSaveTimerRef.current)
      opsTitleSaveTimerRef.current = null
    }
  }, [opsTitleDraft, selectedShot?.id, selectedShot?.title, onUpdateShotTitle])

  useEffect(() => {
    if (!selectedShot?.id || opsEdits.current.note === undefined) return
    if (opsNoteDraft === (selectedShot.script_excerpt ?? '')) return

    if (opsNoteSaveTimerRef.current) window.clearTimeout(opsNoteSaveTimerRef.current)
    opsNoteSaveTimerRef.current = window.setTimeout(() => {
      void onUpdateShotScriptExcerpt(selectedShot.id, opsNoteDraft).catch(() => {})
      opsNoteSaveTimerRef.current = null
    }, 500)

    return () => {
      if (opsNoteSaveTimerRef.current) window.clearTimeout(opsNoteSaveTimerRef.current)
      opsNoteSaveTimerRef.current = null
    }
  }, [opsNoteDraft, selectedShot?.id, selectedShot?.script_excerpt, onUpdateShotScriptExcerpt])

  const flushOpsTitle = async () => {
    if (!selectedShot?.id || opsEdits.current.title === undefined) return
    if (opsTitleSaveTimerRef.current) window.clearTimeout(opsTitleSaveTimerRef.current)
    opsTitleSaveTimerRef.current = null
    if (opsTitleDraft === (selectedShot.title ?? '')) return
    await onUpdateShotTitle(selectedShot.id, opsTitleDraft)
  }

  const flushOpsNote = async () => {
    if (!selectedShot?.id || opsEdits.current.note === undefined) return
    if (opsNoteSaveTimerRef.current) window.clearTimeout(opsNoteSaveTimerRef.current)
    opsNoteSaveTimerRef.current = null
    if (opsNoteDraft === (selectedShot.script_excerpt ?? '')) return
    await onUpdateShotScriptExcerpt(selectedShot.id, opsNoteDraft)
  }

  const sceneIds = useMemo(() => Array.from(new Set(sceneLinks.map((x) => x.scene_id).filter(Boolean))), [sceneLinks])
  const characterIds = useMemo(() => Array.from(new Set(shotCharacterLinks.map((x) => x.character_id).filter(Boolean))), [shotCharacterLinks])

  const linkedCharacterIds = useMemo(() => characterIds, [characterIds])
  const linkedSceneId = useMemo(() => {
    if (!selectedShot?.id) return null
    return sceneLinks.find((l) => (l.shot_id ?? null) === selectedShot.id)?.scene_id ?? shotDetail?.scene_id ?? null
  }, [sceneLinks, selectedShot?.id, shotDetail?.scene_id])
  const linkedPropIds = useMemo(() => {
    if (!selectedShot?.id) return []
    return Array.from(new Set(propLinks.filter((l) => (l.shot_id ?? null) === selectedShot.id).map((l) => l.prop_id).filter(Boolean))) as string[]
  }, [propLinks, selectedShot?.id])
  const linkedCostumeIds = useMemo(() => {
    if (!selectedShot?.id) return []
    return Array.from(new Set(costumeLinks.filter((l) => (l.shot_id ?? null) === selectedShot.id).map((l) => l.costume_id).filter(Boolean))) as string[]
  }, [costumeLinks, selectedShot?.id])

  useEffect(() => {
    if (!selectedShot?.id) {
      setShotLinkedAssets([])
      return
    }
    let canceled = false
    void (async () => {
      try {
        const res = await StudioShotsService.listShotLinkedAssetsApiV1StudioShotsShotIdLinkedAssetsGet({
          shotId: selectedShot.id,
          page: 1,
          pageSize: 100,
        })
        if (canceled) return
        const items = (res.data?.items ?? []) as any[]
        setShotLinkedAssets(
          items
            .filter((x) => x && typeof x.type === 'string' && typeof x.id === 'string')
            .map((x) => ({
              type: String(x.type),
              id: String(x.id),
              name: typeof x.name === 'string' ? x.name : undefined,
              image_id: typeof x.image_id === 'number' ? x.image_id : x.image_id === null ? null : undefined,
              thumbnail: typeof x.thumbnail === 'string' && x.thumbnail.trim() ? x.thumbnail.trim() : undefined,
            })),
        )
      } catch {
        if (!canceled) setShotLinkedAssets([])
      }
    })()
    return () => {
      canceled = true
    }
  }, [selectedShot?.id])

  const loadShotAssetsOverview = useCallback(
    async (shotId: string) => {
      const reqSeq = ++shotAssetsOverviewRequestSeqRef.current
      try {
        const res = await StudioShotsService.getShotAssetsOverviewApiApiV1StudioShotsShotIdAssetsOverviewGet({
          shotId,
        })
        if (reqSeq !== shotAssetsOverviewRequestSeqRef.current) return
        setShotAssetsOverview(res.data ?? null)
      } catch {
        if (reqSeq !== shotAssetsOverviewRequestSeqRef.current) return
        setShotAssetsOverview(null)
      }
    },
    [],
  )

  useEffect(() => {
    if (!selectedShot?.id) {
      shotAssetsOverviewRequestSeqRef.current += 1
      setShotAssetsOverview(null)
      return
    }
    void loadShotAssetsOverview(selectedShot.id)
  }, [loadShotAssetsOverview, selectedShot?.id, shotCandidateItems])

  useEffect(() => {
    if (!selectedShot?.id) {
      setShotExtractStatus({ source: 'idle', updatedAt: null, message: '' })
      return
    }
    setShotExtractStatus({
      source: 'idle',
      updatedAt: null,
      message: '待确认候选请前往分镜编辑页提取或刷新。',
    })
  }, [
    selectedShot?.id,
  ])

  const linkedAssetThumbByKey = useMemo(() => {
    const map = new Map<string, string>()
    shotLinkedAssets.forEach((it) => {
      if (!it.thumbnail) return
      map.set(`${it.type}:${it.id}`, it.thumbnail)
    })
    return map
  }, [shotLinkedAssets])

  const promptAssetReadiness = useMemo(() => {
    if (selectedShot?.skip_extraction) {
      return {
        checks: [] as Array<{
          key: 'characters' | 'scene' | 'props' | 'costumes'
          label: string
          importance: string
          entries: Array<{ id: number; name: string; status: ShotExtractedCandidateRead['candidate_status'] }>
          missing: string[]
          expectedCount: number
          actualCount: number
          ignoredCount: number
          resolvedCount: number
          ready: boolean
        }>,
        expectedChecks: [] as Array<{
          key: 'characters' | 'scene' | 'props' | 'costumes'
          label: string
          importance: string
          entries: Array<{ id: number; name: string; status: ShotExtractedCandidateRead['candidate_status'] }>
          missing: string[]
          expectedCount: number
          actualCount: number
          ignoredCount: number
          resolvedCount: number
          ready: boolean
        }>,
        readyCount: 1,
        totalCount: 1,
        percent: 100,
        hasMissing: false,
      }
    }
    const overviewItems = shotAssetsOverview?.items ?? []
    const bucket = (type: 'character' | 'scene' | 'prop' | 'costume') =>
      overviewItems.filter((item) => item.type === type)

    const checks = [
      {
        key: 'characters' as const,
        label: '角色',
        importance: '影响人物一致性、关键帧参考图和画面主体描述。',
        candidates: bucket('character'),
      },
      {
        key: 'scene' as const,
        label: '场景',
        importance: '影响镜头环境描述、视频提示词和整体空间连续性。',
        candidates: bucket('scene'),
      },
      {
        key: 'props' as const,
        label: '道具',
        importance: '影响关键动作细节，缺失时容易让画面叙事元素不完整。',
        candidates: bucket('prop'),
      },
      {
        key: 'costumes' as const,
        label: '服装',
        importance: '影响角色外观连续性，尤其在多镜头或生成多版本时更明显。',
        candidates: bucket('costume'),
      },
    ].map((item) => {
      const entries = item.candidates.map((candidate) => ({
        id: candidate.candidate_id ?? -1,
        name: candidate.name,
        status: candidate.candidate_status ?? (candidate.is_linked ? 'linked' : 'pending'),
      }))
      const pending = entries.filter((entry) => entry.status === 'pending')
      const linked = entries.filter((entry) => entry.status === 'linked')
      const ignored = entries.filter((entry) => entry.status === 'ignored')
      return {
        ...item,
        entries,
        missing: pending.map((entry) => entry.name),
        expectedCount: entries.length,
        actualCount: linked.length,
        ignoredCount: ignored.length,
        resolvedCount: linked.length + ignored.length,
        ready: entries.length === 0 || pending.length === 0,
      }
    })

    const expectedChecks = checks.filter((item) => item.expectedCount > 0)
    const readyCount = expectedChecks.filter((item) => item.ready).length
    return {
      checks,
      expectedChecks,
      readyCount,
      totalCount: expectedChecks.length,
      percent: expectedChecks.length === 0 ? 100 : Math.round((readyCount / expectedChecks.length) * 100),
      hasMissing: expectedChecks.some((item) => item.missing.length > 0),
    }
  }, [selectedShot?.skip_extraction, shotAssetsOverview?.items])

  useEffect(() => {
    if (!projectId || !selectedShot?.id) {
      setReadinessExistenceMap({})
      return
    }

    const overviewItems = shotAssetsOverview?.items ?? []
    const characterNames = uniqueNames(
      overviewItems.filter((item) => item.type === 'character' && item.candidate_status === 'pending').map((item) => item.name),
    )
    const sceneNames = uniqueNames(
      overviewItems.filter((item) => item.type === 'scene' && item.candidate_status === 'pending').map((item) => item.name),
    )
    const propNames = uniqueNames(
      overviewItems.filter((item) => item.type === 'prop' && item.candidate_status === 'pending').map((item) => item.name),
    )
    const costumeNames = uniqueNames(
      overviewItems.filter((item) => item.type === 'costume' && item.candidate_status === 'pending').map((item) => item.name),
    )

    if (characterNames.length === 0 && sceneNames.length === 0 && propNames.length === 0 && costumeNames.length === 0) {
      setReadinessExistenceMap({})
      return
    }

    let cancelled = false
    setReadinessExistenceLoading(true)
    void (async () => {
      try {
        const res = await StudioEntitiesService.checkEntityNamesExistenceApiV1StudioEntitiesExistenceCheckPost({
          requestBody: {
            project_id: projectId,
            shot_id: selectedShot.id,
            character_names: characterNames,
            scene_names: sceneNames,
            prop_names: propNames,
            costume_names: costumeNames,
          },
        })
        if (cancelled) return
        const data = res.data
        const next: Record<string, EntityNameExistenceItem> = {}
        ;(data?.characters ?? []).forEach((item) => {
          next[`characters:${normalizeAssetName(item.name)}`] = item
        })
        ;(data?.scenes ?? []).forEach((item) => {
          next[`scene:${normalizeAssetName(item.name)}`] = item
        })
        ;(data?.props ?? []).forEach((item) => {
          next[`props:${normalizeAssetName(item.name)}`] = item
        })
        ;(data?.costumes ?? []).forEach((item) => {
          next[`costumes:${normalizeAssetName(item.name)}`] = item
        })
        setReadinessExistenceMap(next)
      } catch {
        if (!cancelled) setReadinessExistenceMap({})
      } finally {
        if (!cancelled) setReadinessExistenceLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    projectId,
    selectedShot?.id,
    shotAssetsOverview?.items,
  ])

  const getReadinessExistenceLabel = useCallback((checkKey: 'characters' | 'scene' | 'props' | 'costumes', name: string) => {
    const item = readinessExistenceMap[`${checkKey}:${normalizeAssetName(name)}`]
    if (!item) {
      return readinessExistenceLoading ? '检测中' : null
    }
    if (!item.exists) return '需新建'
    if (item.linked_to_project && !item.linked_to_shot) return '项目内可关联'
    if (!item.linked_to_project) return '资产库已有'
    if (item.linked_to_shot) return '已关联'
    return null
  }, [readinessExistenceLoading, readinessExistenceMap])


  const promptAssetReadinessNote = useMemo(() => {
    if (!selectedShot) return '请先选择一个分镜。'
    if (selectedShot.skip_extraction) return '当前分镜已明确标记为无需提取，系统会直接按“提取确认已完成”处理。'
    if (!shotAssetsOverview) return '当前还没有拿到这条分镜的资产总览，暂时无法展示候选确认状态。'
    return '这里作为生成前的诊断面板，优先依据后端 assets-overview 展示当前镜头的信息确认状态；提取、刷新与精细确认统一在分镜编辑页处理。'
  }, [selectedShot, shotAssetsOverview])

  const shotExtractStatusText = useMemo(() => {
    if (!shotExtractStatus.message) return ''
    if (!shotExtractStatus.updatedAt) return shotExtractStatus.message
    const time = new Date(shotExtractStatus.updatedAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    return `${shotExtractStatus.message} · ${time}`
  }, [shotExtractStatus])

  const goToShotEditForAssets = useCallback(() => {
    if (!projectId || !currentChapterId || !selectedShot?.id) return
    window.location.assign(`/projects/${projectId}/chapters/${currentChapterId}/shots/${selectedShot.id}/edit`)
  }, [currentChapterId, projectId, selectedShot?.id])

  const extractFileIdFromThumbnail = useCallback((thumbnail?: string | null): string | null => {
    const v = (thumbnail || '').trim()
    if (!v) return null
    // 纯 file_id：不包含路径或协议
    if (!v.includes('/') && !v.includes(':')) return v
    try {
      const url = new URL(v, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
      const m = url.pathname.match(/\/api\/v1\/studio\/files\/([^/]+)\/download\/?$/)
      if (m?.[1]) return decodeURIComponent(m[1])
    } catch {
      // ignore
    }
    return null
  }, [])

  // Resolve names for saved library references that are not linked assets; cancel stale shot responses.
  useEffect(() => {
    if (!keyframePromptPreviewOpen) return
    const saved = Object.values(shotDetail?.frame_reference_selections ?? {}).flat()
    const ids = [...new Set(saved)].filter(fid => !shotLinkedAssets.some(item =>
      extractFileIdFromThumbnail(item.thumbnail) === fid || item.id === fid))
    if (!ids.length) return
    let cancelled = false
    void Promise.allSettled(ids.map(fileId => StudioFilesService.getFileDetailApiV1StudioFilesFileIdGet({ fileId })))
      .then(results => {
        if (cancelled) return
        const additions = results.flatMap(result => result.status === 'fulfilled' && result.value.data
          ? [{ type: 'file', id: result.value.data.id, name: result.value.data.name, thumbnail: buildFileDownloadUrl(result.value.data.id) }]
          : [])
        setShotLinkedAssets(previous => [...previous, ...additions.filter(item => !previous.some(old => old.id === item.id))])
      })
    return () => { cancelled = true }
  }, [keyframePromptPreviewOpen, selectedShot?.id, shotDetail?.frame_reference_selections, extractFileIdFromThumbnail])

  const shotLinkedAssetNameByFileId = useMemo(() => {
    const map = new Map<string, string>()
    shotLinkedAssets.forEach((it: any) => {
      const fid =
        (typeof it?.file_id === 'string' && it.file_id.trim() ? it.file_id.trim() : null) ??
        extractFileIdFromThumbnail(it?.thumbnail ?? null)
      if (!fid) return
      const name = typeof it?.name === 'string' && it.name.trim() ? it.name.trim() : String(it?.id ?? '')
      if (!name) return
      map.set(fid, name)
    })
    return map
  }, [extractFileIdFromThumbnail, shotLinkedAssets])

  const deriveKeyframePromptPreview = useCallback(
    async ({
      base,
      context,
    }: {
      base: { frameType: PromptFrameType; prompt: string }
      context: { refFileIds: string[] }
    }): Promise<FramePromptDerived> => {
      if (!selectedShot?.id) {
        throw new Error('shot is required')
      }
      const basePrompt = (base.prompt || '').trim()
      const refFileIds = (context.refFileIds || []).filter(Boolean)
      if (!basePrompt) {
        return {
          basePrompt: '',
          renderedPrompt: '',
          selectedGuidance: [],
          droppedGuidance: [],
          selectedGuidanceDetails: [],
          droppedGuidanceDetails: [],
          images: [],
          mappings: [],
        }
      }

      const imagesPayload = refFileIds
        .map((fid) => {
          const match =
            shotLinkedAssets.find((x) => extractFileIdFromThumbnail(x.thumbnail ?? null) === fid) ??
            shotLinkedAssets.find((x) => (x as any)?.file_id === fid)
          return match
            ? {
                type: match.type as any,
                id: match.id,
                name: match.name ?? match.id,
                file_id: fid,
              }
            : { type: 'file', id: fid, name: shotLinkedAssetNameByFileId.get(fid) ?? fid, file_id: fid }
        })
        .filter(Boolean)

      const rendered = await StudioGenerationPromptsService.renderShotFramePromptApiV1StudioGenerationPromptsShotsShotIdFramesFrameTypeRenderPost({
        shotId: selectedShot.id,
        frameType: base.frameType,
        requestBody: {
          prompt: basePrompt,
          images: imagesPayload as any,
        } as any,
      })
      const d = rendered.data
      return {
        basePrompt: d?.base_prompt ?? basePrompt,
        qualityReport: d?.variables_snapshot?.quality_report,
        sourceFingerprint: typeof d?.variables_snapshot?.quality_source_fingerprint === 'string' ? d.variables_snapshot.quality_source_fingerprint : undefined,
        renderedPrompt: d?.execution_prompt ?? '',
        selectedGuidance: d?.selected_guidance ?? [],
        droppedGuidance: d?.dropped_guidance ?? [],
        selectedGuidanceDetails: (d?.selected_guidance_details ?? []).map((item) => ({
          text: item.text,
          category: item.category,
          reasonTag: item.reason_tag ?? '',
          reason: item.reason,
        })),
        droppedGuidanceDetails: (d?.dropped_guidance_details ?? []).map((item) => ({
          text: item.text,
          category: item.category,
          reasonTag: item.reason_tag ?? '',
          reason: item.reason,
        })),
        images: d?.recommended_media && 'references' in d.recommended_media
          ? d.recommended_media.references?.map((reference) => reference.file_id) ?? []
          : [],
        mappings: d?.reference_mappings ?? [],
      }
    },
    [extractFileIdFromThumbnail, selectedShot?.id, shotLinkedAssets, shotLinkedAssetNameByFileId],
  )

  const [frameReviewOutputId, setFrameReviewOutputId] = useState<string>()
  const [frameApplication, setFrameApplication] = useState<FrameApplication | null>(null)
  const frameApplicationRef = useRef<FrameApplication | null>(null)
  const frameSubmissionVersion = useRef('')
  /** 保持同一记录稳定，避免历史读取反复触发整个生成面板渲染。 */
  const onFrameApplication = useCallback((value: FrameApplication | null) => {
    setFrameApplication(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value)
    frameApplicationRef.current = value
  }, [])
  useEffect(() => { onFrameApplication(null) }, [selectedShot?.id, keyframePromptPreviewFrameType, onFrameApplication])

  const keyframePromptDraft = useGenerationDraft<
    { frameType: PromptFrameType; prompt: string },
    { refFileIds: string[] },
    FramePromptDerived,
    { taskId: string | null }
  >({
    initialBase: { frameType: 'key', prompt: '' },
    initialContext: { refFileIds: [] },
    derive: deriveKeyframePromptPreview,
    submit: async ({ base, context, derived }) => {
      if (!selectedShot?.id) {
        throw new Error('shot is required')
      }
      const resolvedItems =
        derived.mappings.length > 0
          ? derived.mappings.map((mapping) => ({
              type: mapping.type,
              id: mapping.id,
              name: mapping.name,
              file_id: mapping.file_id,
            }))
          : (context.refFileIds || []).map((fid) => {
              const match =
                shotLinkedAssets.find((x) => extractFileIdFromThumbnail(x.thumbnail ?? null) === fid) ??
                shotLinkedAssets.find((x) => (x as any)?.file_id === fid)
              return {
                type: (match?.type as any) ?? 'file',
                id: match?.id ?? fid,
                name: match?.name ?? match?.id ?? fid,
                file_id: fid,
              }
            })

      const ratio = resolveVideoRatioForRequest()
      if (!ratio) {
        throw new Error('video ratio is required')
      }
      const version = frameSubmissionVersion.current
      const activeApplication = frameApplicationRef.current
      const boundContext = { shot_id: selectedShot.id, draft_prompt: derived.renderedPrompt, source_fingerprint: derived.sourceFingerprint,
        model_revision_id: imageChoice?.revision, reference_mode: base.frameType, image_file_ids: context.refFileIds,
        ratio, resolution: imageChoice?.value }
      const useApplication = activeApplication?.before === derived.renderedPrompt && activeApplication.binding === frameInputKey(boundContext)
      const reviewedRequest = await reviewGenerationRequest({
          model_id: imageChoice?.spec?.model_id || null,
          execution_prompt: useApplication ? activeApplication.prompt : (derived.renderedPrompt || base.prompt || '').trim(),
          quality_source_fingerprint: derived.sourceFingerprint,
          quality_review_task_id: useApplication ? activeApplication.record.source_task_id || activeApplication.record.task_id : undefined,
          quality_revision_task_id: useApplication ? activeApplication.record.task_id : undefined,
          media: { references: resolvedItems.map((image, ordinal) => ({file_id:image.file_id,media_kind:'image' as const,ordinal})) },
          operation_input: {kind:'image_generation',target_ratio:ratio,count:1},
        }, undefined, imageChoice)
      if (version !== frameSubmissionVersion.current) throw new Error('确认期间帧图输入已变化，请重新核对后生成')
      const created = await StudioGenerationTasksService.submitShotFrameGenerationTaskApiV1StudioGenerationTasksShotsShotIdFramesFrameTypePost({
        shotId: selectedShot.id,
        frameType: base.frameType,
        requestBody: reviewedRequest,
      })
      return {
        taskId: created.data?.task_id ?? null,
      }
    },
  })
  const keyframePromptPreviewDraft = keyframePromptDraft.base.prompt
  const frameReviewContext: ReviewGenerationContext = {
    shot_id: selectedShot?.id,
    draft_prompt: keyframePromptDraft.derived?.renderedPrompt || '', source_fingerprint: keyframePromptDraft.derived?.sourceFingerprint,
    model_revision_id: imageChoice?.revision, reference_mode: keyframePromptDraft.base.frameType,
    image_file_ids: keyframePromptDraft.context.refFileIds, ratio: resolveVideoRatioForRequest(), resolution: imageChoice?.value,
  }
  const frameReviewBinding = frameInputKey(frameReviewContext)
  const rawFramePrompt = keyframePromptDraft.derived?.renderedPrompt || ''
  const currentFrameApplication = frameApplication?.before === rawFramePrompt && frameApplication.binding === frameReviewBinding ? frameApplication : null
  const keyframePromptRenderedDraft = currentFrameApplication?.prompt || rawFramePrompt
  frameSubmissionVersion.current = JSON.stringify([selectedShot?.id, keyframePromptDraft.base, frameReviewBinding, currentFrameApplication?.prompt])
  const keyframePromptSelectedGuidance = keyframePromptDraft.derived?.selectedGuidance ?? []
  const keyframePromptDroppedGuidance = keyframePromptDraft.derived?.droppedGuidance ?? []
  const keyframePromptSelectedGuidanceDetails = keyframePromptDraft.derived?.selectedGuidanceDetails ?? []
  const keyframePromptDroppedGuidanceDetails = keyframePromptDraft.derived?.droppedGuidanceDetails ?? []
  const keyframePromptVisibleSelectedGuidanceDetails = keyframePromptDecisionCollapsed
    ? keyframePromptSelectedGuidanceDetails.slice(0, 2)
    : keyframePromptSelectedGuidanceDetails
  const keyframePromptVisibleDroppedGuidanceDetails = keyframePromptDecisionCollapsed
    ? keyframePromptDroppedGuidanceDetails.slice(0, 1)
    : keyframePromptDroppedGuidanceDetails
  const keyframePromptRenderMappings = keyframePromptDraft.derived?.mappings ?? []
  const keyframePromptPreviewRefFileIds = keyframePromptDraft.context.refFileIds
  const keyframePromptRenderState = keyframePromptDraft.state
  const [basePromptComposing, setBasePromptComposing] = useState(false)
  const frameRenderRequest = useRef(0)
  const { deriveNow: deriveKeyframeNow } = keyframePromptDraft
  /** Refresh only derived output; typing keeps focus and the last preview while a newer request runs. */
  const renderShotPromptToTextarea = useCallback(
    async (opts?: { frameType?: PromptFrameType; prompt?: string; refFileIds?: string[]; showPreviewLoading?: boolean }) => {
      if (!selectedShot?.id) return
      const frameType = opts?.frameType ?? keyframePromptPreviewFrameType
      const prompt = opts?.prompt ?? keyframePromptPreviewDraft
      if (!prompt.trim()) return
      const refFileIds = opts?.refFileIds ?? keyframePromptPreviewRefFileIds
      const request = ++frameRenderRequest.current
      setShotRenderPromptLoading(true)
      if (opts?.showPreviewLoading) setKeyframePromptPreviewLoading(true)
      try {
        await deriveKeyframeNow({ base: { frameType, prompt }, context: { refFileIds } })
      } finally {
        if (request === frameRenderRequest.current) {
          setShotRenderPromptLoading(false)
          setKeyframePromptPreviewLoading(false)
        }
      }
    },
    [deriveKeyframeNow, keyframePromptPreviewDraft, keyframePromptPreviewFrameType, keyframePromptPreviewRefFileIds, selectedShot?.id],
  )

  const orderedLinkedCharacterIds = useMemo(() => {
    return shotCharacterLinks
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((x) => x.character_id)
      .filter(Boolean)
      .map((x) => String(x))
  }, [shotCharacterLinks])

  const [frameReferencePickerOpen, setFrameReferencePickerOpen] = useState(false)
  const [savingFrameReferences, setSavingFrameReferences] = useState(false)

  const autoKeyframeRefFileIds = useMemo(() => {
    const out: string[] = []
    const push = (fid: string | null) => {
      if (!fid) return
      if (out.includes(fid)) return
      out.push(fid)
    }
    // 角色（按 index 顺序）
    orderedLinkedCharacterIds.forEach((cid) =>
      push(extractFileIdFromThumbnail(linkedAssetThumbByKey.get(`character:${cid}`) ?? null)),
    )
    // 场景（单个）
    if (linkedSceneId) push(extractFileIdFromThumbnail(linkedAssetThumbByKey.get(`scene:${linkedSceneId}`) ?? null))
    // 道具
    linkedPropIds.forEach((pid) => push(extractFileIdFromThumbnail(linkedAssetThumbByKey.get(`prop:${pid}`) ?? null)))
    // 服装
    linkedCostumeIds.forEach((cid) =>
      push(extractFileIdFromThumbnail(linkedAssetThumbByKey.get(`costume:${cid}`) ?? null)),
    )
    return out
  }, [
    extractFileIdFromThumbnail,
    linkedCostumeIds,
    linkedPropIds,
    linkedSceneId,
    linkedAssetThumbByKey,
    orderedLinkedCharacterIds,
  ])


  const loadProjectRoleOptions = async () => {
    if (!projectId) {
      setProjectRoleOptions([])
      return
    }
    setLinkRoleLoading(true)
    try {
      const res = await StudioEntitiesApi.list('character', { page: 1, pageSize: 20, q: null })
      const items = (res.data?.items ?? []).filter((x: any) => x?.project_id === projectId)
      const opts = items.map((c: any) => {
        const id = String(c?.id ?? '')
        const name = String(c?.name ?? id)
        const thumb = typeof c?.thumbnail === 'string' ? c.thumbnail : ''
        const disabled = linkedCharacterIds.includes(id)
        return {
          value: id,
          searchLabel: name,
          disabled,
          label: (
            <div className="flex items-center gap-2 min-w-0">
              {thumb ? (
                <PreviewImage src={resolveAssetUrl(thumb)} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                  <UserOutlined />
                </div>
              )}
              <div className="min-w-0 truncate">{name}</div>
            </div>
          ),
        }
      })
      setProjectRoleOptions(opts)
    } catch {
      setProjectRoleOptions([])
    } finally {
      setLinkRoleLoading(false)
    }
  }

  const loadProjectAssetOptions = async (kind: 'scene' | 'prop' | 'costume') => {
    if (!projectId) return
    if (kind === 'scene') setLinkSceneLoading(true)
    if (kind === 'prop') setLinkPropLoading(true)
    if (kind === 'costume') setLinkCostumeLoading(true)
    try {
      const res = await StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: kind,
        projectId,
        chapterId: null,
        shotId: null,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 20,
      })
      const items = (res.data?.items ?? []) as any[]
      const ids = Array.from(
        new Set(
          items
            .map((it) => (kind === 'scene' ? it.scene_id : kind === 'prop' ? it.prop_id : it.costume_id))
            .filter(Boolean)
            .map((x) => String(x)),
        ),
      )
      const details = await Promise.all(
        ids.map(async (id) => {
          try {
            const r = await StudioEntitiesApi.get(kind as any, id)
            const d = (r.data ?? null) as any
            return { id, name: String(d?.name ?? id), thumb: typeof d?.thumbnail === 'string' ? d.thumbnail : '' }
          } catch {
            return { id, name: id, thumb: '' }
          }
        }),
      )
      const nextThumbMap: Record<string, string> = {}
      details.forEach((d) => {
        if (d.thumb) nextThumbMap[d.id] = d.thumb
      })

      const makeLabel = (d: { id: string; name: string; thumb: string }) => (
        <div className="flex items-center gap-2 min-w-0">
          {d.thumb ? (
            <PreviewImage src={resolveAssetUrl(d.thumb)} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
              <UserOutlined />
            </div>
          )}
          <div className="min-w-0 truncate">{d.name}</div>
        </div>
      )

      if (kind === 'scene') {
        setProjectSceneOptions(details.map((d) => ({ value: d.id, searchLabel: d.name, label: makeLabel(d) })))
      } else if (kind === 'prop') {
        setProjectPropOptions(
          details.map((d) => ({ value: d.id, searchLabel: d.name, label: makeLabel(d), disabled: linkedPropIds.includes(d.id) })),
        )
      } else {
        setProjectCostumeOptions(
          details.map((d) => ({ value: d.id, searchLabel: d.name, label: makeLabel(d), disabled: linkedCostumeIds.includes(d.id) })),
        )
      }
    } finally {
      if (kind === 'scene') setLinkSceneLoading(false)
      if (kind === 'prop') setLinkPropLoading(false)
      if (kind === 'costume') setLinkCostumeLoading(false)
    }
  }

  const openReadinessLinker = useCallback(
    async (kind: 'characters' | 'scene' | 'props' | 'costumes') => {
      if (!selectedShot?.id) return
      if (kind === 'characters') {
        setInspectorTabKey('keyframe_gen')
        setLinkRoleSelectedIds([])
        setLinkRoleOpen(true)
        await loadProjectRoleOptions()
        return
      }
      if (kind === 'scene') {
        setInspectorTabKey('keyframe_gen')
        setLinkSceneOpen(true)
        await loadProjectAssetOptions('scene')
        return
      }
      if (kind === 'props') {
        setInspectorTabKey('keyframe_gen')
        setLinkPropSelectedIds([])
        setLinkPropOpen(true)
        await loadProjectAssetOptions('prop')
        return
      }
      setInspectorTabKey('keyframe_gen')
      setLinkCostumeSelectedIds([])
      setLinkCostumeOpen(true)
      await loadProjectAssetOptions('costume')
    },
    [loadProjectAssetOptions, loadProjectRoleOptions, selectedShot?.id],
  )

  const openReadinessCreate = useCallback((kind: 'characters' | 'scene' | 'props' | 'costumes', name: string) => {
    if (!projectId || !selectedShot?.id) return
    const currentShotId = selectedShot.id
    const styleQ =
      `&visualStyle=${encodeURIComponent(projectVisualStyle)}` +
      `&style=${encodeURIComponent(projectStyle)}`
    const ctxQ =
      `&projectId=${encodeURIComponent(projectId)}` +
      `&chapterId=${encodeURIComponent(currentChapterId ?? '')}` +
      `&shotId=${encodeURIComponent(currentShotId)}` +
      styleQ
    const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')
    if (kind === 'characters') {
      open(`/projects/${encodeURIComponent(projectId)}?tab=roles&create=1&name=${encodeURIComponent(name)}${ctxQ}`)
      return
    }
    const tab = kind === 'scene' ? 'scene' : kind === 'props' ? 'prop' : 'costume'
    open(`/assets?tab=${tab}&create=1&name=${encodeURIComponent(name)}${ctxQ}`)
  }, [currentChapterId, projectId, projectStyle, projectVisualStyle, selectedShot?.id])

  const handleReadinessMissingAction = useCallback(async (kind: 'characters' | 'scene' | 'props' | 'costumes', name: string) => {
    const item = readinessExistenceMap[`${kind}:${normalizeAssetName(name)}`]
    if (item && !item.exists) {
      openReadinessCreate(kind, name)
      return
    }
    await openReadinessLinker(kind)
  }, [openReadinessCreate, openReadinessLinker, readinessExistenceMap])

  useEffect(() => {
    if (sceneIds.length === 0) {
      setSceneNameMap({})
      return
    }
    void (async () => {
      const entries = await Promise.all(
        sceneIds.map(async (id) => {
          try {
            const r = await StudioEntitiesApi.get('scene', id)
            const d = r.data as { name?: string } | null | undefined
            return [id, d?.name?.trim() || id] as const
          } catch {
            return [id, id] as const
          }
        }),
      )
      setSceneNameMap(Object.fromEntries(entries))
    })()
  }, [sceneIds])

  useEffect(() => {
    if (characterIds.length === 0) {
      setCharacterNameMap({})
      return
    }
    void (async () => {
      const entries = await Promise.all(
        characterIds.map(async (id) => {
          try {
            const r = await StudioEntitiesApi.get('character', id)
            const d = r.data as { name?: string; thumbnail?: string | null } | null | undefined
            const name = d?.name?.trim() || id
            const thumb = typeof d?.thumbnail === 'string' && d.thumbnail.trim() ? d.thumbnail.trim() : ''
            return { id, name, thumb }
          } catch {
            return { id, name: id, thumb: '' }
          }
        }),
      )
      const nextNameMap: Record<string, string> = {}
      entries.forEach((e) => {
        nextNameMap[e.id] = e.name
      })
      setCharacterNameMap(nextNameMap)
    })()
  }, [characterIds])

  const getPromptFromDetailByType = (frameType: PromptFrameType): string => {
    if (!shotDetail) return ''
    if (frameType === 'first') return shotDetail.first_frame_prompt ?? ''
    if (frameType === 'last') return shotDetail.last_frame_prompt ?? ''
    return shotDetail.key_frame_prompt ?? ''
  }

  const frameLabel: Record<PromptFrameType, string> = { first: '首帧', key: '关键帧', last: '尾帧' }

  const handleRefFrameTypeDropdownVisibleChange = useCallback(
    async (open: boolean) => {
      if (!open || !onRefreshShotFrameImages) return
      setRefFrameTypeSelectLoading(true)
      try {
        await onRefreshShotFrameImages()
      } finally {
        setRefFrameTypeSelectLoading(false)
      }
    },
    [onRefreshShotFrameImages],
  )

  const refFrameTypeOptions = useMemo(() => {
    const c = videoCapability
    if (!c) return []
    const opts: Array<{value:string;label:string}> = []
    if (c.supports_text_to_video && !c.requires_first_frame && !c.requires_subject_reference) opts.push({value:'text_only',label:'纯文本 · 由模型组织画面'})
    if (c.supports_first_frame && !c.requires_last_frame && !c.requires_subject_reference) opts.push({value:'first',label:'首帧 · 从确定画面开始'})
    if (c.supports_first_frame && c.supports_last_frame && !c.requires_subject_reference) opts.push({value:'first_last',label:'首尾帧 · 控制开始和结束画面'})
    if (c.supports_last_frame && !c.requires_first_frame && !c.requires_subject_reference) opts.push({value:'last',label:'尾帧 · 控制结束画面'})
    if (c.max_key_frames !== 0 && !c.requires_first_frame && !c.requires_subject_reference) opts.push({value:'key',label:'关键帧参考'})
    if (c.studio_subject_images_verified) opts.push({value:'subjects',label:'主体多图 · 角色、场景与道具'})
    return opts
  }, [videoCapability])

  /** Collect preview references without choosing a channel; enforce API limits only before API submission. */
  const buildVideoRefSelection = async (validateApi = true) => {
    const first = frameImages.find((x) => x.frame_type === 'first')?.file_id ?? null
    const last = frameImages.find((x) => x.frame_type === 'last')?.file_id ?? null
    const key = frameImages.find((x) => x.frame_type === 'key')?.file_id ?? null

    if (!validateApi) {
      if (videoReferenceMode === 'subjects') return { referenceMode: 'subjects' as const, images: [], subjects: videoSubjects }
      const images = videoReferenceMode === 'first_last' ? [first, last] : videoReferenceMode === 'first' ? [first] : videoReferenceMode === 'last' ? [last] : videoReferenceMode === 'key' ? [key] : []
      if (images.some(id => !id)) throw new Error('所选参考模式缺少已采用图片，请先选择对应参考帧')
      return { referenceMode: videoReferenceMode, images: images.filter((id): id is string => !!id), subjects: [] }
    }
    const capability = (await LlmService.getVideoGenerationOptionsApiV1LlmVideoGenerationOptionsGet({modelId:videoModelId})).data
    if (!capability) throw new Error('无法读取视频模型能力')
    const s = videoReferenceMode
    const duration = shotDetail?.duration || 0
    if (!duration || (capability.min_seconds && duration < capability.min_seconds) || (capability.max_seconds && duration > capability.max_seconds) || (capability.allowed_seconds?.length && !capability.allowed_seconds.includes(duration))) throw new Error('镜头时长不符合当前型号，请调整时长或把动作拆成多个镜头，系统不会自动压缩剧情')
    if (!(capability.allowed_ratios || []).includes(resolveVideoRatioForRequest() || '')) throw new Error('当前画面比例不符合所选型号，请调整镜头比例')
    if (s === 'subjects') {
      if (!capability.studio_subject_images_verified) throw new Error('当前型号的主体多图接口尚未在工作室核验，请选择其他支持方式或配置已支持的参考生视频模型')
      if (!videoSubjects.length || videoSubjects.length > (capability.max_subjects || 0) || videoSubjects.reduce((n, s) => n + (s.media?.length ?? 0), 0) > (capability.max_total_subject_images || 0) || videoSubjects.some(s => (s.media?.length ?? 0) > (capability.max_images_per_subject || 0))) throw new Error(`请选择 1–${capability.max_total_subject_images} 张主体参考图片（并遵守主体组上限）`)
      if (videoSubjects.some(item => !item.name.trim()) || new Set(videoSubjects.map(item => item.name.trim().toLowerCase())).size !== videoSubjects.length) throw new Error('每个主体组请填写不同且明确的名称，同一人物的多个角度放在同一组')
      return {referenceMode:'subjects' as const,images:[],subjects:videoSubjects}
    }
    if (!refFrameTypeOptions.some(item => item.value === s)) throw new Error('所选参考模式不适用于当前模型，请重新选择')
    if ((s === 'first' && !first) || (s === 'last' && !last) || (s === 'key' && !key) || (s === 'first_last' && (!first || !last))) throw new Error('该参考模式缺少已采用图片，请在关键帧与参考图中生成、上传并采用对应帧')
    if (capability.requires_last_frame && (!first || !last || s !== 'first_last')) {
      throw new Error('当前型号必须同时提供首帧和尾帧，并选择首尾帧参考模式')
    }
    if (capability.requires_first_frame && (!first || !['first', 'first_last'].includes(s || ''))) {
      throw new Error('该型号必须输入首帧：请先生成或上传镜头首帧，并选择首帧参考。资产关联图片不会自动充当首帧。')
    }
    if (s === 'last' || s === 'first_last') {
      if (!capability.supports_last_frame) throw new Error('当前视频型号不支持尾帧，请选择首帧或其他支持的模式')
    }
    if (s === 'key' && capability.max_key_frames === 0) throw new Error('当前型号不支持关键帧参考，请选择首帧模式')
    if (capability.requires_first_frame && !refImageType) { setRefImageType('first'); message.info('当前型号需要首帧，已使用该镜头现有首帧作为参考') }
    if (s === 'first_last') {
      return {
        referenceMode: 'first_last' as const,
        images: [first, last].filter((x): x is string => Boolean(x)),
      }
    }
    if (s === 'key') return { referenceMode: 'key' as const, images: key ? [key] : [] }
    if (s === 'first') return { referenceMode: 'first' as const, images: first ? [first] : [] }
    if (s === 'last') return { referenceMode: 'last' as const, images: last ? [last] : [] }
    return { referenceMode: 'text_only' as const, images: [] }
  }

  /** 维护标签页的防抖文本也必须先提交，不能仅刷新已经保存的镜头参数。 */
  const syncInspectorInputs = async () => {
    await Promise.all([flushOpsTitle(), flushOpsNote()])
    await props.onSyncGenerationInputs()
  }
  const videoOpenSequence = useRef(0)
  const videoOpenIdentity = useRef('')
  videoOpenIdentity.current = JSON.stringify([selectedShot?.id, videoSourceKey])
  const latestVideoActions = useRef({ open: async () => {}, submit: async () => {} })
  /** 显式生成操作先同步已保存数据，然后调用最新一轮渲染中的构建函数。 */
  const openVideoPromptPreview = async () => {
    try {
      await syncInspectorInputs()
      await latestVideoActions.current.open()
    } catch (error) { message.error(error instanceof Error ? error.message : '最新设置读取失败，未发起生成') }
  }
  /** 同步完成后根据当前渲染的参数和参考素材建立发送预览。 */
  const openPreparedVideoPrompt = async () => {
    setVideoRestoredDraftNotice(null)
    const sequence = ++videoOpenSequence.current
    const identity = videoOpenIdentity.current
    const isCurrent = () => sequence === videoOpenSequence.current && identity === videoOpenIdentity.current
    if (!selectedShot?.id) {
      message.warning('请先选择一个分镜')
      return
    }
    if (props.detailSaving) {
      message.info('镜头设置正在保存，请稍后再点击生成'); return
    }
    let selection: Awaited<ReturnType<typeof buildVideoRefSelection>>
    try { selection = await buildVideoRefSelection(false) } catch (error) {
      message.error(error instanceof Error ? error.message : '视频参考输入不符合模型要求')
      return
    }
    const { referenceMode, images } = selection
    const nextContext = { referenceMode, images, subjects: 'subjects' in selection ? selection.subjects : [] }
    videoPromptDraft.hydrate({
      base: { prompt: '' },
      context: nextContext,
    })
    setVideoPreviewSourceKey(videoSourceKey)
    setVideoPromptContextCollapsed(true)
    setVideoPreviewTab('prompt')
    setVideoPreviewContextKey(reviewContextKey({ ...videoReviewContext, reference_mode: referenceMode, image_file_ids: images, subjects: nextContext.subjects }))
    setVideoPromptPreviewOpen(true)
    setVideoPromptPreviewLoading(true)
    try {
      const derived = await videoPromptDraft.deriveNow({
        base: { prompt: '' },
        context: nextContext,
      })
      if (derived) {
        const history = await StudioGenerationTasksService.getQualityReviewHistoryApiV1StudioGenerationTasksShotsShotIdQualityReviewsGet({ shotId: selectedShot.id, scope: 'video', pageSize: 1 }).catch(() => { message.warning('历史优化暂未读取，当前仍使用本次原稿'); return null })
        if (!isCurrent()) return
        const applied = history?.data?.latest_applied
        const context = { ...videoReviewContext, reference_mode: referenceMode, image_file_ids: derived.images, subjects: nextContext.subjects }
        // Restore the exact persisted send draft, including optimizations made from manual edits.
        // Source identity and parameters, rather than the old default prose, determine compatibility.
        let needsRecheck = false
        if (applied?.application?.active && applied.source_fingerprint === derived.sourceFingerprint &&
          reviewContextKey(applied.application.generation_context) === reviewContextKey(context)) {
          derived.prompt = applied.application.prompt
          setVideoReviewLineage(applied)
        } else {
          setVideoReviewLineage(null)
          if (applied?.application?.active) {
            // Preserve the user's work even when old review evidence is no longer current.
            // Mark dirty so it must be compiled with today's sources before any paid submission.
            derived.prompt = applied.application.prompt
            needsRecheck = true
            setVideoRestoredDraftNotice('已载入你保存的优化稿，但镜头来源、参考图或参数有变化。请检查编辑内容并点击“更新发送预览”；旧预检仅供参考，不代表本次已预检。无需复制粘贴，也不强制重新调用模型。')
          }
        }
        videoPromptDraft.hydrate({
          base: { prompt: derived.prompt },
          context: {
            referenceMode,
            subjects: nextContext.subjects,
            images: derived.images,
          },
          derived,
          state: needsRecheck ? 'draft_changed' : 'derived',
        })
      }
    } catch {
      message.error('获取视频提示词预览失败')
    } finally {
      if (isCurrent()) setVideoPromptPreviewLoading(false)
    }
  }

  /** 视频必须先展示同步后的发送稿，禁止点击生成时隐式补写用户尚未看过的内容。 */
  const submitVideoGeneration = async () => {
    try { await syncInspectorInputs(); await latestVideoActions.current.submit() }
    catch (error) { message.error(error instanceof Error ? error.message : '最新设置同步失败，未提交生成') }
  }
  /** 仅允许最新来源及参数已经核对的预览进入费用确认。 */
  const submitPreparedVideoGeneration = async () => {
    if (videoSubmitLock.current) return
    if (!videoPreviewFresh || !videoPromptDraft.derived?.prompt.trim()) {
      message.warning('请先更新发送预览，核对完整提示词后再生成')
      return
    }
    if (!selectedShot?.id) {
      message.warning('请先选择一个分镜')
      return
    }
    if (!resolveVideoRatioForRequest()) {
      message.warning('当前镜头缺少视频比例，请先设置项目默认比例或镜头覆盖比例')
      return
    }
    const prompt = (videoPromptPreviewDraft || '').trim()
    if (!prompt) {
      message.warning('请输入视频提示词')
      return
    }
    videoSubmitLock.current = true
    videoRequestSent.current = false
    setVideoPromptPreviewSubmitting(true)
    try {
      // Entering the shared page never implies choosing API or accepting its restrictions.
      await buildVideoRefSelection(true)
      const submitted = await videoPromptDraft.submitNow()
      const taskId = submitted?.taskId
      if (!taskId) {
        if (videoRequestSent.current) message.error('未取得任务编号。请先到任务中心核对是否已创建，勿直接重复生成。')
        else message.info('未提交视频任务，可返回调整；如有配置变化，请更新发送预览。')
        return
      }
      window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId,title:'分镜视频生成'}}))
      setVideoTaskId(taskId)
      setVideoTaskStatus('pending')
      setVideoTaskPolling(true)
      setVideoTask({
        taskId,
        status: 'pending',
        progress: 0,
        cancelRequested: false,
      })
      setVideoSettledTask(null)
      setVideoPromptPreviewOpen(false)
    } catch (error) {
      const body = (error as { body?: { message?: string; detail?: string } })?.body
      message.error(body?.message || body?.detail || (error instanceof Error ? error.message : '发起视频生成失败'))
    } finally {
      videoSubmitLock.current = false
      setVideoPromptPreviewSubmitting(false)
    }
  }

  latestVideoActions.current = { open: openPreparedVideoPrompt, submit: submitPreparedVideoGeneration }

  useEffect(() => {
    if (!videoTaskPolling || !videoTaskId) return
    let cancelled = false
    void (async () => {
      try {
        let finalTaskState: RelationTaskState | null = null
        for (let i = 0; i < 60; i += 1) {
          await sleep(2000)
          if (cancelled) return
          const statusRes = await FilmService.getTaskStatusApiV1FilmTasksTaskIdStatusGet({ taskId: videoTaskId })
          const status = statusRes.data?.status ?? null
          if (!status) continue
          if (statusRes.data) {
            finalTaskState = toRelationTaskStateFromStatusRead(statusRes.data)
            setVideoTask(finalTaskState)
          }
          setVideoTaskStatus(status)
          if (status === 'succeeded' || status === 'failed' || status === 'cancelled') break
        }
        if (
          !cancelled &&
          finalTaskState &&
          (finalTaskState.status === 'succeeded' ||
            finalTaskState.status === 'failed' ||
            finalTaskState.status === 'cancelled')
        ) {
          setVideoTask(null)
          setVideoSettledTask(finalTaskState)
        }
      } catch {
        if (!cancelled) {
          message.error('获取视频任务状态失败')
        }
      } finally {
        if (!cancelled) setVideoTaskPolling(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [videoTaskPolling, videoTaskId])
  const updateCardState = (frameType: PromptFrameType, patch: Partial<KeyframeCardState>) => {
    setKeyframeCards((prev) => ({ ...prev, [frameType]: { ...prev[frameType], ...patch } }))
  }

  const getLatestFrameSlotId = async (frameType: PromptFrameType): Promise<number | null> => {
    if (!selectedShot?.id) return null
    const res = await StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({
      shotDetailId: selectedShot.id,
      order: null,
      isDesc: false,
      page: 1,
      pageSize: 100,
    })
    const items = (res.data?.items ?? []) as ShotFrameImageRead[]
    const slot = items.find((x) => x.frame_type === frameType)
    return slot?.id ?? null
  }

  const loadCardThumbs = async (frameType: PromptFrameType, slotIdOverride?: number | null, retryCount = 1) => {
    const epoch = frameRequestEpoch.current
    if (!selectedShot?.id) return
    // Read the canonical slot as well as task history; uploaded/adopted frames need no task link.
    const slots = await StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({
      shotDetailId: selectedShot.id, page: 1, pageSize: 100,
    })
    const slot = slots.data?.items.find((item) => item.frame_type === frameType)
    const slotId = slot?.id ?? slotIdOverride
    if (epoch !== frameRequestEpoch.current) return
    if (!slotId) {
      updateCardState(frameType, { thumbs: [] })
      return
    }
    let thumbs: Array<{ linkId: number; fileId: string; thumbUrl: string }> = []
    for (let i = 0; i < retryCount; i += 1) {
      const groups = await Promise.all(['shot_frame_slot', 'shot_frame_image'].map((relationType) => listTaskLinksNormalized({
        resourceType: 'image',
        relationType,
        relationEntityId: String(slotId),
        order: 'updated_at',
        isDesc: true,
        page: 1,
        pageSize: 100,
      })))
      const links = groups.flat()
      const seen = new Set<string>()
      thumbs = links
        .filter((l) => Boolean(l.file_id))
        .filter((l) => {
          const fid = String(l.file_id)
          if (seen.has(fid)) return false
          seen.add(fid)
          return true
        })
        .map((l) => ({
          linkId: l.id,
          fileId: String(l.file_id),
          thumbUrl: buildFileDownloadUrl(String(l.file_id)) ?? '',
        }))
      if (slot?.file_id && !seen.has(slot.file_id)) {
        thumbs.unshift({ linkId: -slot.id, fileId: slot.file_id, thumbUrl: buildFileDownloadUrl(slot.file_id) ?? '' })
      }
      if (thumbs.length > 0 || i === retryCount - 1) break
      await sleep(800)
    }
    if (epoch === frameRequestEpoch.current) updateCardState(frameType, { thumbs })
  }

  /** 只在没有已保存草稿时免费整理，保留用户自己的画面描述。 */
  const generateKeyframeCard = async (frameType: PromptFrameType, inspectFileId?: string) => {
    const openingEpoch = frameRequestEpoch.current
    setFrameReviewOutputId(inspectFileId)
    if (!selectedShot?.id) {
      message.warning('请先选择一个分镜')
      return
    }
    try {
      setKeyframePromptPreviewLoading(true)
      setKeyframePromptPreviewFrameType(frameType)
      void loadCardThumbs(frameType)
      setKeyframePromptDebugCollapsed(true)
      setKeyframeDirectiveCollapsed(true)
      setKeyframePromptDecisionCollapsed(true)
      let basePrompt = getPromptFromDetailByType(frameType)
      if (!basePrompt.trim()) {
        const initial = await StudioGenerationPromptsService.initialFramePromptApiV1StudioGenerationPromptsShotsShotIdFramesFrameTypeDraftGet({shotId: selectedShot.id, frameType})
        basePrompt = String(initial.data?.prompt || '')
        if (initial.data?.warnings?.length) message.warning(initial.data.warnings.join('；'))
      }
      if (openingEpoch !== frameRequestEpoch.current) return
      setKeyframePromptPreviewOpen(true)
      const savedReferences = shotDetail?.frame_reference_selections?.[frameType] ?? autoKeyframeRefFileIds
      keyframePromptDraft.hydrate({
        base: { frameType, prompt: basePrompt },
        context: { refFileIds: savedReferences },
        state: basePrompt.trim() ? 'draft_changed' : 'idle',
      })
      setKeyframePromptDebugContext(null)
      setKeyframePromptQualityChecks(null)
      // 文本区域内容：统一由 frame-render-prompt 获取
      if (basePrompt.trim()) {
        void renderShotPromptToTextarea({
          frameType,
          prompt: basePrompt,
          refFileIds: savedReferences,
          showPreviewLoading: true,
        })
      } else {
        setKeyframePromptPreviewLoading(false)
      }
    } catch {
      message.error('获取提示词失败')
      setKeyframePromptPreviewLoading(false)
    } finally {
      // loading 由 renderShotPromptToTextarea 结束后关闭
    }
  }

  /** 仅主动保存当前帧的基础草稿，其他帧与已生成图片保持原样。 */
  const saveFrameBasePrompt = async () => {
    if (!selectedShot?.id || !keyframePromptPreviewDraft.trim()) return
    const frameType = keyframePromptPreviewFrameType
    const field = frameType === 'first' ? 'first_frame_prompt' : frameType === 'last' ? 'last_frame_prompt' : 'key_frame_prompt'
    const patch = { [field]: keyframePromptPreviewDraft }
    const epoch = frameRequestEpoch.current
    setKeyframePromptActionLoading(true)
    try {
      await StudioShotDetailsService.updateShotDetailApiV1StudioShotDetailsShotIdPatch({shotId:selectedShot.id,requestBody:patch})
      if (epoch === frameRequestEpoch.current) { onPatchShotDetail(patch); message.success('已保存本帧基础提示词') }
    } catch { message.error('保存失败，当前草稿仍保留，请重试') }
    finally { if (epoch === frameRequestEpoch.current) setKeyframePromptActionLoading(false) }
  }

  /** 按当前编辑草稿渲染，不回退到数据库旧文本。 */
  const regenerateKeyframePrompt = async () => {
    if (!selectedShot?.id) {
      message.warning('请先选择一个分镜')
      return
    }
    const frameType = keyframePromptPreviewFrameType
    const basePrompt = keyframePromptPreviewDraft.trim()
    if (!basePrompt) {
      message.warning('请先输入基础提示词，再渲染最终提示词')
      return
    }
    setKeyframePromptActionLoading(true)
    try {
      await renderShotPromptToTextarea({
        frameType,
        prompt: basePrompt,
        refFileIds: keyframePromptPreviewRefFileIds,
      })
      message.success('提示词已按统一规则渲染')
    } catch {
      message.error('渲染提示词失败')
    } finally {
      setKeyframePromptActionLoading(false)
    }
  }

  useEffect(() => {
    // 关闭主弹窗时关闭文件选择器；显式空参考列表不能被自动推荐覆盖。
    if (!keyframePromptPreviewOpen) setFrameReferencePickerOpen(false)
  }, [keyframePromptPreviewOpen])

  /** 保存当前帧的参考顺序；失败直接抛出，禁止假保存后继续生成。 */
  const saveFrameReferences = async () => {
    if (!selectedShot?.id) throw new Error('请先选择镜头')
    const epoch = frameRequestEpoch.current
    setSavingFrameReferences(true)
    try {
      const response = await StudioShotDetailsService.updateShotDetailApiV1StudioShotDetailsShotIdPatch({
        shotId: selectedShot.id,
        requestBody: { frame_reference_selections: { [keyframePromptPreviewFrameType]: keyframePromptPreviewRefFileIds } },
      })
      if (epoch === frameRequestEpoch.current && response.data) {
        onPatchShotDetail({ frame_reference_selections: response.data.frame_reference_selections })
      }
    } finally { setSavingFrameReferences(false) }
  }


  useEffect(() => {
    if (!keyframePromptPreviewOpen || basePromptComposing) return
    if (mapGenerationDraftStateToRenderState(keyframePromptRenderState) !== 'stale') return
    const basePrompt = (keyframePromptPreviewDraft || '').trim()
    if (!basePrompt) return
    const refFileIds =
      keyframePromptPreviewRefFileIds
    const timer = window.setTimeout(() => {
      void renderShotPromptToTextarea({
        frameType: keyframePromptPreviewFrameType,
        prompt: basePrompt,
        refFileIds,
      })
    }, 700)
    return () => {
      window.clearTimeout(timer)
    }
  }, [
    basePromptComposing,
    keyframePromptPreviewDraft,
    keyframePromptPreviewFrameType,
    keyframePromptPreviewOpen,
    keyframePromptPreviewRefFileIds,
    keyframePromptRenderState,
    renderShotPromptToTextarea,
  ])

  /** 受理后立即释放弹窗；按原镜头epoch跟踪结果，旧任务不干扰后开的窗口。 */
  const confirmGenerateKeyframeWithPrompt = async () => {
    const epoch = frameRequestEpoch.current
    if (!selectedShot?.id) {
      message.warning('请先选择一个分镜')
      return
    }
    let accepted = false
    const frameType = keyframePromptPreviewFrameType
    const basePrompt = (keyframePromptPreviewDraft || '').trim()
    if (!basePrompt) {
      message.warning('请输入提示词')
      return
    }

    setKeyframePromptActionLoading(true)
    updateCardState(frameType, { loading: true, taskStatus: 'pending', taskId: null })
    try {
      const refFileIds = keyframePromptPreviewRefFileIds
      await saveFrameReferences()
      if (epoch !== frameRequestEpoch.current) return
      keyframePromptDraft.replaceContext({ refFileIds })
      const submitted = await keyframePromptDraft.submitNow()
      if (epoch !== frameRequestEpoch.current) return
      const taskId = submitted?.taskId
      if (!taskId) {
        message.error('生成任务创建失败：缺少任务 ID')
        updateCardState(frameType, { loading: false, taskStatus: 'failed' })
        return
      }
      accepted = true
      setKeyframePromptActionLoading(false)
      setKeyframePromptPreviewOpen(false)
      window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId,title:`${frameLabel[frameType]}生成`}}))
      message.success('任务已在后台执行，可继续生成其他帧或切换页面')
      updateCardState(frameType, { taskId })
      setFrameImageTask({
        taskId,
        status: 'pending',
        progress: 0,
        cancelRequested: false,
      })
      setFrameImageSettledTask(null)

      let finalStatus = 'pending'
      let finalTaskState: RelationTaskState | null = null
      // Follow this submission until terminal; transient reads and slow generation are not failures.
      while (epoch === frameRequestEpoch.current) {
        await sleep(10_000)
        if (epoch !== frameRequestEpoch.current) return
        let statusRes
        try { statusRes = await FilmService.getTaskStatusApiV1FilmTasksTaskIdStatusGet({ taskId }) }
        catch { continue }
        if (epoch !== frameRequestEpoch.current) return
        const status = statusRes.data?.status
        if (!status) continue
        finalStatus = status
        if (statusRes.data) {
          finalTaskState = toRelationTaskStateFromStatusRead(statusRes.data)
          setFrameImageTask(current => current?.taskId === taskId ? finalTaskState : current)
        }
        updateCardState(frameType, { taskStatus: status })
        if (status === 'succeeded' || status === 'failed' || status === 'cancelled') break
      }
      if (
        finalTaskState &&
        (finalTaskState.status === 'succeeded' ||
          finalTaskState.status === 'failed' ||
          finalTaskState.status === 'cancelled')
      ) {
        setFrameImageTask(current => current?.taskId === taskId ? null : current)
        setFrameImageSettledTask(finalTaskState)
      }
      if (finalStatus === 'succeeded') {
        await onRefreshShotFrameImages?.()
        const latestSlotId = await getLatestFrameSlotId(frameType)
        await loadCardThumbs(frameType, latestSlotId, 5)
        // 迟到结果只刷新所属帧，不关闭用户后来打开的生成窗口。
      } else if (finalStatus !== 'failed' && finalStatus !== 'cancelled') {
        message.warning('生成任务仍在执行，请稍后刷新')
      }
    } catch {
      if (epoch === frameRequestEpoch.current) {
        message.error(`${frameLabel[frameType]}任务提交或结果刷新失败，请查看任务中心状态后重新进入；不要重复生成`)
      }
    } finally {
      if (epoch === frameRequestEpoch.current) {
        updateCardState(frameType, { loading: false })
        if (!accepted) setKeyframePromptActionLoading(false)
      }
    }
  }

  const applyCardImage = async (frameType: PromptFrameType, fileId: string) => {
    const slot = frameImages.find((x) => x.frame_type === frameType)
    if (!slot) return
    updateCardState(frameType, { applyingFileId: fileId })
    try {
      await StudioShotFrameImagesService.updateShotFrameImageApiV1StudioShotFrameImagesImageIdPatch({
        imageId: slot.id,
        requestBody: { file_id: fileId } as any,
      })
      await loadCardThumbs(frameType)
      await onRefreshShotFrameImages?.()
      message.success('已切换使用图片')
    } catch {
      message.error('切换失败')
    } finally {
      updateCardState(frameType, { applyingFileId: null })
    }
  }

  useEffect(() => {
    if (!selectedShot?.id) return
    void Promise.all([loadCardThumbs('first'), loadCardThumbs('key'), loadCardThumbs('last')])
      .catch(() => message.error('加载分镜帧图片失败，请重新进入；已生成的图片不会丢失'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShot?.id, frameImages.map((x) => `${x.id}:${x.file_id ?? ''}`).join('|')])

  const pendingDialogueCandidates = shotDialogueCandidateItems.filter((item) => item.candidate_status === 'pending')

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="cs-inspector-header flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-medium truncate">分镜生成面板</div>
          {selectedShot && <CreativeDirectionButton scope="shot" entityId={selectedShot.id} />}
          <div className="text-xs text-gray-500 truncate">
            {selectedShot ? `${String(selectedShot.index).padStart(2, '0')} · ${selectedShot.title}` : '未选择分镜'}
          </div>
        </div>
        <Space size="small">
          <Tooltip title="收起">
            <Button size="small" type="text" icon={<DoubleRightOutlined />} onClick={onClose} />
          </Tooltip>
        </Space>
      </div>

      <div className="cs-inspector flex-1 min-h-0">
        <Tabs
          className="cs-inspector-tabs"
          tabPosition="top"
          activeKey={inspectorTabKey}
          onChange={(activeKey) => { setInspectorTabKey(activeKey as InspectorTabKey); if (activeKey === 'gen_ref') void syncInspectorInputs().catch(() => message.error('最新设置同步失败，请重试保存')) }}
          items={(() => {
            const items = [
              {
              key: 'ops',
              label: '维护设置',
              children: (
                <ChapterStudioMaintenancePanel
                  opsTitleDraft={opsTitleDraft}
                  opsNoteDraft={opsNoteDraft}
                  hideShot={hideShot}
                  onChangeTitle={value => { opsEdits.current.title = value; setOpsTitleDraft(value) }}
                  onBlurTitle={() => {
                    void flushOpsTitle().catch(() => {})
                  }}
                  onChangeNote={value => { opsEdits.current.note = value; setOpsNoteDraft(value) }}
                  onBlurNote={() => {
                    void flushOpsNote().catch(() => {})
                  }}
                  onToggleHidden={setHideShot}
                  onRequestDelete={() => {
                    if (!selectedShot?.id) return
                    Modal.confirm({
                      title: '删除分镜？',
                      content: '此操作不可撤销。',
                      okText: '删除',
                      okButtonProps: { danger: true },
                      cancelText: '取消',
                      onOk: () => onDeleteShotOps(selectedShot.id),
                    })
                  }}
                />
              ),
            },
              {
              key: 'camera',
              label: '生成参数',
              children: (
                <div>
                  {loadingDetail ? (
                    <div className="text-gray-500">加载中…</div>
                  ) : shotDetail ? (
                    <>
                      <div className="cs-group">
                        <div className="cs-group-title">
                          <CameraOutlined /> 镜头语言
                        </div>
                        <div className="space-y-4">
                          <div>
                            <div className="text-gray-500 text-xs mb-1">景别</div>
                            <Radio.Group
                              value={shotDetail.camera_shot}
                              optionType="button"
                              buttonStyle="solid"
                              size="small"
                              options={CAMERA_SHOT_OPTIONS}
                              onChange={(e) => void onPatchShotDetailImmediate({ camera_shot: e.target.value })}
                              disabled={cameraUpdating}
                            />
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs mb-1">角度</div>
                            <Radio.Group
                              value={shotDetail.angle}
                              optionType="button"
                              size="small"
                              options={CAMERA_ANGLE_OPTIONS}
                              onChange={(e) => void onPatchShotDetailImmediate({ angle: e.target.value })}
                              disabled={cameraUpdating}
                            />
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs mb-1">运镜</div>
                            <Radio.Group
                              value={shotDetail.movement}
                              size="small"
                              options={CAMERA_MOVEMENT_OPTIONS}
                              onChange={(e) => void onPatchShotDetailImmediate({ movement: e.target.value })}
                              disabled={cameraUpdating}
                            />
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs mb-1">时长（1–30s，整数）</div>
                            <div className="flex items-center gap-2">
                              <Slider
                                min={1}
                                max={30}
                                step={1}
                                value={Math.max(1, Math.min(30, Math.round(shotDetail.duration ?? 1)))}
                                style={{ flex: 1 }}
                                onChange={(v) => void onPatchShotDetailImmediate({ duration: Math.round(Number(v)) })}
                                disabled={cameraUpdating}
                              />
                              <Input
                                size="small" aria-label="镜头视频时长"
                                value={`${Math.max(1, Math.min(30, Math.round(shotDetail.duration ?? 1)))}`}
                                style={{ width: 72 }}
                                onChange={(e) => {
                                  const raw = Number(e.target.value)
                                  if (!Number.isFinite(raw)) return
                                  const n = Math.max(1, Math.min(30, Math.round(raw)))
                                  void onPatchShotDetailImmediate({ duration: n })
                                }}
                                disabled={cameraUpdating}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs mb-1">视频比例</div>
                            <Select
                              size="small"
                              allowClear aria-label="镜头视频比例"
                              value={shotDetail.override_video_ratio ?? undefined}
                              placeholder={projectDefaultVideoRatio || capabilityDefaultVideoRatio || '请选择视频比例'}
                              options={videoRatioOptions}
                              onChange={(value) => {
                                onPatchShotDetail({ override_video_ratio: value ?? null })
                              }}
                              disabled={cameraUpdating}
                            />
                            <div className="mt-1 text-[11px] text-gray-400">
                              当前生效：{resolveVideoRatioForRequest() || '未设置'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="cs-group">
                        <div className="cs-group-title">
                          <TagOutlined /> 情绪标签
                        </div>
                        <ShotMoodTags key={shotDetail.id} value={shotDetail.mood_tags ?? []}
                          onSave={tags => onSaveMoodTags(shotDetail.id, tags)} />
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500">请选择分镜</div>
                  )}
                </div>
              ),
            },
              {
              key: 'prompt_image',
              label: '确认诊断',
              children: (
                <div>
                  <ChapterStudioReadinessDiagnosisPanel
                    selectedShot={selectedShot}
                    shotAssetsOverview={shotAssetsOverview}
                    promptAssetReadiness={promptAssetReadiness}
                    promptAssetReadinessNote={promptAssetReadinessNote}
                    shotExtractStatusSource={shotExtractStatus.source}
                    shotExtractStatusText={shotExtractStatusText}
                    onGoToShotEdit={goToShotEditForAssets}
                    onHandleMissingAction={(kind, name) => {
                      void handleReadinessMissingAction(kind, name)
                    }}
                    getReadinessExistenceLabel={getReadinessExistenceLabel}
                  />

                  <div className="cs-group">
                    <div className="cs-group-title">
                      <PictureOutlined /> 氛围描述
                    </div>
                    <div>
                        <div className="flex items-center justify-between">
                          <div className="text-gray-500 text-xs">氛围描述</div>
                          <Switch
                            size="small"
                            checked={shotDetail?.follow_atmosphere ?? false}
                            onChange={(v) => onPatchShotDetail({ follow_atmosphere: v })}
                          />
                        </div>
                        <TextArea
                          rows={3}
                          placeholder="氛围描述…（可选跟随画面）"
                          value={shotDetail?.atmosphere ?? ''}
                          onChange={(e) => onPatchShotDetail({ atmosphere: e.target.value })}
                        />
                    </div>
                  </div>

                </div>
              ),
            },
              {
              key: 'dialogue',
              label: '对白状态',
              children: (
                <div>
                  <div className="cs-group">
                    <div className="cs-group-title">
                      <SoundOutlined /> 对白状态
                    </div>
                    <div className="cs-hint">这里主要查看当前镜头对白与待确认状态。对白候选的主确认入口在分镜编辑页，工作室侧重继续准备关键帧、图片和视频生成。</div>
                    <div className="space-y-4 mt-3">
                      <div>
                        <Button icon={<EditOutlined />} onClick={goToShotEditForAssets}>
                          去分镜编辑确认对白
                        </Button>
                      </div>
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                        如需新增对白、接受候选或忽略候选，请前往分镜编辑页处理。工作室这里主要用于查看当前对白状态，并继续后续生成准备。
                      </div>

                      {pendingDialogueCandidates.length > 0 ? (
                        <div>
                          <div className="text-gray-500 text-xs mb-2">待确认对白候选</div>
                          <div className="space-y-2">
                            {pendingDialogueCandidates.map((candidate) => (
                              <div key={candidate.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs text-amber-700 mb-1">
                                      {candidate.speaker_name?.trim() || '未知'} → {candidate.target_name?.trim() || '未知'}
                                    </div>
                                    <div className="text-xs text-gray-700 break-words">{candidate.text}</div>
                                  </div>
                                  <Button size="small" icon={<EditOutlined />} onClick={goToShotEditForAssets}>
                                    去编辑页处理
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <div className="text-gray-500 text-xs mb-2">当前对白</div>
                        {dialogLines.length > 0 ? (
                          <div className="space-y-1">
                            {dialogLines.slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((l) => (
                              <div key={l.id} className="flex items-center gap-2">
                                <div className="text-xs text-gray-600 truncate flex-1 min-w-0">{l.text}</div>
                                <Button
                                  size="small"
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => {
                                    Modal.confirm({
                                      title: '删除该对白？',
                                      okText: '删除',
                                      cancelText: '取消',
                                      okButtonProps: { danger: true },
                                      onOk: async () => {
                                        try {
                                          await onDeleteDialogLine(l.id)
                                          message.success('已删除')
                                        } catch {
                                          message.error('删除失败')
                                        }
                                      },
                                    })
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">当前镜头还没有对白。</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ),
            },
              {
              key: 'keyframe_gen',
              label: '关键帧与参考图',
              children: (
                <div className="space-y-3">
                  <div className="cs-group">
                    <div className="cs-group-title">
                      <SettingOutlined /> 关键帧规格
                    </div>
                    <div className="text-xs text-gray-500">图片比例：{resolvedKeyframeRatio || '未设置比例'}；最终按本帧参考素材复核可用档位。</div>
                    <GenerationOptionsPanel category="image" ratio={resolvedKeyframeRatio}
                      references={shotDetail?.frame_reference_selections?.key?.length ?? shotLinkedAssets.length}
                      onChange={onImageChoice} />
                  </div>
                  {(['first', 'key', 'last'] as PromptFrameType[]).map((ft) => {
                    const st = keyframeCards[ft]
                    const slot = frameImages.find((x) => x.frame_type === ft)
                    const inUseFileId = slot?.file_id ? String(slot.file_id) : ''
                    const statusText =
                      st.taskStatus === 'pending'
                        ? '排队中'
                        : st.taskStatus === 'running'
                          ? '生成中'
                          : st.taskStatus === 'succeeded'
                            ? '已完成'
                            : st.taskStatus === 'failed'
                              ? '失败'
                              : st.taskStatus === 'cancelled'
                                ? '已取消'
                                : ''
                    return (
                      <div key={ft} className="cs-group">
                        <div className="cs-group-title flex items-center justify-between gap-2">
                          <span>{frameLabel[ft]}图片</span>
                          <Space size={8}>
                            <Button size="small" type="link" onClick={() => updateCardState(ft, { modalOpen: true })}>
                              选择使用版本
                            </Button>
                            <Button size="small" type="primary" loading={st.loading} onClick={() => void generateKeyframeCard(ft)}>
                              生成
                            </Button>
                          </Space>
                        </div>
                        <div className="text-xs text-gray-500 min-h-5">{statusText}</div>
                        {selectedShot&&<ManualMediaButton target={{target_type:'frame',entity_id:selectedShot.id,slot_id:slot?.id,frame_type:ft}} title={frameLabel[ft]+' · 修改图片'} onAdopted={async()=>{await onRefreshShotFrameImages?.();await loadCardThumbs(ft)}}/>}
                        {selectedShot&&slot&&<WebResultCandidates targetType="frame" entityId={selectedShot.id} slotId={slot.id} onAdopt={async()=>{await onRefreshShotFrameImages?.();await loadCardThumbs(ft)}}/>}
                        {st.thumbs.length === 0 ? (
                          <div className="mt-2 h-24 border border-dashed rounded flex items-center justify-center text-xs text-gray-400">暂无图片</div>
                        ) : (
                          <div className="mt-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                            {[...st.thumbs].sort((a, b) => Number(b.fileId === inUseFileId) - Number(a.fileId === inUseFileId)).slice(0, 4).map((it) => (
                              <button key={it.linkId} type="button" className="shrink-0 text-left" onClick={() => updateCardState(ft, { modalOpen: true })} title={it.fileId === inUseFileId ? '当前使用的图片' : '历史版本，点击选择使用'}>
                                <PreviewImage previewSrc={buildFileDownloadUrl(it.fileId)} src={it.thumbUrl} alt={`${frameLabel[ft]}${it.fileId === inUseFileId ? '当前使用' : '历史版本'}`} className={`w-16 h-16 rounded object-cover border-2 ${it.fileId === inUseFileId ? 'border-green-500' : 'border-gray-200'}`} />
                                <span className={`block text-xs ${it.fileId === inUseFileId ? 'text-green-700' : 'text-gray-500'}`}>{it.fileId === inUseFileId ? '使用中' : '历史版本'}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <Modal title={`${frameLabel[ft]}图片`} open={st.modalOpen} onCancel={() => updateCardState(ft, { modalOpen: false })} footer={null} width={720}>
                          {ft === 'first' ? (
                            <div className="mb-3">
                              <div className="text-sm text-gray-600 mb-2">关联角色</div>
                              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                <button
                                  type="button"
                                  className="w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-500 shrink-0 hover:border-gray-400 hover:text-gray-700"
                                  disabled={promptAssetsUpdating || linkRoleLoading}
                                  onClick={() => {
                                    setLinkRoleSelectedIds([])
                                    setLinkRoleOpen(true)
                                    void loadProjectRoleOptions()
                                  }}
                                  title="添加关联角色"
                                >
                                  <PlusOutlined />
                                </button>
                                {linkedCharacterIds.length === 0 ? (
                                  <div className="text-xs text-gray-400">暂无关联角色</div>
                                ) : (
                                  linkedCharacterIds.map((cid) => {
                                    const thumb = linkedAssetThumbByKey.get(`character:${cid}`)
                                    const name = characterNameMap[cid] ?? cid
                                    return thumb ? (
                                    <Image
                                        key={cid}
                                        width={48}
                                        height={48}
                                        style={{ objectFit: 'cover', borderRadius: 8 }}
                                        src={resolveAssetUrl(thumb)}
                                        preview={{ src: resolveAssetUrl(thumb) }}
                                      />
                                    ) : (
                                      <div
                                        key={cid}
                                        title={name}
                                        className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0"
                                      >
                                        <UserOutlined />
                                      </div>
                                    )
                                  })
                                )}
                              </div>

                              <div className="mt-3 text-sm text-gray-600 mb-2">关联场景</div>
                              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                <button
                                  type="button"
                                  className="w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-500 shrink-0 hover:border-gray-400 hover:text-gray-700"
                                  disabled={promptAssetsUpdating || linkSceneLoading}
                                  onClick={() => {
                                    setLinkSceneOpen(true)
                                    void loadProjectAssetOptions('scene')
                                  }}
                                  title="添加/更换关联场景"
                                >
                                  <PlusOutlined />
                                </button>
                                {linkedSceneId ? (
                                  linkedAssetThumbByKey.get(`scene:${linkedSceneId}`) ? (
                                    <Image
                                      key={linkedSceneId}
                                      width={48}
                                      height={48}
                                      style={{ objectFit: 'cover', borderRadius: 8 }}
                                      src={resolveAssetUrl(linkedAssetThumbByKey.get(`scene:${linkedSceneId}`) ?? '')}
                                      preview={{ src: resolveAssetUrl(linkedAssetThumbByKey.get(`scene:${linkedSceneId}`) ?? '') }}
                                    />
                                  ) : (
                                    <div className="text-xs text-gray-400">已关联场景：{sceneNameMap[linkedSceneId] ?? linkedSceneId}</div>
                                  )
                                ) : (
                                  <div className="text-xs text-gray-400">暂无关联场景</div>
                                )}
                              </div>

                              <div className="mt-3 text-sm text-gray-600 mb-2">关联道具</div>
                              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                <button
                                  type="button"
                                  className="w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-500 shrink-0 hover:border-gray-400 hover:text-gray-700"
                                  disabled={promptAssetsUpdating || linkPropLoading}
                                  onClick={() => {
                                    setLinkPropSelectedIds([])
                                    setLinkPropOpen(true)
                                    void loadProjectAssetOptions('prop')
                                  }}
                                  title="添加关联道具"
                                >
                                  <PlusOutlined />
                                </button>
                                {linkedPropIds.length === 0 ? (
                                  <div className="text-xs text-gray-400">暂无关联道具</div>
                                ) : (
                                  linkedPropIds.map((pid) =>
                                    linkedAssetThumbByKey.get(`prop:${pid}`) ? (
                                      <Image
                                        key={pid}
                                        width={48}
                                        height={48}
                                        style={{ objectFit: 'cover', borderRadius: 8 }}
                                        src={resolveAssetUrl(linkedAssetThumbByKey.get(`prop:${pid}`) ?? '')}
                                        preview={{ src: resolveAssetUrl(linkedAssetThumbByKey.get(`prop:${pid}`) ?? '') }}
                                      />
                                    ) : (
                                      <div key={pid} className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                                        <UserOutlined />
                                      </div>
                                    ),
                                  )
                                )}
                              </div>

                              <div className="mt-3 text-sm text-gray-600 mb-2">关联服装</div>
                              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                <button
                                  type="button"
                                  className="w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-500 shrink-0 hover:border-gray-400 hover:text-gray-700"
                                  disabled={promptAssetsUpdating || linkCostumeLoading}
                                  onClick={() => {
                                    setLinkCostumeSelectedIds([])
                                    setLinkCostumeOpen(true)
                                    void loadProjectAssetOptions('costume')
                                  }}
                                  title="添加关联服装"
                                >
                                  <PlusOutlined />
                                </button>
                                {linkedCostumeIds.length === 0 ? (
                                  <div className="text-xs text-gray-400">暂无关联服装</div>
                                ) : (
                                  linkedCostumeIds.map((cid) =>
                                    linkedAssetThumbByKey.get(`costume:${cid}`) ? (
                                      <Image
                                        key={cid}
                                        width={48}
                                        height={48}
                                        style={{ objectFit: 'cover', borderRadius: 8 }}
                                        src={resolveAssetUrl(linkedAssetThumbByKey.get(`costume:${cid}`) ?? '')}
                                        preview={{ src: resolveAssetUrl(linkedAssetThumbByKey.get(`costume:${cid}`) ?? '') }}
                                      />
                                    ) : (
                                      <div key={cid} className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                                        <UserOutlined />
                                      </div>
                                    ),
                                  )
                                )}
                              </div>
                            </div>
                          ) : null}

                          <Alert className="mb-3" type="info" showIcon message="每种帧只使用一张图片，历史版本不会自动全部作为参考。" description="点击“使用”切换当前生效版本；视频按参考模式读取生效帧。已提交任务保留提交时的参考图。" />
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {st.thumbs.map((it) => {
                              const inUse = inUseFileId && inUseFileId === it.fileId
                              return (
                                <div key={it.linkId} className="border rounded p-2">
                                  <PreviewImage previewSrc={buildFileDownloadUrl(it.fileId)} src={it.thumbUrl} alt="" className="w-full h-36 object-cover rounded" />
                                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                    <Button size="small" onClick={() => { updateCardState(ft, {modalOpen:false}); void generateKeyframeCard(ft, it.fileId) }}>检查此图片（可选）</Button>
                                    {inUse ? (
                                      <Tag color="green">使用中</Tag>
                                    ) : (
                                      <Button size="small" loading={st.applyingFileId === it.fileId} onClick={() => void applyCardImage(ft, it.fileId)}>
                                        使用
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <Modal
                            title="关联角色"
                            open={linkRoleOpen}
                            onCancel={() => setLinkRoleOpen(false)}
                            footer={null}
                            destroyOnClose
                            width={560}
                          >
                            <div className="space-y-2">
                              <div className="text-xs text-gray-500">来源：当前项目全部角色（选择后立即保存；已关联的角色不可重复选择）</div>
                              <Select
                                mode="multiple"
                                className="w-full"
                                placeholder="选择要关联到当前分镜的角色"
                                value={linkRoleSelectedIds}
                                loading={linkRoleLoading}
                                disabled={promptAssetsUpdating}
                                options={projectRoleOptions}
                                optionFilterProp="searchLabel"
                                showSearch
                                filterOption={(input: string, option?: any) =>
                                  String(option?.searchLabel ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                onChange={(vals: Array<string | number>) => {
                                  const nextNew = (vals ?? []).map((v) => String(v)).filter(Boolean)
                                  setLinkRoleSelectedIds(nextNew)
                                  const merged = Array.from(new Set([...linkedCharacterIds, ...nextNew]))
                                  void (async () => {
                                    await onUpdatePromptActors(merged)
                                    setLinkRoleOpen(false)
                                    setLinkRoleSelectedIds([])
                                  })()
                                }}
                              />
                            </div>
                          </Modal>

                          <Modal
                            title="关联场景"
                            open={linkSceneOpen}
                            onCancel={() => setLinkSceneOpen(false)}
                            footer={null}
                            destroyOnClose
                            width={560}
                          >
                            <div className="space-y-2">
                              <div className="text-xs text-gray-500">来源：当前项目场景（选择后立即保存）</div>
                              <Select
                                className="w-full"
                                placeholder="选择要关联到当前分镜的场景"
                                value={linkedSceneId ?? undefined}
                                loading={linkSceneLoading}
                                disabled={promptAssetsUpdating}
                                options={projectSceneOptions}
                                optionFilterProp="searchLabel"
                                showSearch
                                filterOption={(input: string, option?: any) =>
                                  String(option?.searchLabel ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                onChange={(v: string) => {
                                  void (async () => {
                                    await onUpdatePromptScene(v)
                                    setLinkSceneOpen(false)
                                  })()
                                }}
                              />
                            </div>
                          </Modal>

                          <Modal
                            title="关联道具"
                            open={linkPropOpen}
                            onCancel={() => setLinkPropOpen(false)}
                            footer={null}
                            destroyOnClose
                            width={560}
                          >
                            <div className="space-y-2">
                              <div className="text-xs text-gray-500">来源：当前项目道具（选择后立即保存；已关联的不可重复选择）</div>
                              <Select
                                mode="multiple"
                                className="w-full"
                                placeholder="选择要关联到当前分镜的道具"
                                value={linkPropSelectedIds}
                                loading={linkPropLoading}
                                disabled={promptAssetsUpdating}
                                options={projectPropOptions}
                                optionFilterProp="searchLabel"
                                showSearch
                                filterOption={(input: string, option?: any) =>
                                  String(option?.searchLabel ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                onChange={(vals: Array<string | number>) => {
                                  const nextNew = (vals ?? []).map((v) => String(v)).filter(Boolean)
                                  setLinkPropSelectedIds(nextNew)
                                  const merged = Array.from(new Set([...linkedPropIds, ...nextNew]))
                                  void (async () => {
                                    await onUpdatePromptProps(merged)
                                    setLinkPropOpen(false)
                                    setLinkPropSelectedIds([])
                                  })()
                                }}
                              />
                            </div>
                          </Modal>

                          <Modal
                            title="关联服装"
                            open={linkCostumeOpen}
                            onCancel={() => setLinkCostumeOpen(false)}
                            footer={null}
                            destroyOnClose
                            width={560}
                          >
                            <div className="space-y-2">
                              <div className="text-xs text-gray-500">来源：当前项目服装（选择后立即保存；已关联的不可重复选择）</div>
                              <Select
                                mode="multiple"
                                className="w-full"
                                placeholder="选择要关联到当前分镜的服装"
                                value={linkCostumeSelectedIds}
                                loading={linkCostumeLoading}
                                disabled={promptAssetsUpdating}
                                options={projectCostumeOptions}
                                optionFilterProp="searchLabel"
                                showSearch
                                filterOption={(input: string, option?: any) =>
                                  String(option?.searchLabel ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                onChange={(vals: Array<string | number>) => {
                                  const nextNew = (vals ?? []).map((v) => String(v)).filter(Boolean)
                                  setLinkCostumeSelectedIds(nextNew)
                                  const merged = Array.from(new Set([...linkedCostumeIds, ...nextNew]))
                                  void (async () => {
                                    await onUpdatePromptCostumes(merged)
                                    setLinkCostumeOpen(false)
                                    setLinkCostumeSelectedIds([])
                                  })()
                                }}
                              />
                            </div>
                          </Modal>
                        </Modal>
                      </div>
                    )
                  })}
                </div>
              ),
            },
              ...(showAvTab ? [{
                key: 'av',
                label: '音视频控制',
                children: (
                  <ShotAudioTracksPanel shotId={selectedShot?.id ?? null} />
                ),
              }] : []),
              {
              key: 'gen_ref',
              label: '视频生成',
              children: (
                <div>
                  {selectedShot&&<ManualMediaButton target={{target_type:'shot',entity_id:selectedShot.id}} title="修改当前视频" onAdopted={async()=>{await props.onVideoAdopted?.()}}/>}
                  {selectedShot&&<WebResultCandidates targetType="shot" entityId={selectedShot.id} onAdopt={props.onVideoAdopted}/>}
                  {generationChannel==='api'&&<div className="cs-group"><div className="cs-group-title">本次 API 视频模型</div>
                    <Select className="w-full" allowClear aria-label="本次视频模型" placeholder="未配置默认视频模型，请选择" value={videoModelId}
                      options={videoModelId && !videoModels.some(item => item.value === videoModelId) && videoChoice?.spec?.model_id === videoModelId ? [...videoModels, { value: videoModelId, label: `${videoChoice.spec.provider} · ${videoChoice.spec.model_name}` }] : videoModels} onChange={setVideoModelId} />
                    <div className="mt-2 text-xs text-slate-500">{props.usingDefaultVideoModel ? '当前使用默认视频模型。' : '本次已手动指定模型，清空选择可恢复默认。'}切换后请核对参考策略、时长和分辨率。</div></div>}
                  {props.detailSaveError && <Alert type="error" message={props.detailSaveError} action={<Button onClick={() => void props.onSyncGenerationInputs().catch(() => {})}>重试保存</Button>} />}
                  {(props.detailSaving || props.generationSyncing) && <div role="status">正在同步最新镜头设置…</div>}
                  {generationChannel==='api'?<ChapterStudioVideoReadinessPanel
                    selectedShot={selectedShot}
                    videoReadinessLoading={props.detailSaving || props.generationSyncing || videoReadinessLoading || Boolean(videoReadiness && (videoReadiness.reference_mode !== videoReferenceMode || videoReadiness.shot_id !== selectedShot?.id))}
                    videoReadiness={videoReadiness}
                    videoReferenceMode={videoReferenceMode}
                    onGoToPreparation={goToShotEditForAssets}
                    onGoToParameters={() => setInspectorTabKey('camera')}
                    onGoToFrames={() => setInspectorTabKey('keyframe_gen')}
                  />:<Alert className="my-3" type="info" message="平台网页生成" description="下一步选择官网平台、实际模型和账号。这里准备材料，官网支持的参考方式、时长、画幅与权益需按该模型核对，不使用 API 准备度结论。"/>}

                  <div className="cs-group">
                    <div className="cs-group-title">
                      <LinkOutlined /> 参考策略
                    </div>
                    <Select
                      allowClear
                      placeholder="选择当前模型支持的参考方式"
                      className="w-full"
                      value={videoReferenceMode}
                      onChange={(v) => setRefImageType(v === undefined || v === null ? undefined : String(v))}
                      options={generationChannel==='web'?[{value:'text_only',label:'纯文本'},{value:'first',label:'首帧'},{value:'last',label:'尾帧参考'},{value:'key',label:'关键帧参考'},{value:'first_last',label:'首尾帧'},{value:'subjects',label:'主体分组（官网能力需核对）'}]:refFrameTypeOptions}
                      loading={refFrameTypeSelectLoading}
                      onDropdownVisibleChange={handleRefFrameTypeDropdownVisibleChange}
                    />
                  </div>

                  {videoReferenceMode === 'subjects' && (generationChannel==='web'||videoCapability?.studio_subject_images_verified) && <VideoSubjectReferences
                    shotId={selectedShot?.id} value={videoSubjects} limit={generationChannel==='web'?50:videoCapability?.max_total_subject_images || 0} groupLimit={generationChannel==='web'?5:videoCapability?.max_subjects || 0} perGroupLimit={generationChannel==='web'?10:videoCapability?.max_images_per_subject || 1} onChange={changeVideoSubjects} />}
                  {generationChannel==='api'&&!videoCapability?.studio_subject_images_verified && <Alert className="my-3" type="info" showIcon message="当前型号走画面帧参考路径"
                    description="首帧/首尾帧控制画面起止。角色、场景素材可先用于生成该帧；直接多图参考需要另行配置已支持的参考生视频型号，系统不会自动切换。" />}
                  {generationChannel==='api'&&videoCapability && <div className="my-3 text-xs text-slate-600">当前模型时长：{videoCapability.allowed_seconds?.length ? videoCapability.allowed_seconds.join(' / ') : `${videoCapability.min_seconds || '?'}–${videoCapability.max_seconds || '?'}`} 秒；本镜头 {shotDetail?.duration || '未配置'} 秒。动作过多时优先拆分镜头，避免为适应模型而压缩叙事。支持比例：{(videoCapability.allowed_ratios || []).join('、')}。</div>}
                  {generationChannel==='api'&&<GenerationOptionsPanel category="video" modelId={videoModelId} ratio={resolveVideoRatioForRequest()}
                    quantity={shotDetail?.duration ?? null} onChange={onVideoChoice} />}

                  <div className="cs-group">
                    <div className="cs-group-title">
                      <ThunderboltOutlined /> 生成
                    </div>
                    <Space wrap>
                      <Button type="primary" icon={<VideoCameraOutlined />} loading={props.generationSyncing || videoPromptPreviewSubmitting || videoTaskPolling} disabled={!!props.detailSaveError} onClick={() => void openVideoPromptPreview()}>
                        生成视频
                      </Button>
                      {videoTaskStatus ? <span className="text-xs text-gray-500">任务状态：{videoTaskStatus}</span> : null}
                    </Space>
                  </div>

                  <div className="cs-group">
                    <div className="cs-group-title">
                      <VideoCameraOutlined /> 视频候选与成片版本
                    </div>
                    <p className="text-xs text-slate-500 mb-2">点击缩略图仅切换预览；成片使用下方标记的当前版本。生成任务可能自动更新当前版本，导出前请核对。已生成不等于质量已验收。</p>
                    {generatedVideos.length === 0 ? (
                      <div className="text-xs text-gray-400">当前分镜暂无已生成视频</div>
                    ) : (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {generatedVideos.map((item, idx) => (
                          <div key={`${item.linkId}-${item.fileId}`} className="border rounded p-2">
                            <video
                              src={item.url}
                              className="w-full h-20 rounded object-cover bg-black"
                              preload="metadata"
                              muted
                              onClick={() => onSelectPreviewVideo(item.fileId)}
                              style={{ cursor: 'pointer' }}
                            />
                            {selectedShot?.generated_video_file_id === item.fileId ? <Tag color="blue">当前用于成片</Tag> : <Button size="small" className="mt-2" onClick={() => Modal.confirm({
                              title:'采用此视频用于成片？', content:'请先播放比较。其他候选仍保留，已导出的成片不被修改；再次导出会使用本版本。',
                              onOk: async () => {
                                if (!selectedShot) return
                                await StudioShotsService.adoptShotVideoApiApiV1StudioShotsShotIdVideoAdoptionPost({shotId:selectedShot.id,
                                  requestBody:{file_id:item.fileId,expected_current_file_id:selectedShot.generated_video_file_id || null}})
                                await props.onVideoAdopted(); onSelectPreviewVideo(item.fileId); message.success('已采用，后续成片使用此版本')
                              }
                            })}>采用此版本</Button>}
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-500">视频 {idx + 1}</span>
                              <Tooltip title="下载视频">
                                <Button
                                  size="small"
                                  icon={<DownloadOutlined />}
                                  onClick={() => {
                                    if (!item.url) return
                                    window.open(item.url, '_blank', 'noopener,noreferrer')
                                  }}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {showGenRefVersions && (
                    <div className="cs-group">
                      <div className="cs-group-title">
                        <AppstoreOutlined /> 版本
                      </div>
                      <Tabs
                        type="card"
                        size="small"
                        activeKey={imageVersion}
                        onChange={setImageVersion}
                        items={[
                          { key: 'v1', label: 'v1' },
                          { key: 'v2', label: 'v2' },
                          { key: 'v3', label: 'v3' },
                        ]}
                      />
                    </div>
                  )}
                </div>
              ),
              },
            ]

            const order: Record<string, number> = {
              gen_ref: 0,
              keyframe_gen: 1,
              camera: 2,
              prompt_image: 3,
              dialogue: 4,
              ops: 5,
              av: 6,
            }

            return items.sort((a, b) => (order[String(a.key)] ?? 999) - (order[String(b.key)] ?? 999))
          })()}
        />

        <Modal
          title={`${frameLabel[keyframePromptPreviewFrameType]}图片生成提示词预览`}
          open={keyframePromptPreviewOpen}
          onCancel={() => {
            keyframePromptDraft.resetDerived()
            setBasePromptComposing(false)
            setKeyframePromptPreviewOpen(false)
          }}
          footer={(
            <div className="flex items-center justify-between">
              <div />
              <Space>
                <Button
                  loading={keyframePromptActionLoading}
                  onClick={() => {
                            setKeyframePromptPreviewOpen(false)
                  }}
                >
                  取消
                </Button>
                <GenerationChannelActions apiAction={<Button type="primary" loading={keyframePromptActionLoading} onClick={() => void confirmGenerateKeyframeWithPrompt()}>生成</Button>} webAction={<WebImageButton
                  key={`${selectedShot?.id}:${keyframePromptPreviewFrameType}`}
                  disabled={!selectedShot?.id || !keyframePromptRenderedDraft.trim()}
                  prepare={async () => {
                    // Capture the original shot/frame before awaits; never retarget on navigation.
                    const shotId = selectedShot!.id
                    const frameType = keyframePromptPreviewFrameType
                    const prompt = keyframePromptRenderedDraft
                    const references = [...keyframePromptPreviewRefFileIds]
                    let slotId = await getLatestFrameSlotId(frameType)
                    if (!slotId) {
                      const created = await StudioShotFrameImagesService.createShotFrameImageApiV1StudioShotFrameImagesPost({requestBody:{shot_detail_id:shotId,frame_type:frameType}})
                      slotId = created.data?.id ?? null
                    }
                    if (!slotId) throw new Error('Missing frame slot')
                    const target = await StudioWebGenerationService.targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({targetType:'frame',entityId:shotId,slotId})
                    return {target_type:'frame',entity_id:shotId,slot_id:slotId,expected_version:target.version,prompt,reference_file_ids:references}
                  }}
                  onAccepted={() => setKeyframePromptPreviewOpen(false)}
                />}/>
              </Space>
            </div>
          )}
          destroyOnClose
          width="min(1180px, calc(100vw - 32px))"
          style={{ top: 24 }}
          styles={{ body: { maxHeight: 'calc(100dvh - 230px)', overflowY: 'auto', overflowX: 'hidden' } }}
        >
          <BackgroundTaskNotice active={keyframePromptActionLoading} />
          <Alert type="info" showIcon message="参考图与参数 → 提示词 → 生成 → 查看并采用图片" description="AI检查与优化为可选辅助，不要求先预检；应用优化后，以最终发送预览中的完整文本生成。" />
          <GenerationOptionsPanel category="image" ratio={resolvedKeyframeRatio} references={keyframePromptDraft.context.refFileIds.length} onChange={onImageChoice} />
          {selectedShot && <FrameQualityWorkflow key={`${selectedShot.id}:${keyframePromptDraft.base.frameType}`}
            shotId={selectedShot.id} scope={keyframePromptDraft.base.frameType} basePrompt={rawFramePrompt}
            context={frameReviewContext} ready={!!rawFramePrompt && keyframePromptDraft.state === 'derived' && !!imageChoice}
            application={frameApplication} initialOutput={frameReviewOutputId} outputs={keyframeCards[keyframePromptDraft.base.frameType].thumbs}
            onApplication={onFrameApplication} onRefresh={() => void loadCardThumbs(keyframePromptDraft.base.frameType)} />}
          {(() => {
            const hasBasePrompt = keyframePromptPreviewDraft.trim().length > 0
            const renderStatusMeta = getKeyframeRenderStatusMeta(keyframePromptRenderState)
            const debugVisualStyle = readDebugContextText(keyframePromptDebugContext, 'visual_style')
            const debugStyle = readDebugContextText(keyframePromptDebugContext, 'style')
            const debugCharacterContext = readDebugContextText(keyframePromptDebugContext, 'character_context')
            const debugSceneContext = readDebugContextText(keyframePromptDebugContext, 'scene_context')
            const debugPropContext = readDebugContextText(keyframePromptDebugContext, 'prop_context')
            const debugCostumeContext = readDebugContextText(keyframePromptDebugContext, 'costume_context')
            const debugShotDescription = readDebugContextText(keyframePromptDebugContext, 'shot_description')
            const debugDialogSummary = readDebugContextText(keyframePromptDebugContext, 'dialog_summary')
            const debugPreviousShotTitle = readDebugContextText(keyframePromptDebugContext, 'previous_shot_title')
            const debugPreviousShotScriptExcerpt = readDebugContextText(keyframePromptDebugContext, 'previous_shot_script_excerpt')
            const debugPreviousShotEndState = readDebugContextText(keyframePromptDebugContext, 'previous_shot_end_state')
            const debugNextShotTitle = readDebugContextText(keyframePromptDebugContext, 'next_shot_title')
            const debugNextShotScriptExcerpt = readDebugContextText(keyframePromptDebugContext, 'next_shot_script_excerpt')
            const debugNextShotStartGoal = readDebugContextText(keyframePromptDebugContext, 'next_shot_start_goal')
            const debugContinuityGuidance = readDebugContextText(keyframePromptDebugContext, 'continuity_guidance')
            const debugCompositionAnchor = readDebugContextText(keyframePromptDebugContext, 'composition_anchor')
            const debugScreenDirectionGuidance = readDebugContextText(keyframePromptDebugContext, 'screen_direction_guidance')
            const debugFrameSpecificGuidance = readDebugContextText(keyframePromptDebugContext, 'frame_specific_guidance')
            const debugDirectorCommandSummary = readDebugContextText(keyframePromptDebugContext, 'director_command_summary')
            const debugActionBeatPhases = readDebugContextText(keyframePromptDebugContext, 'action_beat_phases')
            const debugSelectedActionBeatPhase = readDebugContextText(keyframePromptDebugContext, 'selected_action_beat_phase')
            const debugSelectedActionBeatText = readDebugContextText(keyframePromptDebugContext, 'selected_action_beat_text')
            const actionBeatPhaseTags = buildActionBeatPhaseTags(debugActionBeatPhases)
            const parsedDirectorCommandSummary = parseDirectorCommandSummary(debugDirectorCommandSummary)
            const keyframeGuidanceSummary = buildKeyframeGuidanceSummary([
              debugDirectorCommandSummary,
              debugFrameSpecificGuidance,
              debugContinuityGuidance,
              debugCompositionAnchor,
              debugScreenDirectionGuidance,
            ])
            const guidanceLevelSummary = buildGuidanceLevelSummary(parsedDirectorCommandSummary, keyframeGuidanceSummary)
            const debugUnifyStyle =
              typeof keyframePromptDebugContext?.unify_style === 'boolean'
                ? (keyframePromptDebugContext.unify_style ? '是' : '否')
                : readDebugContextText(keyframePromptDebugContext, 'unify_style')
            const hasPromptDebugContext = Boolean(
              debugVisualStyle ||
                debugStyle ||
                debugCharacterContext ||
                debugSceneContext ||
                debugPropContext ||
                debugCostumeContext ||
                debugShotDescription ||
                debugDialogSummary ||
                debugPreviousShotTitle ||
                debugPreviousShotScriptExcerpt ||
                debugPreviousShotEndState ||
                debugNextShotTitle ||
                debugNextShotScriptExcerpt ||
                debugNextShotStartGoal ||
                debugContinuityGuidance ||
                debugCompositionAnchor ||
                debugScreenDirectionGuidance ||
                debugFrameSpecificGuidance ||
                debugDirectorCommandSummary ||
                debugActionBeatPhases ||
                debugSelectedActionBeatText ||
                debugUnifyStyle,
            )
            const hasPromptQualityChecks = keyframePromptQualityChecks !== null
            return keyframePromptPreviewLoading ? (
              <div className="py-8 text-center">
                <Spin />
              </div>
            ) : (
              <div className="space-y-4">
                <FrameReferenceSelector shotId={selectedShot?.id}
                  selected={keyframePromptPreviewRefFileIds}
                  candidates={autoKeyframeRefFileIds}
                  names={shotLinkedAssetNameByFileId}
                  disabled={keyframePromptActionLoading || shotRenderPromptLoading || savingFrameReferences}
                  saving={savingFrameReferences}
                  onChange={refFileIds => keyframePromptDraft.setContext({ refFileIds })}
                  onRestore={() => keyframePromptDraft.setContext({ refFileIds: autoKeyframeRefFileIds })}
                  onAdd={() => setFrameReferencePickerOpen(true)}
                  onSave={() => void saveFrameReferences().then(() => message.success('已保存本帧参考')).catch(() => message.error('参考图保存失败，请重试'))}
                />
                <MediaFilePicker kind={frameReferencePickerOpen ? 'image' : undefined}
                  selectedIds={keyframePromptPreviewRefFileIds} disabled={savingFrameReferences}
                  onClose={() => setFrameReferencePickerOpen(false)}
                  onSelect={file => {
                    setShotLinkedAssets(previous => previous.some(item => item.id === file.id) ? previous : [
                      ...previous, { type: 'file', id: file.id, name: file.name, thumbnail: buildFileDownloadUrl(file.id) },
                    ])
                    keyframePromptDraft.setContext({ refFileIds: [...new Set([...keyframePromptPreviewRefFileIds, file.id])] })
                    setFrameReferencePickerOpen(false)
                  }}
                />

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">基础提示词</div>
                    <div className="mt-1 text-xs text-slate-500">
                      首次为空时依据已有剧本、分镜和关联资产免费整理，可自行修改；已有保存内容优先保留。
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      AI生成会继承当前项目风格，并优先参考已确认的角色、场景、道具和服装设定。
                    </div>
                  </div>
                  <Space size="small">
                    <Button size="small" disabled={!hasBasePrompt} loading={keyframePromptActionLoading} onClick={() => void saveFrameBasePrompt()}>保存本帧提示词</Button>
                    <Tag color={hasBasePrompt ? 'blue' : 'default'}>{hasBasePrompt ? '可编辑' : '未生成'}</Tag>
                    <Button
                      size="small"
                      type={hasBasePrompt ? 'default' : 'primary'}
                      loading={keyframePromptActionLoading}
                      onClick={() => void regenerateKeyframePrompt()}
                    >
                      按规则渲染
                    </Button>
                  </Space>
                </div>
                {!hasBasePrompt ? (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    初始草稿未能读取，请重开页面重试，或手动填写画面描述后按规则渲染。
                  </div>
                  ) : null}
                  {hasPromptQualityChecks ? (
                    <div
                      className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
                        keyframePromptQualityChecks?.passed
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Tag color={keyframePromptQualityChecks?.passed ? 'green' : 'gold'}>
                          {keyframePromptQualityChecks?.passed ? '质量校验通过' : '已触发自动修正'}
                        </Tag>
                        <span>
                          {keyframePromptQualityChecks?.passed
                            ? '本次 AI 生成已通过基础质量校验。'
                            : '本次 AI 生成触发过自动修正，系统已尽量清理不符合基础提示词要求的内容。'}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <Input.TextArea
                    rows={6}
                    value={keyframePromptPreviewDraft}
                    onCompositionStart={() => setBasePromptComposing(true)}
                    onCompositionEnd={() => setBasePromptComposing(false)}
                    onChange={(e) => {
                      keyframePromptDraft.setBase((prev) => ({ ...prev, prompt: e.target.value }))
                      if (!e.target.value.trim()) {
                        keyframePromptDraft.resetDerived()
                      }
                    }}
                    placeholder="请输入基础提示词，例如人物动作、场景氛围、镜头视角等…"
                    disabled={keyframePromptActionLoading}
                  />
                  {keyframeGuidanceSummary.length > 0 || debugDirectorCommandSummary ? (
                    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-xs text-sky-800">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">基础提示词生成依据</div>
                          <div className="mt-1 text-sky-700">
                            这些导演约束主要用于生成上游基础提示词，默认先看摘要；只有少量高优先级规则会再进入最终图片提示词。
                          </div>
                        </div>
                        <Button size="small" type="text" onClick={() => setKeyframeDirectiveCollapsed((prev) => !prev)}>
                          {keyframeDirectiveCollapsed ? '展开细节' : '收起细节'}
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Tag color="red">{`必须 ${guidanceLevelSummary.must}`}</Tag>
                        <Tag color="blue">{`优先 ${guidanceLevelSummary.prefer}`}</Tag>
                        <Tag>{`普通 ${guidanceLevelSummary.normal}`}</Tag>
                        {actionBeatPhaseTags.length > 0 ? (
                          <Tag color="purple">{`动作阶段 ${actionBeatPhaseTags.length}`}</Tag>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(keyframeDirectiveCollapsed
                          ? (
                            parsedDirectorCommandSummary.length > 0
                              ? parsedDirectorCommandSummary
                                  .slice(0, 2)
                                  .map((item) => `${item.level === 'must' ? '必须' : '优先'} · ${item.text}`)
                              : keyframeGuidanceSummary.slice(0, 2)
                          )
                          : keyframeGuidanceSummary
                        ).map((item) => (
                          <Tooltip key={item} title={item}>
                            <Tag color="blue" className="max-w-[240px] overflow-hidden">
                              <span className="inline-block max-w-[200px] truncate align-bottom">{item}</span>
                            </Tag>
                          </Tooltip>
                        ))}
                      </div>
                      {actionBeatPhaseTags.length > 0 ? (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-slate-800">当前帧消费的动作阶段</div>
                            {debugSelectedActionBeatPhase && debugSelectedActionBeatText ? (
                              <Tag color="purple">
                                {`${debugSelectedActionBeatPhase} · ${debugSelectedActionBeatText}`}
                              </Tag>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {actionBeatPhaseTags.map((item, index) => (
                              <Tooltip key={`${item.phaseLabel}:${index}:${item.text}`} title={`${item.phaseLabel} · ${item.text}`}>
                                <Tag
                                  color={
                                    item.phaseLabel === '触发'
                                      ? 'gold'
                                      : item.phaseLabel === '峰值'
                                        ? 'blue'
                                        : 'green'
                                  }
                                  className="max-w-[240px] overflow-hidden"
                                >
                                  <span className="inline-block max-w-[200px] truncate align-bottom">
                                    {item.phaseLabel} · {item.text}
                                  </span>
                                </Tag>
                              </Tooltip>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {!keyframeDirectiveCollapsed ? (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {debugDirectorCommandSummary ? (
                            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3 text-xs text-indigo-800">
                              <div className="font-medium">高优先级导演指令</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {parsedDirectorCommandSummary.map((item, index) => (
                                  <Tooltip key={`${item.level}:${index}:${item.text}`} title={`${item.level === 'must' ? '必须' : '优先'} · ${item.text}`}>
                                    <Tag
                                      color={item.level === 'must' ? 'red' : 'blue'}
                                      className="max-w-[240px] overflow-hidden"
                                    >
                                      <span className="inline-block max-w-[200px] truncate align-bottom">
                                        {item.level === 'must' ? '必须' : '优先'} · {item.text}
                                      </span>
                                    </Tag>
                                  </Tooltip>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {keyframeGuidanceSummary.length > 0 ? (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-800">
                              <div className="font-medium">补充 Guidance</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {keyframeGuidanceSummary.map((item) => (
                                  <Tooltip key={item} title={item}>
                                    <Tag color="blue" className="max-w-[220px] overflow-hidden">
                                      <span className="inline-block max-w-[180px] truncate align-bottom">{item}</span>
                                    </Tag>
                                  </Tooltip>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {hasPromptDebugContext ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-700">最近一次 AI 生成上下文</div>
                        <Space size="small">
                          <Tag color="default">调试信息</Tag>
                          <Button
                            size="small"
                            type="text"
                            onClick={() => setKeyframePromptDebugCollapsed((prev) => !prev)}
                          >
                            {keyframePromptDebugCollapsed ? '展开细节' : '收起细节'}
                          </Button>
                        </Space>
                      </div>
                      {keyframePromptDebugCollapsed ? (
                        <div className="mt-2 text-slate-500">
                          调试信息默认收起，展开后可查看最近一次 AI 生成使用的项目风格、镜头描述、连续性约束与实体上下文。
                        </div>
                      ) : (
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="text-slate-500">项目风格</div>
                            <div className="mt-1 text-slate-700">
                              {[debugVisualStyle, debugStyle].filter(Boolean).join(' / ') || '无'}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">统一风格</div>
                            <div className="mt-1 text-slate-700">{debugUnifyStyle || '无'}</div>
                          </div>
                          {debugShotDescription ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">镜头补充描述</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugShotDescription}</div>
                            </div>
                          ) : null}
                          {debugDialogSummary ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">对白摘要</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugDialogSummary}</div>
                            </div>
                          ) : null}
                          {debugActionBeatPhases ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">动作拍点阶段</div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {actionBeatPhaseTags.map((item, index) => (
                                  <Tag
                                    key={`debug-action-phase:${index}:${item.text}`}
                                    color={
                                      item.phaseLabel === '触发'
                                        ? 'gold'
                                        : item.phaseLabel === '峰值'
                                          ? 'blue'
                                          : 'green'
                                    }
                                  >
                                    {`${item.phaseLabel} · ${item.text}`}
                                  </Tag>
                                ))}
                              </div>
                              {debugSelectedActionBeatPhase || debugSelectedActionBeatText ? (
                                <div className="mt-2 text-slate-700">
                                  {`当前帧优先消费：${[debugSelectedActionBeatPhase, debugSelectedActionBeatText].filter(Boolean).join(' · ')}`}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {debugPreviousShotTitle || debugPreviousShotScriptExcerpt || debugPreviousShotEndState ? (
                            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-3">
                              <div className="text-slate-500">上一镜头承接</div>
                              <div className="mt-1 space-y-1 text-slate-700">
                                {debugPreviousShotTitle ? <div>标题：{debugPreviousShotTitle}</div> : null}
                                {debugPreviousShotScriptExcerpt ? (
                                  <div className="whitespace-pre-wrap">摘录：{debugPreviousShotScriptExcerpt}</div>
                                ) : null}
                                {debugPreviousShotEndState ? (
                                  <div className="whitespace-pre-wrap">结尾状态：{debugPreviousShotEndState}</div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          {debugNextShotTitle || debugNextShotScriptExcerpt || debugNextShotStartGoal ? (
                            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-3">
                              <div className="text-slate-500">下一镜头衔接</div>
                              <div className="mt-1 space-y-1 text-slate-700">
                                {debugNextShotTitle ? <div>标题：{debugNextShotTitle}</div> : null}
                                {debugNextShotScriptExcerpt ? (
                                  <div className="whitespace-pre-wrap">摘录：{debugNextShotScriptExcerpt}</div>
                                ) : null}
                                {debugNextShotStartGoal ? (
                                  <div className="whitespace-pre-wrap">起始目标：{debugNextShotStartGoal}</div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          {debugContinuityGuidance ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">连续性建议</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugContinuityGuidance}</div>
                            </div>
                          ) : null}
                          {debugCompositionAnchor ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">构图与空间锚点</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugCompositionAnchor}</div>
                            </div>
                          ) : null}
                          {debugScreenDirectionGuidance ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">朝向与视线建议</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugScreenDirectionGuidance}</div>
                            </div>
                          ) : null}
                          {debugFrameSpecificGuidance ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">当前帧专项建议</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugFrameSpecificGuidance}</div>
                            </div>
                          ) : null}
                          {debugCharacterContext ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">角色上下文</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugCharacterContext}</div>
                            </div>
                          ) : null}
                          {debugSceneContext ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">场景上下文</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugSceneContext}</div>
                            </div>
                          ) : null}
                          {debugPropContext ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">道具上下文</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugPropContext}</div>
                            </div>
                          ) : null}
                          {debugCostumeContext ? (
                            <div className="md:col-span-2">
                              <div className="text-slate-500">服装上下文</div>
                              <div className="mt-1 whitespace-pre-wrap text-slate-700">{debugCostumeContext}</div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-900">最终生成提示词</div>
                      <div className="mt-1 text-xs text-slate-500">
                        系统会根据当前基础提示词和参考图顺序自动生成这一版内容，提交给模型时将使用这里的结果。
                      </div>
                    </div>
                    <Space size="small">
                      <Tag color="geekblue">系统生成</Tag>
                      <Tag>只读</Tag>
                      <Button
                        size="small"
                        onClick={() =>
                          void renderShotPromptToTextarea({
                            frameType: keyframePromptPreviewFrameType,
                            prompt: keyframePromptPreviewDraft,
                            refFileIds:
                              keyframePromptPreviewRefFileIds,
                          })
                        }
                        disabled={!hasBasePrompt}
                        loading={shotRenderPromptLoading}
                      >
                        重新同步
                      </Button>
                      <Button
                        size="small"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(keyframePromptRenderedDraft || '')
                            message.success('最终提示词已复制')
                          } catch {
                            message.error('复制失败')
                          }
                        }}
                        disabled={!keyframePromptRenderedDraft.trim()}
                      >
                        复制
                      </Button>
                    </Space>
                  </div>
                  <div
                    className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
                      renderStatusMeta.color === 'green'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : renderStatusMeta.color === 'blue'
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : renderStatusMeta.color === 'red'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : renderStatusMeta.color === 'gold'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Tag color={renderStatusMeta.color}>{renderStatusMeta.label}</Tag>
                      <span>{renderStatusMeta.description}</span>
                    </div>
                  </div>
                  {keyframePromptRenderMappings.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {keyframePromptRenderMappings.map((mapping) => (
                        <Tag key={`${mapping.token}:${mapping.file_id}`}>{`${mapping.token} = ${mapping.name}`}</Tag>
                      ))}
                    </div>
                  ) : null}
                  {keyframePromptSelectedGuidance.length > 0 || keyframePromptDroppedGuidance.length > 0 ? (
                    <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">最终图片提示词收敛结果</div>
                          <div className="mt-1 text-slate-500">
                            系统会从上游导演约束里挑出最关键的少量规则，补进最终图片提示词。
                          </div>
                        </div>
                        <Space size="small" wrap>
                          <Tag color="green">{`保留 ${keyframePromptSelectedGuidance.length}`}</Tag>
                          <Tag color="gold">{`压缩 ${keyframePromptDroppedGuidance.length}`}</Tag>
                          {(keyframePromptSelectedGuidance.length > 2 || keyframePromptDroppedGuidance.length > 0) ? (
                            <Button
                              size="small"
                              type="text"
                              onClick={() => setKeyframePromptDecisionCollapsed((prev) => !prev)}
                            >
                              {keyframePromptDecisionCollapsed ? '查看取舍' : '收起取舍'}
                            </Button>
                          ) : null}
                        </Space>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
                          <div className="font-medium">实际保留的 Guidance</div>
                          {keyframePromptSelectedGuidance.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {keyframePromptVisibleSelectedGuidanceDetails.map((item) => (
                                <Tooltip
                                  key={`selected:${item.text}`}
                                  title={(
                                    <div className="max-w-[320px] text-xs leading-5">
                                      {item.reasonTag ? (
                                        <Tag color="green" className="mb-1">
                                          {item.reasonTag}
                                        </Tag>
                                      ) : null}
                                      <div>{item.text}</div>
                                      {item.reason ? <div className="mt-1 text-slate-500">{item.reason}</div> : null}
                                    </div>
                                  )}
                                >
                                  <Tag color="green" className="max-w-[240px] overflow-hidden">
                                    <span className="inline-block max-w-[200px] truncate align-bottom">{item.text}</span>
                                  </Tag>
                                </Tooltip>
                              ))}
                              {keyframePromptDecisionCollapsed && keyframePromptSelectedGuidanceDetails.length > 2 ? (
                                <Tag>{`+${keyframePromptSelectedGuidanceDetails.length - 2} 条`}</Tag>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-2 text-emerald-700">当前没有额外 guidance 被保留。</div>
                          )}
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                          <div className="font-medium">已压缩的 Guidance</div>
                          {keyframePromptDroppedGuidance.length > 0 ? (
                            keyframePromptDecisionCollapsed ? (
                              <div className="mt-2 text-amber-700">
                                当前有 {keyframePromptDroppedGuidance.length} 条 guidance 被压缩，展开后可查看具体取舍原因。
                              </div>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {keyframePromptVisibleDroppedGuidanceDetails.map((item) => (
                                  <Tooltip
                                    key={`dropped:${item.text}`}
                                    title={(
                                      <div className="max-w-[320px] text-xs leading-5">
                                        {item.reasonTag ? (
                                          <Tag color="gold" className="mb-1">
                                            {item.reasonTag}
                                          </Tag>
                                        ) : null}
                                        <div>{item.text}</div>
                                        {item.reason ? <div className="mt-1 text-slate-500">{item.reason}</div> : null}
                                      </div>
                                    )}
                                  >
                                    <Tag color="gold" className="max-w-[240px] overflow-hidden">
                                      <span className="inline-block max-w-[200px] truncate align-bottom">{item.text}</span>
                                    </Tag>
                                  </Tooltip>
                                ))}
                              </div>
                            )
                          ) : (
                            <div className="mt-2 text-amber-700">当前没有 guidance 被压缩。</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {hasBasePrompt ? (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-800 whitespace-pre-wrap min-h-[220px]">
                      {keyframePromptRenderedDraft || '系统正在根据当前内容准备最终提示词…'}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                      <div className="font-medium text-slate-700">等待基础提示词</div>
                      <div className="mt-2">
                        基础提示词准备完成后，系统会自动：
                      </div>
                      <div className="mt-2 space-y-1 text-slate-500">
                        <div>1. 根据当前参考图顺序生成图1 / 图2映射</div>
                        <div>2. 补充“## 图片内容说明”</div>
                        <div>3. 生成最终提交给模型的提示词</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

        </Modal>

        <Modal
          title="生成视频"
          className="cs-prompt-preview"
          open={videoPromptPreviewOpen}
          onCancel={() => {
            videoOpenSequence.current++
            setVideoPromptPreviewOpen(false)
          }}
          footer={(_, { OkBtn, CancelBtn }) => <div>
            {generationChannel === 'api' && videoApiDisabledReason && <div role="status" className="mb-2 text-left text-sm text-amber-700">
              <span>暂不能继续：{videoApiDisabledReason}</span>
              {videoCanRefreshFromFooter && <Button type="link" size="small" onClick={() => { setVideoPreviewTab('prompt'); void refreshVideoSendPreview() }}>现在更新预览（免费）</Button>}
            </div>}
            <Space wrap>
            <GenerationChannelActions channel={generationChannel} onChannelChange={setGenerationChannel} apiAction={<Tooltip title={videoApiDisabledReason || undefined}><span><OkBtn/></span></Tooltip>} webAction={<WebHandoffButton key={selectedShot?.id} onAccepted={()=>setVideoPromptPreviewOpen(false)} disabled={videoPromptPreviewLoading || props.detailSaving || Boolean(props.detailSaveError) || props.generationSyncing || !selectedShot}
              prepare={async () => {
                if (!selectedShot || !videoPromptDraft.base.prompt.trim()) throw new Error('请先准备当前镜头提示词')
                const shotId=selectedShot.id
                const prompt=videoPromptDraft.base.prompt
                const frameImages=[...videoPromptDraft.context.images]
                const subjectImages=(videoPromptDraft.context.subjects||[]).flatMap(s=>(s.media||[]).map(m=>m.file_id))
                const groups=subjectImages.length?(videoPromptDraft.context.subjects||[]).map(group=>({name:group.name,media:[...(group.media||[])]})):[]
                const mode=videoPromptDraft.context.referenceMode
                if(!['text_only','first','first_last','subjects'].includes(mode)) throw new Error('该网页交接入口暂不支持尾帧单图或未明确用途的关键帧，请选择纯文本、首帧或首尾帧')
                const seconds=shotDetail?.duration
                if(!seconds) throw new Error('请先设置镜头时长')
                const ratio=resolveVideoRatioForRequest()||'16:9'
                const target=await StudioWebGenerationService.targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({targetType:'shot',entityId:shotId,slotId:1})
                return {target_type:'shot',entity_id:shotId,expected_version:target.version,prompt,reference_file_ids:frameImages,duration_seconds:seconds,aspect_ratio:ratio,resolution:null,subject_groups:groups,reference_mode:mode==='subjects'?'subjects':mode==='first_last'?'first_last_frames':mode==='first'?'first_frame':'text'}
              }}/>}/><CancelBtn/>
          </Space></div>}
          okText="下一步：确认生成费用"
          okButtonProps={{ disabled: !!videoApiDisabledReason }}
          cancelText="返回工作室"
          onOk={() => void submitVideoGeneration()}
          confirmLoading={videoPromptPreviewSubmitting}
          width={1180}
          destroyOnClose
        >
          {videoPromptPreviewLoading ? (
            <div className="py-8 text-center">
              <Spin />
              <p className="mt-3 text-gray-500">正在整理提示词与参考信息（免费），尚未调用视频模型。</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Alert type="info" showIcon message="先核对生成内容，再选择 API 调用或平台网页" description="在页面底部选择生成方式。API 调用需确认费用；平台网页需选择平台、模型与账号并确认提交。打开本页、读取历史与更新预览不会开始生成。" />
              <Tabs className="cs-video-tabs" activeKey={videoPreviewTab} onChange={setVideoPreviewTab} items={[
                { key: 'prompt', label: '提示词与发送预览', forceRender: true, children: <>              <VideoShotBrief pack={videoPromptPreviewPack} title={selectedShot?.title}
                onEdit={() => { setVideoPromptPreviewOpen(false); goToShotEditForAssets() }}
                onReview={() => setVideoPreviewTab('review')} />
              <div>
                <div className="text-xs text-gray-500 mb-2">本次视频参考图 · 请核对人物、服装、场景与起止动作</div>
                {videoPromptPreviewImages.length === 0 ? (
                  <div className="text-xs text-gray-400">{videoPromptDraft.context.subjects?.length ? '本次使用主体多图参考，具体图片与用途见下方；不发送首尾帧。' : '本次使用纯文本，不发送参考图片。若需要固定人物外观或起止画面，请返回工作室选择支持的参考模式。'}</div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <Image.PreviewGroup>
                      {videoPromptPreviewImages.map((fid, imageIndex) => (
                        <div key={fid} className="cs-video-frame"><Image
                          width={112}
                          height={112}
                          style={{ objectFit: 'cover', borderRadius: 8 }}
                          src={buildFileDownloadUrl(fid)}
                        /><div>{videoPromptDraft.context.referenceMode === 'first_last' ? (imageIndex === 0 ? '首帧 · 视频开始' : '尾帧 · 视频结束') : ({ first: '首帧 · 视频开始', last: '尾帧 · 视频结束', key: '关键帧参考' } as Record<string, string>)[videoPromptDraft.context.referenceMode] || `参考图 ${imageIndex + 1}`}</div></div>
                      ))}
                    </Image.PreviewGroup>
                  </div>
                )}
              </div>
              <Button size="small" type="link" className="mb-3" onClick={() => { setVideoPromptPreviewOpen(false); setInspectorTabKey('keyframe_gen') }}>图片不合适？选择或生成参考帧</Button>
              {!!videoPromptDraft.context.subjects?.length && <section className="cs-group"><strong>本次实际发送的主体参考图</strong><div className="flex flex-wrap gap-3 mt-2">
                {videoPromptDraft.context.subjects.flatMap((subject, groupIndex) => (subject.media || []).map((media, angleIndex) => ({ subject, media, groupIndex, angleIndex }))).map(({ subject, media, groupIndex, angleIndex }, i) => <div key={`${groupIndex}:${media.file_id}`} className="w-36 min-w-0">
                  <PreviewImage src={buildFileDownloadUrl(media.file_id)} alt={`${subject.name} · 角度${angleIndex + 1}`} className="w-32 h-28 object-contain" />
                  <div className="break-words">图{i + 1} · {subject.name} · 组内{angleIndex + 1}</div></div>)}
              </div><p>不与首尾帧混传；图片编号与发送预览中的映射一致。</p></section>}
              {videoRestoredDraftNotice && <Alert type="warning" showIcon message="已保留历史优化稿，请核对变化" description={videoRestoredDraftNotice} />}
              {videoReviewLineage?.application?.active && videoReviewLineage.application.prompt === videoReviewedPrompt &&
                <Alert type="success" showIcon message="本次使用已保存的智能优化稿" description="编辑区与发送预览已同步；再次打开会恢复此稿。手动修改后需更新发送预览，微调优化方案后需再次点击应用保存。" />}
              <VideoPromptWorkbench draft={videoPromptPreviewDraft} finalPrompt={videoPromptDraft.derived?.prompt || ''}
                fresh={videoPreviewFresh} loading={videoPromptDraft.state === 'deriving'}
                disabled={videoPromptPreviewSubmitting} error={videoPromptDraft.error}
                onChange={prompt => videoPromptDraft.setBase({ prompt })}
                onRefresh={() => void refreshVideoSendPreview()} />
              <div className="cs-video-input-summary">
                <strong>本次视频参数</strong>
                <span>模型：{videoChoice?.spec ? `${videoChoice.spec.provider} · ${videoChoice.spec.model_name}` : '参数读取中，请稍候'}</span>
                <span>参考：{({ subjects: '主体多图', text_only: '纯文本', first: '首帧', last: '尾帧', key: '关键帧', first_last: '首帧 + 尾帧' } as Record<string, string>)[videoPromptDraft.context.referenceMode]}</span>
                <span>时长：{shotDetail?.duration ?? '未设置'} 秒</span><span>比例：{resolveVideoRatioForRequest() || '未设置'}</span>
                <span>分辨率：{videoChoice?.value || '模型默认'}</span><span>原生音频：{videoChoice?.audio ? '开启' : '关闭或模型不支持'}</span>
                <span>修改模型、图片或参数请返回工作室。下一步确认费用后才提交任务。</span>
                {(['price', 'reference_price', 'package_reference'] as const).map(field => {
                  const price = videoChoice?.spec?.[field]
                  if (!price && field !== 'price') return null
                  const rate = rateFor(price, videoChoice?.value, videoChoice?.audio)
                  const amount = rate != null && shotDetail?.duration ? (rate * shotDetail.duration).toFixed(4) : null
                  return <span key={field}><strong>{field === 'price' ? '预计费用' : field === 'reference_price' ? '按量原价参考' : '套餐参考'}：</strong>
                    {amount ? `${price?.currency === 'CNY' ? '¥' : ''}${amount} ${price?.currency === 'AFP' ? 'AFP' : ''}` : '暂无法准确估算，不代表免费'}
                    {price?.source && <> · <a href={price.source} target="_blank" rel="noreferrer">计费依据</a></>}
                  </span>
                })}
                <span>估算按已核验价格与当前时长计算，实际以账户账单为准。</span>
              </div>

</> },
                { key: 'review', label: <>AI 预检与优化（可选）{videoReviewLineage?.application?.active && <Tag color="green">已应用</Tag>}</>, forceRender: true, children: <>          {selectedShot && !videoPromptPreviewLoading && <QualityReviewPanel key={`${selectedShot.id}:video`} shotId={selectedShot.id} scope="video" inputReady={videoPreviewFresh} prompt={videoReviewedPrompt} imageFileIds={[...videoPromptDraft.context.images, ...(videoPromptDraft.context.subjects || []).flatMap(s => (s.media || []).map(m => m.file_id))]} generationContext={videoReviewContext} sourceFingerprint={videoPromptDraft.derived?.sourceFingerprint} onApply={applyVideoReview} onLineage={setVideoReviewLineage} />}
</> },
                { key: 'sources', label: '来源与规则（免费）', forceRender: true, children: <>              <section className="cs-video-sources"><p>先在“提示词与发送预览”确认本次完整稿；这里解释系统补充内容的来源。</p>
                <GenerationQualityPanel report={videoPromptDraft.derived?.qualityReport} />
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-700">镜头连续性上下文</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                      这些内容会参与视频提示词拼接。动作节拍优先来自镜头已保存的信息，缺失时从描述、剧本摘录和对白整理；阶段标签由本地规则推断，不是 AI 预检结论。
                    </div>
                  </div>
                  <Button
                    type="link"
                    size="small"
                    className="px-0"
                    onClick={() => setVideoPromptContextCollapsed((prev) => !prev)}
                  >
                    {videoPromptContextCollapsed ? '展开细节' : '收起细节'}
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Tag color="blue">{`动作节拍 ${videoActionBeats.length}`}</Tag>
                  {videoPromptPreviewPack?.previous_shot_summary ? (
                    <Tag color="purple">上一镜头</Tag>
                  ) : null}
                  {videoPromptPreviewPack?.next_shot_goal ? (
                    <Tag color="cyan">下一镜头</Tag>
                  ) : null}
                  {videoPromptPreviewPack?.continuity_guidance ? (
                    <Tag color="gold">连续性</Tag>
                  ) : null}
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-slate-500">动作节拍</div>
                    {videoVisibleActionBeats.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {videoVisibleActionBeats.map((item, index) => (
                          <Tag
                            key={`${index}:${item.phase ?? 'raw'}:${item.text}`}
                            className="cs-action-beat"
                            color={
                              item.phase === 'trigger'
                                ? 'gold'
                                : item.phase === 'peak'
                                  ? 'blue'
                                  : item.phase === 'aftermath'
                                    ? 'green'
                                    : 'default'
                            }
                          >
                            {item.phase
                              ? `${item.phase === 'trigger' ? '触发' : item.phase === 'peak' ? '峰值' : '收束'} · ${item.text}`
                              : item.text}
                          </Tag>
                        ))}
                        {videoPromptContextCollapsed && hiddenVideoActionBeatCount > 0 ? (
                          <Button type="link" size="small" onClick={() => setVideoPromptContextCollapsed(false)}>{`展开其余 ${hiddenVideoActionBeatCount} 条`}</Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-1 text-gray-400">暂无动作节拍</div>
                    )}
                  </div>
                  {!videoPromptContextCollapsed ? (
                    <>
                      <div>
                        <div className="text-slate-500">上一镜头摘要</div>
                        <div className="mt-1 whitespace-pre-wrap text-slate-700">
                          {videoPromptPreviewPack?.previous_shot_summary || '无'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">下一镜头目标</div>
                        <div className="mt-1 whitespace-pre-wrap text-slate-700">
                          {videoPromptPreviewPack?.next_shot_goal || '无'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">连续性建议</div>
                        <div className="mt-1 whitespace-pre-wrap text-slate-700">
                          {videoPromptPreviewPack?.continuity_guidance || '无'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">构图与空间锚点</div>
                        <div className="mt-1 whitespace-pre-wrap text-slate-700">
                          {videoPromptPreviewPack?.composition_anchor || '无'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">朝向与视线建议</div>
                        <div className="mt-1 whitespace-pre-wrap text-slate-700">
                          {videoPromptPreviewPack?.screen_direction_guidance || '无'}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
              </section>
</> },
              ]} />
            </div>
          )}
        </Modal>
      </div>
    </div>
  )
}
