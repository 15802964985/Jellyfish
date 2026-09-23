import { BackgroundTaskNotice } from '../../../components/BackgroundTaskNotice'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Alert, Card, Button, Checkbox, Tag, Space, Table, Empty, Modal, Input, Dropdown, Upload, Pagination, Select, message } from 'antd'
import type { MenuProps, TableColumnsType } from 'antd'
import {
  EditOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  MoreOutlined,
  PlusOutlined,
  ScissorOutlined,
  StopOutlined,
  SyncOutlined,
  UploadOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ScriptProcessingService,
  LlmService,
  StudioChaptersService,
  StudioFilesService,
  StudioScriptImportsService,
  type ScriptImportRead,
  type ScriptImportSummaryRead,
  type ScriptImportCandidateDecision,
  type ScriptImportEntityMatch,
  type ScriptImportMediaPlanRead,
} from '../../../../../services/generated'
import { chapterStatusMap } from '../constants'
import { getChapterShotsPath, getChapterStudioPath } from '../routes'
import { useChapters, newId, type Chapter } from '../hooks/useProjectData'
import { ChapterRawTextEditorModal } from '../../../chapter/components/ChapterRawTextEditorModal'
import { ensureHasShotsBeforeShooting } from '../ensureHasShotsBeforeShooting'
import { getChapterPreparationState } from '../chapterPreparation'
import { loadChapterFlowStats, type ChapterFlowStats } from '../projectFlowStats'
import { executeAsyncTaskCreate, executeTaskCancel } from '../../../components/taskActionHelpers'
import { TASK_COPY } from '../../../components/taskCopy'
import { useTaskPageContext } from '../../../components/taskPageContext'
import { useTaskUiStore } from '../../../components/taskUiStore'
import {
  createRelationTaskState,
  upsertRelationTaskStateInMap,
  useChapterDivisionTaskMapPolling,
} from '../chapterDivisionTasks'
import { notifyProjectDataChanged } from '../projectDataEvents'

const { TextArea } = Input
const CREATE_PARAM = 'create'
const EDIT_PARAM = 'edit'
type ImportChapterEdit = { title: string; theme: string; screenplay_text: string }
type ImportEvidence = { block_id: string; quote: string }
type ImportEntityCandidate = {
  candidate_id: string
  entity_type: 'actor' | 'character' | 'scene' | 'prop' | 'costume'
  name: string
  description?: string
  confidence?: number
  source_kind?: 'explicit' | 'inferred' | 'suggested'
  evidence?: ImportEvidence[]
}
type ImportAnalysis = {
  project_brief?: Record<string, unknown>
  entities?: ImportEntityCandidate[]
  shots?: Array<Record<string, unknown>>
  audio?: Array<Record<string, unknown>>
  validation?: Array<{ severity?: string; message?: string }>
  warnings?: string[]
}

const IMPORT_ENTITY_LABELS: Record<ImportEntityCandidate['entity_type'], string> = {
  actor: '演员',
  character: '角色',
  scene: '场景',
  prop: '道具',
  costume: '服装',
}

const IMPORT_STATUS_META: Record<string, { label: string; color: string }> = {
  parsed: { label: '待审核', color: 'blue' },
  analyzing: { label: '分析中', color: 'processing' },
  ready: { label: '待确认', color: 'cyan' },
  failed: { label: '分析失败', color: 'error' },
  committed: { label: '已导入', color: 'success' },
}

export function ChaptersTab() {
  const taskCopy = TASK_COPY.chapterDivision
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { chapters, loading, refresh, patchChapterLocal } = useChapters(projectId)

  const [editOpen, setEditOpen] = useState(false)
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createContent, setCreateContent] = useState('')
  const [infoEditOpen, setInfoEditOpen] = useState(false)
  const [infoEditingChapter, setInfoEditingChapter] = useState<Chapter | null>(null)
  const [infoTitle, setInfoTitle] = useState('')
  const [infoSummary, setInfoSummary] = useState('')
  const [infoSaving, setInfoSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importBatch, setImportBatch] = useState<ScriptImportRead | null>(null)
  // 仅保存恢复指针，临时分析材料不自动转为已保存业务草稿。
  useEffect(() => {
    if (!projectId) return
    const key = `jellyfish_import_task:${projectId}`
    if (importBatch?.status === 'analyzing') { try { sessionStorage.setItem(key, importBatch.id) } catch { /* 内存工作区仍保留 */ } }
  }, [projectId, importBatch?.id, importBatch?.status])
  useEffect(() => {
    if (!projectId) return
    let cancelled=false, id:string|null=null
    try { id=searchParams.get('importId') || sessionStorage.getItem(`jellyfish_import_task:${projectId}`) } catch { /* 无存储无需恢复 */ }
    if(id)void StudioScriptImportsService.getScriptImportApiApiV1StudioScriptImportsImportIdGet({importId:id}).then(r=>{
      if(!cancelled&&r.data&&r.data.project_id===projectId){void restoreScriptImportBatch(r.data);if(searchParams.get('importId'))setImportOpen(true)}
    }).catch(()=>{})
    return()=>{cancelled=true}
  }, [projectId, searchParams.get('importId')])
  const [selectedImportChapters, setSelectedImportChapters] = useState<number[]>([])
  const [importChapterEdits, setImportChapterEdits] = useState<Record<number, ImportChapterEdit>>({})
  const [candidateDecisions, setCandidateDecisions] = useState<Record<string, ScriptImportCandidateDecision>>({})
  const [entityMatches, setEntityMatches] = useState<Record<string, ScriptImportEntityMatch[]>>({})
  const [includeImportedShots, setIncludeImportedShots] = useState(false)
  const [includeImportedDialogue, setIncludeImportedDialogue] = useState(false)
  const [importMediaPlan, setImportMediaPlan] = useState<ScriptImportMediaPlanRead | null>(null)
  const [importHistory, setImportHistory] = useState<ScriptImportSummaryRead[]>([])
  const [importHistoryLoading, setImportHistoryLoading] = useState(false)
  const [importHistoryPage, setImportHistoryPage] = useState(1)
  const [importHistoryTotal, setImportHistoryTotal] = useState(0)
  const [importHistoryReloadKey, setImportHistoryReloadKey] = useState(0)
  const [autoDivideAfterImport, setAutoDivideAfterImport] = useState(false)
  const [chapterFlowMap, setChapterFlowMap] = useState<Record<string, ChapterFlowStats>>({})
  const [chapterDivisionActionId, setChapterDivisionActionId] = useState<string | null>(null)
  const [chapterPage, setChapterPage] = useState(1)
  const [chapterPageSize, setChapterPageSize] = useState(10)
  const taskUiUpsert = useTaskUiStore((state) => state.upsertTask)
  const taskUiRemove = useTaskUiStore((state) => state.removeTask)
  const syncedTaskIdsRef = useRef<string[]>([])
  const chapterIds = useMemo(() => chapters.map((chapter) => chapter.id), [chapters])
  const pagedChapters = useMemo(
    () => chapters.slice((chapterPage - 1) * chapterPageSize, chapterPage * chapterPageSize),
    [chapterPage, chapterPageSize, chapters],
  )
  const parsedImportChapters = importBatch?.parse_result.chapters ?? []
  const importAnalysis = (importBatch?.analysis_result ?? {}) as ImportAnalysis
  const importReadOnly = importBatch?.status === 'committed'

  useEffect(() => {
    if (importOpen) setImportHistoryPage(1)
  }, [importOpen, projectId])

  useEffect(() => {
    if (!importOpen || !projectId) return
    let cancelled = false
    setImportHistoryLoading(true)
    void StudioScriptImportsService.listScriptImportsApiApiV1StudioScriptImportsGet({
      projectId,
      page: importHistoryPage,
      pageSize: 5,
    }).then((response) => {
      if (cancelled) return
      setImportHistory(response.data?.items ?? [])
      setImportHistoryTotal(response.data?.pagination.total ?? 0)
    }).catch(() => {
      if (!cancelled) message.error('加载导入草稿失败')
    }).finally(() => {
      if (!cancelled) setImportHistoryLoading(false)
    })
    return () => { cancelled = true }
  }, [importHistoryPage, importHistoryReloadKey, importOpen, projectId])

  const updateCandidateDecision = (
    candidateId: string,
    patch: Partial<ScriptImportCandidateDecision>,
  ) => {
    setCandidateDecisions((current) => ({
      ...current,
      [candidateId]: {
        action: current[candidateId]?.action ?? 'ignore',
        ...current[candidateId],
        ...patch,
      },
    }))
  }

  useEffect(() => {
    if (!importBatch || importBatch.status !== 'analyzing') return
    let cancelled = false
    const refreshImport = async () => {
      try {
        const response = await StudioScriptImportsService.getScriptImportApiApiV1StudioScriptImportsImportIdGet({
          importId: importBatch.id,
        })
        if (!cancelled && response.data) setImportBatch(response.data)
      } catch {
        // 任务中心仍可恢复状态；短暂网络错误交给下一次低频轮询。
      }
    }
    void refreshImport()
    const timer = window.setInterval(() => void refreshImport(), 10_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [importBatch?.id, importBatch?.status])

  useEffect(() => {
    if (!importBatch || !['ready', 'committed'].includes(importBatch.status)) return
    let cancelled = false
    void StudioScriptImportsService.getScriptImportMatchesApiApiV1StudioScriptImportsImportIdMatchesGet({
      importId: importBatch.id,
    }).then((response) => {
      if (!cancelled) setEntityMatches(response.data?.matches ?? {})
    }).catch(() => {
      if (!cancelled) setEntityMatches({})
    })
    return () => { cancelled = true }
  }, [importBatch?.id, importBatch?.status])

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(chapters.length / chapterPageSize))
    setChapterPage((current) => Math.min(current, lastPage))
  }, [chapterPageSize, chapters.length])
  useTaskPageContext(
    chapterIds.map((id) => ({
      relationType: 'chapter_division',
      relationEntityId: id,
    })),
  )
  const { taskMap: chapterDivisionTaskMap, setTrackedTaskMap: setChapterDivisionTaskMap } = useChapterDivisionTaskMapPolling({
    chapterIds,
    onTasksSettled: async () => {
      await refresh()
      if (projectId) notifyProjectDataChanged({ projectId, resources: ['project', 'chapters'] })
    },
  })

  const createParam = searchParams.get(CREATE_PARAM)
  const editParam = searchParams.get(EDIT_PARAM)
  useEffect(() => {
    if (createParam === '1') {
      setCreateOpen(true)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete(CREATE_PARAM)
          return next
        },
        { replace: true }
      )
    }
  }, [createParam, setSearchParams])

  useEffect(() => {
    if (!editParam) return
    const target = chapters.find((chapter) => chapter.id === editParam)
    if (!target) return
    openEditModal(target)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(EDIT_PARAM)
        return next
      },
      { replace: true }
    )
  }, [chapters, editParam, setSearchParams])

  useEffect(() => {
    let cancelled = false
    if (!chapters.length) {
      setChapterFlowMap({})
      return () => {
        cancelled = true
      }
    }

    const run = async () => {
      try {
        const rows = await loadChapterFlowStats(chapters)
        if (!cancelled) {
          setChapterFlowMap(Object.fromEntries(rows.map((row) => [row.chapterId, row])))
        }
      } catch {
        if (!cancelled) setChapterFlowMap({})
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [chapters])

  const openEditModal = (chapter: Chapter) => {
    setEditingChapter(chapter)
    setEditOpen(true)
  }

  const openCreateNextStep = (chapter: Chapter, hasRawText: boolean) => {
    if (!projectId) return
    Modal.confirm({
      title: '章节创建成功',
      content: hasRawText
        ? '这一章已经有原文内容，接下来更适合直接提取分镜。'
        : '这一章还没有原文内容，建议先补章节原文。',
      okText: hasRawText ? '立即提取分镜' : '继续编辑原文',
      cancelText: '稍后处理',
      onOk: () => {
        if (hasRawText) {
          navigate(getChapterShotsPath(projectId, chapter.id))
          return
        }
        openEditModal(chapter)
      },
    })
  }

  const handleCreateChapter = async () => {
    if (!createTitle.trim()) {
      message.warning('请输入章节标题')
      return
    }
    if (!projectId) return
    try {
      const nextIndex = Math.max(0, ...chapters.map((c) => c.index)) + 1
      const createdId = newId('c')
      const title = createTitle.trim()
      const rawText = createContent
      const draftChapter: Chapter = {
        id: createdId,
        projectId,
        index: nextIndex,
        title,
        summary: '',
        rawText,
        storyboardCount: 0,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      }
      await StudioChaptersService.createChapterApiV1StudioChaptersPost({
        requestBody: {
          id: createdId,
          project_id: projectId,
          index: nextIndex,
          title,
          summary: '',
          raw_text: rawText || undefined,
          storyboard_count: 0,
          status: 'draft',
        },
      })
      message.success('章节创建成功')
      setCreateOpen(false)
      setCreateTitle('')
      setCreateContent('')
      await refresh()
      notifyProjectDataChanged({ projectId, resources: ['project', 'chapters'] })
      openCreateNextStep(draftChapter, !!rawText.trim())
    } catch {
      message.error('创建章节失败')
    }
  }

  const useMock = import.meta.env.VITE_USE_MOCK === 'true'
  const handleCreateChapterMock = () => {
    if (!createTitle.trim()) {
      message.warning('请输入章节标题')
      return
    }
    if (!projectId) return
    const nextIndex = Math.max(0, ...chapters.map((c) => c.index)) + 1
    const createdId = newId('c')
    const title = createTitle.trim()
    const rawText = createContent
    const draftChapter: Chapter = {
      id: createdId,
      projectId,
      index: nextIndex,
      title,
      summary: '',
      rawText,
      storyboardCount: 0,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    }
    message.success('创建成功（Mock）')
    setCreateOpen(false)
    setCreateTitle('')
    setCreateContent('')
    window.setTimeout(() => openCreateNextStep(draftChapter, !!rawText.trim()), 0)
    void refresh()
    notifyProjectDataChanged({ projectId, resources: ['project', 'chapters'] })
  }

  const openInfoEditModal = (chapter: Chapter) => {
    setInfoEditingChapter(chapter)
    setInfoTitle(chapter.title)
    setInfoSummary(chapter.summary ?? '')
    setInfoEditOpen(true)
  }

  const handleSaveChapterInfo = async () => {
    if (!projectId || !infoEditingChapter) return
    const title = infoTitle.trim()
    if (!title) {
      message.warning('请输入章节标题')
      return
    }
    setInfoSaving(true)
    try {
      await StudioChaptersService.updateChapterApiV1StudioChaptersChapterIdPatch({
        chapterId: infoEditingChapter.id,
        requestBody: { title, summary: infoSummary.trim() },
      })
      patchChapterLocal(infoEditingChapter.id, { title, summary: infoSummary.trim() })
      setInfoEditOpen(false)
      setInfoEditingChapter(null)
      notifyProjectDataChanged({ projectId, resources: ['project', 'chapters'] })
      message.success('章节信息已更新')
    } catch {
      message.error('章节信息更新失败')
    } finally {
      setInfoSaving(false)
    }
  }

  const handleDeleteChapter = (chapter: Chapter) => {
    if (!projectId) return
    Modal.confirm({
      title: `删除章节「${chapter.title}」？`,
      content: '该章节下的分镜及关联内容也可能受到影响。删除后无法恢复。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await StudioChaptersService.deleteChapterApiV1StudioChaptersChapterIdDelete({ chapterId: chapter.id })
          await refresh()
          notifyProjectDataChanged({ projectId, resources: ['project', 'chapters'] })
          message.success('章节已删除')
        } catch {
          message.error('章节删除失败')
        }
      },
    })
  }

  const handleStartImportAnalysis = async () => {
    if (!importBatch) return
    try {
      const settings = await LlmService.getModelSettingsApiV1LlmModelSettingsGet()
      const modelId = settings.data?.default_text_model_id
      if (!modelId) throw new Error('尚未设置默认文本模型，请先到模型管理配置')
      const model = await LlmService.getModelApiV1LlmModelsModelIdGet({ modelId })
      if (!model.data) throw new Error('默认文本模型不存在或已被删除')
      const provider = await LlmService.getProviderApiV1LlmProvidersProviderIdGet({
        providerId: model.data.provider_id,
      })
      Modal.confirm({
        title: '确认发送剧本进行 AI 深度分析',
        width: 620,
        okText: '同意发送并开始分析',
        cancelText: '取消',
        content: (
          <div className="space-y-2 mt-3">
            <Alert
              type="warning"
              showIcon
              message="剧本正文将发送到外部模型供应商，并可能产生文本模型费用"
            />
            <div>供应商：<strong>{provider.data?.name ?? model.data.provider_id}</strong></div>
            <div>模型：<strong>{model.data.name}</strong></div>
            <div className="text-sm text-gray-500">
              用途仅限提取项目设定、演员/角色、场景、道具、服装、镜头、对白、字幕与音效候选。
              不发送 API Key、数据库密码，不自动生成图片或视频。结果仍需人工选择后才写入业务表。
            </div>
          </div>
        ),
        onOk: async () => {
          const response = await StudioScriptImportsService.analyzeScriptImportApiApiV1StudioScriptImportsImportIdAnalyzePost({
            importId: importBatch.id,
            requestBody: { model_id: modelId },
          })
          if (!response.data?.task_id) throw new Error('分析任务创建失败')
          window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId:response.data.task_id,title:'剧本深度分析'}}))
          setImportBatch((current) => current ? { ...current, status: 'analyzing', error_message: '' } : current)
          message.success('AI 深度分析任务已创建，可在任务中心查看')
        },
      })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '无法启动 AI 深度分析')
    }
  }

  const handleImportScripts = async () => {
    if (!projectId || !importBatch || !selectedImportChapters.length) return
    setImporting(true)
    let divisionCount = 0
    try {
      const committed = await StudioScriptImportsService.commitScriptImportApiApiV1StudioScriptImportsImportIdCommitPost({
        importId: importBatch.id,
        requestBody: {
          selected_chapter_indexes: selectedImportChapters,
          chapter_overrides: Object.fromEntries(
            selectedImportChapters.map((index) => [String(index), importChapterEdits[index]]),
          ),
          candidate_decisions: candidateDecisions,
          include_shots: includeImportedShots,
          include_audio_dialogue: includeImportedDialogue,
          media_plan_model_id: importMediaPlan?.model_id,
        },
      })
      const chapterIds = committed.data?.chapter_ids ?? []
      if (autoDivideAfterImport && !includeImportedShots) {
        for (const [offset, chapterId] of chapterIds.entries()) {
          const parsed = parsedImportChapters.find(
            (chapter) => chapter.index === selectedImportChapters[offset],
          )
          const scriptText = importChapterEdits[selectedImportChapters[offset]]?.screenplay_text ?? parsed?.screenplay_text ?? ''
          if (!scriptText.trim()) continue
          await ScriptProcessingService.divideScriptAsyncApiV1ScriptProcessingDivideAsyncPost({
            requestBody: {
              chapter_id: chapterId,
              script_text: scriptText,
              write_to_db: true,
            },
          })
          divisionCount += 1
        }
      }
      await refresh()
      notifyProjectDataChanged({ projectId, resources: ['project', 'chapters'] })
      setImportOpen(false)
      setImportBatch(null)
      setSelectedImportChapters([])
      setImportChapterEdits({})
      setCandidateDecisions({})
      setEntityMatches({})
      setIncludeImportedShots(false)
      setIncludeImportedDialogue(false)
      setImportMediaPlan(null)
      setAutoDivideAfterImport(false)
      const createdCount = committed.data?.created_count ?? chapterIds.length
      message.success(
        divisionCount
          ? `已导入 ${createdCount} 个章节，并启动 ${divisionCount} 个分镜提取任务`
          : `已导入 ${createdCount} 个章节`,
      )
    } catch (error) {
      message.error(error instanceof Error ? error.message : '剧本导入失败')
    } finally {
      setImporting(false)
    }
  }

  const handleSaveImportReview = async () => {
    if (!importBatch) return
    setImporting(true)
    try {
      const response = await StudioScriptImportsService.updateScriptImportReviewApiApiV1StudioScriptImportsImportIdReviewPatch({
        importId: importBatch.id,
        requestBody: {
          review_state: {
            ...importBatch.review_state,
            selected_chapter_indexes: selectedImportChapters,
            chapter_overrides: Object.fromEntries(
              Object.entries(importChapterEdits).map(([index, edit]) => [index, edit]),
            ),
            candidate_decisions: candidateDecisions,
            include_shots: includeImportedShots,
            include_audio_dialogue: includeImportedDialogue,
            media_plan_model_id: importMediaPlan?.model_id,
          },
        },
      })
      if (response.data) setImportBatch(response.data)
      setImportHistoryReloadKey((current) => current + 1)
      message.success('导入预览草稿已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存导入预览失败')
    } finally {
      setImporting(false)
    }
  }

  const handlePlanImportMedia = async () => {
    if (!importBatch) return
    try {
      setImporting(true)
      const settings = await LlmService.getModelSettingsApiV1LlmModelSettingsGet()
      const modelId = settings.data?.default_video_model_id
      if (!modelId) throw new Error('尚未设置默认视频模型，请先到模型管理配置')
      const response = await StudioScriptImportsService.planScriptImportMediaApiApiV1StudioScriptImportsImportIdPlanMediaPost({
        importId: importBatch.id,
        requestBody: { model_id: modelId },
      })
      if (!response.data) throw new Error('视频模型规划未返回结果')
      setImportMediaPlan(response.data)
      message.success(`已按 ${response.data.model_name} 检查片段时长与参考能力`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '视频模型能力规划失败')
    } finally {
      setImporting(false)
    }
  }

  /** 把后端导入批次恢复到当前审核工作区，包括用户已保存的编辑与选项。 */
  const restoreScriptImportBatch = async (batch: ScriptImportRead) => {
    const parsedChapters = batch.parse_result.chapters ?? []
    const savedOverrides = (batch.review_state?.chapter_overrides ?? {}) as Record<string, Partial<ImportChapterEdit>>
    const savedDecisions = (batch.review_state?.candidate_decisions ?? {}) as Record<string, ScriptImportCandidateDecision>
    const savedSelection = batch.review_state?.selected_chapter_indexes
    setImportBatch(batch)
    setSelectedImportChapters(Array.isArray(savedSelection)
      ? savedSelection.filter((value): value is number => typeof value === 'number')
      : parsedChapters.map((chapter) => chapter.index))
    setImportChapterEdits(Object.fromEntries(parsedChapters.map((chapter) => {
      const saved = savedOverrides[String(chapter.index)] ?? {}
      return [chapter.index, {
        title: saved.title ?? chapter.title,
        theme: saved.theme ?? chapter.theme ?? '',
        screenplay_text: saved.screenplay_text ?? chapter.screenplay_text,
      }]
    })))
    setCandidateDecisions(savedDecisions)
    setIncludeImportedShots(Boolean(batch.review_state?.include_shots))
    setIncludeImportedDialogue(Boolean(batch.review_state?.include_audio_dialogue))
    const savedMediaPlanModelId = batch.review_state?.media_plan_model_id
    if (typeof savedMediaPlanModelId === 'string' && savedMediaPlanModelId) {
      try {
        const planned = await StudioScriptImportsService.planScriptImportMediaApiApiV1StudioScriptImportsImportIdPlanMediaPost({
          importId: batch.id,
          requestBody: { model_id: savedMediaPlanModelId },
        })
        setImportMediaPlan(planned.data ?? null)
      } catch {
        setImportMediaPlan(null)
        message.warning('此前选择的视频模型已不可用，请重新规划片段时长')
      }
    } else {
      setImportMediaPlan(null)
    }
  }

  /** 从历史摘要读取完整草稿，并恢复到导入审核区。 */
  const handleOpenImportHistory = async (item: ScriptImportSummaryRead) => {
    setImporting(true)
    try {
      const response = await StudioScriptImportsService.getScriptImportApiApiV1StudioScriptImportsImportIdGet({
        importId: item.id,
      })
      if (!response.data) throw new Error('草稿详情不存在')
      await restoreScriptImportBatch(response.data)
      message.success(item.status === 'committed' ? '已打开导入记录' : '已恢复导入草稿')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '打开导入草稿失败')
    } finally {
      setImporting(false)
    }
  }

  /** 删除未提交草稿；原始文件仍保留在文件管理中。 */
  const handleDeleteImportDraft = (item: ScriptImportSummaryRead) => {
    Modal.confirm({
      title: '删除导入草稿？',
      content: '只删除预览、编辑和候选选择；原始文件仍保留在文件管理中。',
      okText: '删除草稿',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await StudioScriptImportsService.deleteScriptImportApiApiV1StudioScriptImportsImportIdDelete({
            importId: item.id,
          })
          if (importBatch?.id === item.id) {
            setImportBatch(null)
            setSelectedImportChapters([])
            setImportChapterEdits({})
            setCandidateDecisions({})
            setEntityMatches({})
            setImportMediaPlan(null)
          }
          if (importHistory.length === 1 && importHistoryPage > 1) {
            setImportHistoryPage((current) => current - 1)
          } else {
            setImportHistoryReloadKey((current) => current + 1)
          }
          message.success('导入草稿已删除，原始文件未删除')
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除导入草稿失败')
          throw error
        }
      },
    })
  }

  /** 清空当前导入工作区；仅处理前端状态，不改变已保存草稿。 */
  const resetScriptImportWorkspace = () => {
    setImportOpen(false)
    try { sessionStorage.removeItem(`jellyfish_import_task:${projectId}`) } catch { /* 无存储 */ }
    setImportBatch(null)
    setSelectedImportChapters([])
    setImportChapterEdits({})
    setCandidateDecisions({})
    setEntityMatches({})
    setImportMediaPlan(null)
  }

  /** 模型任务与结果保留可恢复指针；普通未保存上传仍按临时预览处理。 */
  const handleCloseScriptImport = async () => {
    if (importing) return
    let trackedImport: string | null = null
    try { trackedImport=sessionStorage.getItem(`jellyfish_import_task:${projectId}`) } catch { /* 无存储按服务端结果判断 */ }
    if (importBatch && (importBatch.status === 'analyzing' || trackedImport === importBatch.id || Object.keys(importBatch.analysis_result || {}).length > 0)) {
      setImportOpen(false)
      message.info('分析任务及结果已保留，可返回此窗口或通过任务中心恢复；编辑草稿仍需主动保存')
      return
    }
    if (importBatch && !importBatch.is_saved && importBatch.status !== 'committed') {
      try {
        await StudioScriptImportsService.deleteScriptImportApiApiV1StudioScriptImportsImportIdDelete({
          importId: importBatch.id,
        })
      } catch (error) {
        message.error(error instanceof Error ? error.message : '丢弃临时预览失败')
        return
      }
    }
    resetScriptImportWorkspace()
  }

  /** 展示格式无关的导入建议，帮助用户在低识别质量时修订原文件。 */
  const showScriptImportGuide = () => {
    Modal.info({
      title: '剧本文件与内容规范',
      width: 720,
      okText: '知道了',
      content: (
        <div className="mt-4 space-y-3 text-sm leading-6">
          <Alert
            type="info"
            showIcon
            message="格式不是硬性模板"
            description="系统会保留未识别原文，并把可识别内容规范成业务标签。字段缺失或结构差异较大时会提示核对，也可以在明确同意外发后使用 AI 深度分析。"
          />
          <div><strong>支持文件：</strong>TXT、MD/Markdown、带文字层的 PDF、DOCX，单文件最大 25MB。</div>
          <div>
            <strong>格式说明：</strong>TXT 支持 UTF-8/GB18030、方括号标签或“字段：内容”；Markdown 支持标题、列表、引用和表格；扫描版 PDF 需先 OCR；DOCX 读取正文，不保证还原文本框、图片文字和复杂排版。
          </div>
          <div><strong>推荐每章包含：</strong>章节标题、时间范围或时长、画面/场景、镜头/运镜；配音/对白、字幕、画面提示词、音效和制作备注按实际需要填写。</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{`章节一｜雨夜车站（0-8 秒）
【画面】
阿青推门走进空旷车站。
【镜头】
中景跟拍，缓慢推进。
【时长】
8 秒
【配音】
那晚，我回到了起点。
【字幕】
雨夜归来`}</pre>
          <div className="text-amber-700">看到“结构差异较大”时，请重点检查章节边界、标题、画面、镜头和时长；不要在未核对预览时直接确认导入。</div>
        </div>
      ),
    })
  }

  const scriptImportModal = (
    <Modal
      title="导入剧本"
      open={importOpen}
      onCancel={() => void handleCloseScriptImport()}
      onOk={() => void handleImportScripts()}
      okText={importReadOnly ? '已导入' : `确认导入${selectedImportChapters.length ? ` ${selectedImportChapters.length} 个章节` : ''}`}
      okButtonProps={{ disabled: !selectedImportChapters.length || importReadOnly }}
      confirmLoading={importing}
      closable={!importing}
      maskClosable={!importing}
      width={900}
    >
<div className="space-y-4">
        <BackgroundTaskNotice active={importBatch?.status === 'analyzing'} />
        <div className="flex items-center justify-between gap-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm">
          <span>支持自由格式智能解析；推荐结构可提高章节、画面、镜头和声音识别准确度。</span>
          <Button type="link" size="small" onClick={showScriptImportGuide}>查看格式与内容规范</Button>
        </div>
        <Card
          size="small"
          title={`导入草稿与历史（${importHistoryTotal}）`}
          extra={(
            <Button
              type="link"
              size="small"
              loading={importHistoryLoading}
              onClick={() => setImportHistoryReloadKey((current) => current + 1)}
            >
              刷新
            </Button>
          )}
        >
          {importHistoryLoading && !importHistory.length ? (
            <div className="py-3 text-center text-gray-500">正在加载草稿…</div>
          ) : importHistory.length ? (
            <div className="divide-y">
              {importHistory.map((item) => {
                const statusMeta = IMPORT_STATUS_META[item.status] ?? { label: item.status, color: 'default' }
                const canDelete = !['committed', 'analyzing'].includes(item.status)
                return (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{item.file_name || item.title}</span>
                        <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                        <Tag>{item.source_format.toUpperCase()}</Tag>
                        <Tag>解析器 {item.parser_version}</Tag>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {item.chapter_count ?? 0} 个识别章节
                        {item.status === 'committed' ? `；已导入 ${item.committed_chapter_count ?? 0} 个章节` : ''}
                        ；更新于 {new Date(item.updated_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <Space size={4}>
                      <Button size="small" onClick={() => void handleOpenImportHistory(item)}>
                        {item.status === 'committed' ? '查看' : '继续编辑'}
                      </Button>
                      <Button
                        size="small"
                        danger
                        disabled={!canDelete}
                        onClick={() => handleDeleteImportDraft(item)}
                      >
                        删除草稿
                      </Button>
                    </Space>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无导入草稿" />
          )}
          {importHistoryTotal > 5 ? (
            <Pagination
              className="mt-3 text-right"
              size="small"
              current={importHistoryPage}
              pageSize={5}
              total={importHistoryTotal}
              showSizeChanger={false}
              onChange={setImportHistoryPage}
            />
          ) : null}
        </Card>
        <Upload.Dragger
          accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          maxCount={1}
          showUploadList={false}
          disabled={importing}
          beforeUpload={async (file) => {
            try {
              if (!projectId) throw new Error('缺少项目 ID')
              if (!/\.(txt|md|markdown|pdf|docx)$/i.test(file.name)) throw new Error('目前支持 TXT、MD、PDF、DOCX 格式')
              if (file.size > 25 * 1024 * 1024) throw new Error('剧本文件不能超过 25MB')
              setImporting(true)
              const uploaded = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
                name: file.name.replace(/\.[^.]+$/, ''),
                formData: { file: file as unknown as string },
              })
              if (!uploaded.data?.id) throw new Error('上传成功但未返回文件 ID')
              const created = await StudioScriptImportsService.createScriptImportApiApiV1StudioScriptImportsPost({
                requestBody: { project_id: projectId, file_id: uploaded.data.id },
              })
              if (!created.data) throw new Error('解析成功但未返回导入预览')
              const parsedChapters = created.data.parse_result.chapters ?? []
              await restoreScriptImportBatch(created.data)
              message.success(`本地解析完成：识别到 ${parsedChapters.length} 个章节`)
            } catch (error) {
              setImportBatch(null)
              setSelectedImportChapters([])
              setImportChapterEdits({})
              setCandidateDecisions({})
              setEntityMatches({})
              setImportMediaPlan(null)
              message.error(error instanceof Error ? error.message : '剧本解析失败')
            } finally {
              setImporting(false)
            }
            return Upload.LIST_IGNORE
          }}
        >
          <p className="ant-upload-drag-icon"><UploadOutlined /></p>
          <p className="ant-upload-text">点击或拖入剧本文件</p>
          <p className="ant-upload-hint">支持 TXT、MD、PDF、DOCX，最大 25MB；PDF 需包含文字层；先解析预览，不会直接写入章节</p>
        </Upload.Dragger>

        {importBatch ? (
          <div className="space-y-3">
            <Alert
              type="info"
              showIcon
              message={`文档类型：${importBatch.document_profile}；解析器：${importBatch.parser_version}`}
              description="概述、完整提示词、配音汇总、音效和制作备注已与真实章节分离。请勾选确认后再写入项目。"
            />
            {importBatch.parse_result.warnings?.map((warning) => (
              <Alert key={warning} type="warning" showIcon message={warning} />
            ))}
            <div className="rounded border border-blue-100 bg-blue-50 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">AI 深度分析（可选）</div>
                  <div className="text-xs text-gray-500">
                    提取项目设定、演员/角色、场景、道具、服装、镜头与声音候选；默认不写入，需逐项确认。
                  </div>
                </div>
                <Button
                  type="primary"
                  size="small"
                  loading={importBatch.status === 'analyzing'}
                  disabled={importBatch.status === 'committed'}
                  onClick={() => void handleStartImportAnalysis()}
                >
                  {importBatch.status === 'failed' ? '重新分析' : '开始深度分析'}
                </Button>
              </div>
              {importBatch.status === 'analyzing' ? (
                <Alert
                  type="info"
                  showIcon
                  message="模型请求已发送，正在等待结构化分析结果"
                  description="深度分析是一次完整模型调用，结果返回前进度只表示当前阶段，不会逐字增长；长剧本可能需要数分钟。可在任务中心取消，取消后本窗口会自动恢复操作。"
                />
              ) : null}
              {importBatch.status === 'parsed' && importBatch.error_message ? (
                <Alert type="warning" showIcon message={importBatch.error_message} />
              ) : null}
              {importBatch.status === 'failed' && importBatch.error_message ? (
                <Alert type="error" showIcon message="AI 深度分析失败" description={importBatch.error_message} />
              ) : null}
              {importAnalysis.warnings?.map((warning) => (
                <Alert key={`analysis-${warning}`} type="warning" showIcon message={warning} />
              ))}
              {importAnalysis.validation?.map((item, index) => (
                <Alert
                  key={`validation-${index}-${item.message}`}
                  type={item.severity === 'error' ? 'error' : 'warning'}
                  showIcon
                  message={item.message ?? '分析结果需要人工核对'}
                />
              ))}
              {Object.keys(importAnalysis.project_brief ?? {}).length ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">查看 AI 提取的项目设定</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-xs">
                    {JSON.stringify(importAnalysis.project_brief, null, 2)}
                  </pre>
                </details>
              ) : null}
              {(importAnalysis.entities?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">资产候选（默认忽略，请选择如何处理）</div>
                  <div className="max-h-[34vh] space-y-2 overflow-auto pr-1">
                    {importAnalysis.entities?.map((candidate) => {
                      const decision = candidateDecisions[candidate.candidate_id]
                      const action = decision?.action ?? 'ignore'
                      const matches = entityMatches[candidate.candidate_id] ?? []
                      return (
                        <div key={candidate.candidate_id} className="rounded border border-gray-200 bg-white p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <Tag color="blue">{IMPORT_ENTITY_LABELS[candidate.entity_type]}</Tag>
                              <span className="font-medium">{candidate.name}</span>
                              {typeof candidate.confidence === 'number' ? (
                                <span className="ml-2 text-xs text-gray-400">置信度 {Math.round(candidate.confidence * 100)}%</span>
                              ) : null}
                              <Tag className="ml-2">
                                {candidate.source_kind === 'explicit' ? '原文明示' : candidate.source_kind === 'suggested' ? '创作建议' : 'AI 推断'}
                              </Tag>
                            </div>
                            <Select
                              size="small"
                              disabled={importReadOnly}
                              value={action}
                              style={{ width: 150 }}
                              onChange={(value: ScriptImportCandidateDecision['action']) => updateCandidateDecision(
                                candidate.candidate_id,
                                { action: value, existing_entity_id: undefined },
                              )}
                              options={[
                                { value: 'ignore', label: '忽略，不写入' },
                                { value: 'create', label: '新建资产' },
                                { value: 'link', label: '关联已有资产' },
                                { value: 'detail', label: '仅作细节参考' },
                              ]}
                            />
                          </div>
                          {candidate.description ? <div className="mt-1 text-sm text-gray-600">{candidate.description}</div> : null}
                          {candidate.evidence?.length ? (
                            <div className="mt-2 text-xs text-gray-500">
                              原文证据：{candidate.evidence.map((item) => `“${item.quote}”`).join('；')}
                            </div>
                          ) : null}
                          {action === 'link' ? (
                            <Select
                              className="mt-2 w-full"
                              disabled={importReadOnly}
                              showSearch
                              placeholder={matches.length ? '选择已有资产' : '未找到相似资产，请改为新建或忽略'}
                              value={decision?.existing_entity_id}
                              onChange={(value) => updateCandidateDecision(candidate.candidate_id, { existing_entity_id: value })}
                              options={matches.map((match) => ({
                                value: match.entity_id,
                                label: `${match.name}（相似度 ${Math.round(match.score * 100)}%）`,
                              }))}
                            />
                          ) : null}
                          {action === 'create' ? (
                            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                              <Input
                                size="small"
                                disabled={importReadOnly}
                                addonBefore="名称"
                                value={decision?.edited_name ?? candidate.name}
                                onChange={(event) => updateCandidateDecision(candidate.candidate_id, { edited_name: event.target.value })}
                              />
                              <Input
                                size="small"
                                disabled={importReadOnly}
                                addonBefore="说明"
                                value={decision?.edited_description ?? candidate.description ?? ''}
                                onChange={(event) => updateCandidateDecision(candidate.candidate_id, { edited_description: event.target.value })}
                              />
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {(importAnalysis.shots?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Checkbox
                      checked={includeImportedShots}
                      disabled={importReadOnly}
                      onChange={(event) => {
                        setIncludeImportedShots(event.target.checked)
                        if (event.target.checked) setAutoDivideAfterImport(false)
                      }}
                    >
                      导入已审核镜头草稿（{importAnalysis.shots?.length ?? 0} 个，不调用图片/视频模型）
                    </Checkbox>
                    <Button size="small" disabled={importReadOnly} loading={importing} onClick={() => void handlePlanImportMedia()}>
                      按默认视频模型规划时长
                    </Button>
                  </div>
                  {importMediaPlan ? (
                    <Alert
                      type="info"
                      showIcon
                      message={`${importMediaPlan.model_name}：规划 ${importMediaPlan.items?.reduce((count, item) => count + (item.segment_seconds?.length ?? 0), 0) ?? 0} 个生成片段`}
                      description={(
                        <div className="space-y-1">
                          <div>
                            比例：{importMediaPlan.allowed_ratios?.join('、') || '由模型决定'}；
                            文生视频：{importMediaPlan.supports_text_to_video ? '支持' : '不支持'}；
                            首帧：{importMediaPlan.supports_first_frame ? '支持' : '不支持'}；
                            尾帧：{importMediaPlan.supports_last_frame ? '支持' : '不支持'}；
                            主体参考：{importMediaPlan.supports_subject_references ? '支持' : '不支持'}。
                          </div>
                          {importMediaPlan.items?.flatMap((item) => item.warnings ?? []).map((warning, index) => (
                            <div key={`${warning}-${index}`} className="text-amber-700">{warning}</div>
                          ))}
                          <div>确认导入时会按此模型重新校验并拆成合法片段；这里只做本地规划，不产生模型费用。</div>
                        </div>
                      )}
                    />
                  ) : null}
                </div>
              ) : null}
              {(importAnalysis.audio?.length ?? 0) > 0 ? (
                <Checkbox
                  checked={includeImportedDialogue}
                  disabled={!includeImportedShots || importReadOnly}
                  onChange={(event) => setIncludeImportedDialogue(event.target.checked)}
                >
                  同时导入对白/旁白到镜头（声音候选共 {importAnalysis.audio?.length ?? 0} 条）
                </Checkbox>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Checkbox
                disabled={importReadOnly}
                checked={selectedImportChapters.length === parsedImportChapters.length}
                indeterminate={selectedImportChapters.length > 0 && selectedImportChapters.length < parsedImportChapters.length}
                onChange={(event) => setSelectedImportChapters(
                  event.target.checked ? parsedImportChapters.map((chapter) => chapter.index) : [],
                )}
              >
                全选识别到的章节
              </Checkbox>
              <Button size="small" disabled={importReadOnly} loading={importing} onClick={() => void handleSaveImportReview()}>
                保存并稍后继续
              </Button>
            </div>
            <div className="max-h-[42vh] overflow-auto rounded border border-gray-200 divide-y">
              {parsedImportChapters.map((chapter) => (
                <div key={chapter.index} className="px-3 py-3">
                  <Checkbox
                    disabled={importReadOnly}
                    checked={selectedImportChapters.includes(chapter.index)}
                    onChange={(event) => setSelectedImportChapters((current) => event.target.checked
                      ? [...current, chapter.index].sort((a, b) => a - b)
                      : current.filter((index) => index !== chapter.index))}
                  >
                    <span className="font-medium">{chapter.index}. {importChapterEdits[chapter.index]?.title ?? chapter.title}</span>
                    {chapter.target_duration_seconds ? <Tag className="ml-2">{chapter.target_duration_seconds} 秒</Tag> : null}
                    {chapter.theme ? <Tag color="blue">{chapter.theme}</Tag> : null}
                  </Checkbox>
                  <div className="mt-2 ml-6 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      disabled={importReadOnly}
                      size="small"
                      addonBefore="标题"
                      value={importChapterEdits[chapter.index]?.title ?? chapter.title}
                      onChange={(event) => setImportChapterEdits((current) => ({
                        ...current,
                        [chapter.index]: { ...current[chapter.index], title: event.target.value },
                      }))}
                    />
                    <Input
                      disabled={importReadOnly}
                      size="small"
                      addonBefore="主题"
                      value={importChapterEdits[chapter.index]?.theme ?? chapter.theme ?? ''}
                      onChange={(event) => setImportChapterEdits((current) => ({
                        ...current,
                        [chapter.index]: { ...current[chapter.index], theme: event.target.value },
                      }))}
                    />
                  </div>
                  <TextArea
                    disabled={importReadOnly}
                    className="mt-2 ml-6"
                    style={{ width: 'calc(100% - 24px)' }}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    value={importChapterEdits[chapter.index]?.screenplay_text ?? chapter.screenplay_text}
                    onChange={(event) => setImportChapterEdits((current) => ({
                      ...current,
                      [chapter.index]: { ...current[chapter.index], screenplay_text: event.target.value },
                    }))}
                  />
                  {chapter.warnings?.length ? (
                    <Alert
                      className="mt-2 ml-6"
                      style={{ width: 'calc(100% - 24px)' }}
                      type={chapter.warnings.some((warning) => warning.includes('结构差异较大')) ? 'warning' : 'info'}
                      showIcon
                      message="解析质量提示"
                      description={chapter.warnings.map((warning) => <div key={warning}>{warning}</div>)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <Checkbox
          checked={autoDivideAfterImport}
          disabled={!selectedImportChapters.length || importing || includeImportedShots || importReadOnly}
          onChange={(event) => setAutoDivideAfterImport(event.target.checked)}
        >
          导入后自动启动 AI 分镜提取
        </Checkbox>
        {autoDivideAfterImport ? (
          <Alert
            type="warning"
            showIcon
            message="每个章节都会创建一个 AI 任务，并产生模型调用费用。角色、场景、道具、服装需在分镜完成后进入要素提取确认。"
          />
        ) : null}
      </div>
    </Modal>
  )

  const handlePrimaryAction = (record: Chapter) => {
    if (!projectId) return
    const activeTask = chapterDivisionTaskMap[record.id]
    if (activeTask) {
      navigate(getChapterShotsPath(projectId, record.id))
      return
    }
    const state = getChapterPreparationState(record)
    if (state.key === 'edit_raw') {
      openEditModal(record)
      return
    }
    if (state.key === 'extract_shots') {
      navigate(getChapterShotsPath(projectId, record.id))
      return
    }
    if (state.key === 'prepare_shots') {
      navigate(getChapterStudioPath(projectId, record.id))
      return
    }
    void ensureHasShotsBeforeShooting({
      projectId,
      chapterId: record.id,
      storyboardCount: record.storyboardCount,
      navigate,
    })
  }

  const handleDivideAsync = async (record: Chapter) => {
    const scriptText = record.rawText?.trim()
    if (!scriptText) {
      message.warning('请先补章节原文')
      return
    }
    setChapterDivisionActionId(record.id)
    try {
      await executeAsyncTaskCreate({
        request: () =>
          ScriptProcessingService.divideScriptAsyncApiV1ScriptProcessingDivideAsyncPost({
            requestBody: {
              chapter_id: record.id,
              script_text: scriptText,
              write_to_db: true,
            },
          }),
        trackTaskData: (data) => {
          const tracked = createRelationTaskState(data)
          setChapterDivisionTaskMap(upsertRelationTaskStateInMap(chapterDivisionTaskMap, record.id, tracked))
          return tracked
        },
        startedMessage: taskCopy.startedMessage,
        reusedMessage: taskCopy.reusedMessage,
        fallbackErrorMessage: '启动分镜提取失败',
      })
    } catch {
      // executeAsyncTaskCreate 已统一处理错误提示
    } finally {
      setChapterDivisionActionId(null)
    }
  }

  const handleCancelDivideTask = async (record: Chapter) => {
    const activeTask = chapterDivisionTaskMap[record.id]
    if (!activeTask) return
    setChapterDivisionActionId(record.id)
    try {
      await executeTaskCancel({
        taskId: activeTask.taskId,
        reason: '用户在章节页取消分镜提取',
        applyCancelData: (data) => {
          if (!data?.task_id || !data?.status) return null
          const tracked = createRelationTaskState(
            {
              task_id: data.task_id,
              status: data.status,
            },
            { cancelRequested: data.cancel_requested ?? false },
          )
          setChapterDivisionTaskMap(upsertRelationTaskStateInMap(chapterDivisionTaskMap, record.id, tracked))
          return tracked
        },
        cancelledImmediatelyMessage: taskCopy.cancelledImmediatelyMessage,
        cancelRequestedMessage: taskCopy.cancelRequestedMessage,
        fallbackErrorMessage: '取消任务失败',
      })
    } catch {
      // executeTaskCancel 已统一处理错误提示
    } finally {
      setChapterDivisionActionId(null)
    }
  }

  useEffect(() => {
    const nextTaskIds: string[] = []

    chapters.forEach((chapter) => {
      const task = chapterDivisionTaskMap[chapter.id]
      if (!task) return
      nextTaskIds.push(task.taskId)
      taskUiUpsert({
        taskId: task.taskId,
        title: taskCopy.title,
        sourceLabel: chapter.title ? `章节：${chapter.title}` : '项目工作台章节列表',
        status: task.status,
        progress: task.progress,
        cancelRequested: task.cancelRequested,
        startedAtTs: task.startedAtTs,
        finishedAtTs: task.finishedAtTs,
        elapsedMs: task.elapsedMs,
        onCancel: () => void handleCancelDivideTask(chapter),
        onNavigate: projectId ? () => navigate(getChapterShotsPath(projectId, chapter.id)) : null,
      })
    })

    syncedTaskIdsRef.current
      .filter((taskId) => !nextTaskIds.includes(taskId))
      .forEach((taskId) => taskUiRemove(taskId))

    syncedTaskIdsRef.current = nextTaskIds
  }, [chapterDivisionTaskMap, chapters, handleCancelDivideTask, navigate, projectId, taskCopy.title, taskUiRemove, taskUiUpsert])

  useEffect(() => {
    return () => {
      syncedTaskIdsRef.current.forEach((taskId) => taskUiRemove(taskId))
      syncedTaskIdsRef.current = []
    }
  }, [taskUiRemove])

  const buildActionMenuItems = (record: Chapter): MenuProps['items'] => {
    if (!projectId) return []
    const state = getChapterPreparationState(record)
    const activeTask = chapterDivisionTaskMap[record.id]
    return [
      {
        key: 'shots',
        label: '查看分镜',
        icon: <ScissorOutlined />,
        onClick: () => navigate(getChapterShotsPath(projectId, record.id)),
      },
      state.key !== 'prepare_shots' && (record.storyboardCount ?? 0) > 0
        ? {
            key: 'studio',
            label: '进入工作室',
            icon: <FileSearchOutlined />,
            onClick: () => navigate(getChapterStudioPath(projectId, record.id)),
          }
        : null,
      {
        key: 'info',
        label: '编辑章节信息',
        icon: <EditOutlined />,
        onClick: () => openInfoEditModal(record),
      },
      {
        key: 'raw',
        label: '编辑原文',
        icon: <EditOutlined />,
        onClick: () => openEditModal(record),
      },
      activeTask
        ? {
            key: 'cancel_divide',
            label: activeTask.cancelRequested ? '取消请求已发出' : '取消分镜提取',
            icon: <StopOutlined />,
            disabled: activeTask.cancelRequested || chapterDivisionActionId === record.id,
            onClick: () => void handleCancelDivideTask(record),
          }
        : null,
      {
        key: 'delete',
        label: '删除章节',
        icon: <DeleteOutlined />,
        danger: true,
        disabled: !!activeTask,
        onClick: () => handleDeleteChapter(record),
      },
    ].filter(Boolean)
  }

  const columns: TableColumnsType<Chapter> = [
    { title: '章节', dataIndex: 'index', key: 'index', width: 80, render: (v: number) => `第${v}集` },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, record) => (
        <Button
          type="link"
          size="small"
          style={{ paddingInline: 0 }}
          onClick={() => openInfoEditModal(record)}
        >
          {title || '未命名章节'}
        </Button>
      ),
    },
    { title: '分镜数', dataIndex: 'storyboardCount', key: 'storyboardCount', width: 90 },
    {
      title: '准备状态',
      key: 'preparation',
      width: 180,
      render: (_, record) => {
        const activeTask = chapterDivisionTaskMap[record.id]
        if (activeTask) {
          return (
            <div className="space-y-1">
              <Tag color={activeTask.cancelRequested ? 'orange' : 'processing'}>
                {activeTask.cancelRequested ? '正在取消提取' : '分镜提取中'}
              </Tag>
              <div className="text-[11px] text-gray-500 leading-5">
                {activeTask.cancelRequested ? '已请求取消，将在当前步骤结束后停止' : '系统正在异步提取当前章节分镜'}
              </div>
            </div>
          )
        }
        const state = getChapterPreparationState(record)
        return (
          <div className="space-y-1">
            <Tag color={state.color}>{state.text}</Tag>
            <div className="text-[11px] text-gray-500 leading-5">{state.hint}</div>
          </div>
        )
      },
    },
    {
      title: '分镜流转',
      key: 'shotFlow',
      width: 220,
      render: (_, record) => {
        const stats = chapterFlowMap[record.id]
        return (
          <div className="flex flex-wrap gap-1">
            <Tag bordered={false} color="gold" className="mr-0">
              待确认 {stats?.pendingConfirmShots ?? 0}
            </Tag>
            <Tag bordered={false} color="green" className="mr-0">
              已就绪 {stats?.readyShots ?? 0}
            </Tag>
            <Tag bordered={false} color="processing" className="mr-0">
              生成中 {stats?.generatingShots ?? 0}
            </Tag>
          </div>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: Chapter['status']) => (
        <Tag color={chapterStatusMap[status].color}>{chapterStatusMap[status].text}</Tag>
      ),
    },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 160 },
    {
      title: '操作',
      key: 'action',
      width: 230,
      render: (_, record) => {
        const state = getChapterPreparationState(record)
        const activeTask = chapterDivisionTaskMap[record.id]
        const primaryIcon = activeTask
          ? activeTask.cancelRequested
            ? <SyncOutlined spin />
            : <LoadingOutlined />
          : state.primaryIcon
        const primaryText = activeTask
          ? activeTask.cancelRequested
            ? '查看取消进度'
            : '查看提取进度'
          : state.primaryAction
        const primaryLoading = chapterDivisionActionId === record.id && state.key === 'extract_shots' && !activeTask

        return (
          <Space size={8}>
            <Button
              type="primary"
              size="small"
              onClick={() => {
                if (state.key === 'extract_shots' && !activeTask) {
                  void handleDivideAsync(record)
                  return
                }
                handlePrimaryAction(record)
              }}
              style={{ minWidth: 132, justifyContent: 'center' }}
              icon={primaryIcon}
              loading={primaryLoading}
            >
              {primaryText}
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{ items: buildActionMenuItems(record) }}
            >
              <Button
                size="small"
                icon={<MoreOutlined />}
                aria-label="更多操作"
                loading={chapterDivisionActionId === record.id && !!activeTask}
              />
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  if (chapters.length === 0 && !loading) {
    return (
      <>
        <Card>
          <Empty description="还没有任何章节，立即创建第一章吧" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Space>
            <Button size="large" icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
              导入剧本
            </Button>
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              创建第一章
            </Button>
          </Space>
        </Empty>
        </Card>
        <Modal
          title="新建章节"
          open={createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={useMock ? handleCreateChapterMock : handleCreateChapter}
          okText="创建"
          width={560}
        >
          <div className="space-y-3">
            <div>
              <span className="text-gray-600 text-sm">章节标题</span>
              <Input
                placeholder="例如：第1集 出租屋里的争吵"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <span className="text-gray-600 text-sm">章节内容（可粘贴剧本）</span>
              <TextArea
                rows={6}
                placeholder="粘贴文学剧本..."
                value={createContent}
                onChange={(e) => setCreateContent(e.target.value)}
                className="mt-1 font-mono text-sm"
              />
            </div>
          </div>
        </Modal>
        {scriptImportModal}
      </>
    )
  }

  return (
    <Card
      className="h-full min-h-0 flex flex-col"
      bodyStyle={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
      title="章节列表"
      extra={
        <Space>
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
            导入剧本
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建章节
          </Button>
        </Space>
      }
    >
      <div className="flex-1 min-h-0 overflow-auto">
        <Table<Chapter>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={pagedChapters}
          pagination={false}
          size="small"
        />
      </div>

      <div className="shrink-0 mt-3 pt-3 border-t border-gray-100 bg-white flex justify-end overflow-x-auto">
        <Pagination
          current={chapterPage}
          pageSize={chapterPageSize}
          total={chapters.length}
          showSizeChanger
          showQuickJumper
          pageSizeOptions={[10, 20, 50, 100]}
          showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 个章节`}
          onChange={(page, pageSize) => {
            setChapterPage(page)
            setChapterPageSize(pageSize)
          }}
        />
      </div>

      <ChapterRawTextEditorModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false)
          setEditingChapter(null)
        }}
        chapterId={editingChapter?.id}
        onSaved={(next) => {
          if (editingChapter?.id && typeof next.rawText === 'string') {
            patchChapterLocal(editingChapter.id, { rawText: next.rawText })
          }
          void refresh()
        }}
      />

      <Modal
        title="新建章节"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={useMock ? handleCreateChapterMock : handleCreateChapter}
        okText="创建"
        width={560}
      >
        <div className="space-y-3">
          <div>
            <span className="text-gray-600 text-sm">章节标题</span>
            <Input
              placeholder="例如：第1集 出租屋里的争吵"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <span className="text-gray-600 text-sm">章节内容（可粘贴剧本）</span>
            <TextArea
              rows={6}
              placeholder="粘贴文学剧本..."
              value={createContent}
              onChange={(e) => setCreateContent(e.target.value)}
              className="mt-1 font-mono text-sm"
            />
          </div>
        </div>
      </Modal>
      {scriptImportModal}
      <Modal
        title="编辑章节信息"
        open={infoEditOpen}
        onCancel={() => {
          if (infoSaving) return
          setInfoEditOpen(false)
          setInfoEditingChapter(null)
        }}
        onOk={() => void handleSaveChapterInfo()}
        okText="保存"
        confirmLoading={infoSaving}
      >
        <div className="space-y-3">
          <div>
            <div className="text-sm text-gray-600 mb-1">章节标题</div>
            <Input value={infoTitle} onChange={(event) => setInfoTitle(event.target.value)} />
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">章节摘要</div>
            <TextArea rows={4} value={infoSummary} onChange={(event) => setInfoSummary(event.target.value)} />
          </div>
        </div>
      </Modal>
    </Card>
  )
}
