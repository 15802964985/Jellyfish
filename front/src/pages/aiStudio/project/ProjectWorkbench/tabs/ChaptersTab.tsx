import { useState, useEffect, useMemo, useRef } from 'react'
import { Alert, Card, Button, Checkbox, Tag, Space, Table, Empty, Modal, Input, Dropdown, Upload, Pagination, message } from 'antd'
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
  StudioChaptersService,
  StudioFilesService,
  StudioScriptImportsService,
  type ScriptImportRead,
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
  const [selectedImportChapters, setSelectedImportChapters] = useState<number[]>([])
  const [importChapterEdits, setImportChapterEdits] = useState<Record<number, ImportChapterEdit>>({})
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
        },
      })
      const chapterIds = committed.data?.chapter_ids ?? []
      if (autoDivideAfterImport) {
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
          },
        },
      })
      if (response.data) setImportBatch(response.data)
      message.success('导入预览草稿已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存导入预览失败')
    } finally {
      setImporting(false)
    }
  }

  const scriptImportModal = (
    <Modal
      title="导入剧本"
      open={importOpen}
      onCancel={() => {
        if (importing) return
        setImportOpen(false)
        setImportBatch(null)
        setSelectedImportChapters([])
        setImportChapterEdits({})
      }}
      onOk={() => void handleImportScripts()}
      okText={`确认导入${selectedImportChapters.length ? ` ${selectedImportChapters.length} 个章节` : ''}`}
      okButtonProps={{ disabled: !selectedImportChapters.length }}
      confirmLoading={importing}
      closable={!importing}
      maskClosable={!importing}
      width={900}
    >
      <div className="space-y-4">
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
              const savedOverrides = (created.data.review_state?.chapter_overrides ?? {}) as Record<string, Partial<ImportChapterEdit>>
              const savedSelection = created.data.review_state?.selected_chapter_indexes
              setImportBatch(created.data)
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
              message.success(`本地解析完成：识别到 ${parsedChapters.length} 个章节`)
            } catch (error) {
              setImportBatch(null)
              setSelectedImportChapters([])
              setImportChapterEdits({})
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
            <div className="flex items-center justify-between gap-3">
              <Checkbox
                checked={selectedImportChapters.length === parsedImportChapters.length}
                indeterminate={selectedImportChapters.length > 0 && selectedImportChapters.length < parsedImportChapters.length}
                onChange={(event) => setSelectedImportChapters(
                  event.target.checked ? parsedImportChapters.map((chapter) => chapter.index) : [],
                )}
              >
                全选识别到的章节
              </Checkbox>
              <Button size="small" loading={importing} onClick={() => void handleSaveImportReview()}>
                保存预览草稿
              </Button>
            </div>
            <div className="max-h-[42vh] overflow-auto rounded border border-gray-200 divide-y">
              {parsedImportChapters.map((chapter) => (
                <div key={chapter.index} className="px-3 py-3">
                  <Checkbox
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
                      size="small"
                      addonBefore="标题"
                      value={importChapterEdits[chapter.index]?.title ?? chapter.title}
                      onChange={(event) => setImportChapterEdits((current) => ({
                        ...current,
                        [chapter.index]: { ...current[chapter.index], title: event.target.value },
                      }))}
                    />
                    <Input
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
                    className="mt-2 ml-6"
                    style={{ width: 'calc(100% - 24px)' }}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    value={importChapterEdits[chapter.index]?.screenplay_text ?? chapter.screenplay_text}
                    onChange={(event) => setImportChapterEdits((current) => ({
                      ...current,
                      [chapter.index]: { ...current[chapter.index], screenplay_text: event.target.value },
                    }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <Checkbox
          checked={autoDivideAfterImport}
          disabled={!selectedImportChapters.length || importing}
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
