import { Badge, Button, Card, Empty, message, Modal, Progress, Segmented, Select, Spin, Tag } from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  PushpinOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TaskListItemRead, TaskStatus } from '../../../services/generated'
import { FilmService } from '../../../services/generated'
import type { TaskUiItem } from './taskUiStore'
import {
  flattenPageContexts,
  isTaskHighlighted,
  mergeTaskUiItems,
  useTaskUiStore,
} from './taskUiStore'
import { useResolvedTaskCenterTasks } from './taskCenterMeta'
import { TASK_KIND_TITLE_MAP } from './taskCopy'
import { defaultTaskActionErrorMessage } from './taskActionHelpers'

const TASK_CENTER_OPEN_STORAGE_KEY = 'jellyfish_task_center_open_v1'
const TASK_CENTER_POSITION_STORAGE_KEY = 'jellyfish_task_center_position_v1'
const TASK_CENTER_EDGE_PADDING = 20
const TASK_CENTER_BUTTON_WIDTH = 132
const TASK_CENTER_BUTTON_HEIGHT = 40
const TASK_CENTER_PANEL_WIDTH = 520
const TASK_CENTER_PANEL_HEIGHT = 640
const TASK_CENTER_PANEL_GAP = 12
const TASK_CENTER_PAGE_SIZE = 4
const TERMINAL_TASK_STATUSES: TaskStatus[] = ['succeeded', 'failed', 'cancelled']
const ALL_TASK_STATUSES: TaskStatus[] = ['pending', 'running', 'streaming', ...TERMINAL_TASK_STATUSES]

function getDefaultButtonPosition() {
  if (typeof window === 'undefined') {
    return { x: TASK_CENTER_EDGE_PADDING, y: 520 }
  }
  return {
    x: TASK_CENTER_EDGE_PADDING,
    y: Math.max(
      TASK_CENTER_EDGE_PADDING,
      window.innerHeight - TASK_CENTER_BUTTON_HEIGHT - TASK_CENTER_EDGE_PADDING,
    ),
  }
}

function getButtonBounds() {
  if (typeof window === 'undefined') {
    return {
      minX: TASK_CENTER_EDGE_PADDING,
      maxX: TASK_CENTER_EDGE_PADDING,
      minY: TASK_CENTER_EDGE_PADDING,
      maxY: 520,
    }
  }
  return {
    minX: TASK_CENTER_EDGE_PADDING,
    maxX: Math.max(
      TASK_CENTER_EDGE_PADDING,
      window.innerWidth - TASK_CENTER_BUTTON_WIDTH - TASK_CENTER_EDGE_PADDING,
    ),
    minY: TASK_CENTER_EDGE_PADDING,
    maxY: Math.max(
      TASK_CENTER_EDGE_PADDING,
      window.innerHeight - TASK_CENTER_BUTTON_HEIGHT - TASK_CENTER_EDGE_PADDING,
    ),
  }
}

function clampButtonPosition(position: { x: number; y: number }) {
  const bounds = getButtonBounds()
  return {
    x: Math.max(bounds.minX, Math.min(position.x, bounds.maxX)),
    y: Math.max(bounds.minY, Math.min(position.y, bounds.maxY)),
  }
}

function snapButtonPosition(position: { x: number; y: number }) {
  const bounds = getButtonBounds()
  const middleX = (bounds.minX + bounds.maxX) / 2
  return {
    x: position.x <= middleX ? bounds.minX : bounds.maxX,
    y: Math.max(bounds.minY, Math.min(position.y, bounds.maxY)),
  }
}

function formatElapsedMs(elapsedMs?: number | null): string | null {
  if (elapsedMs == null || elapsedMs < 0) return null
  const totalSeconds = Math.floor(elapsedMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return remainMinutes > 0 ? `${hours} 小时 ${remainMinutes} 分` : `${hours} 小时`
}

function formatStartedAt(startedAtTs?: number | null): string | null {
  if (!startedAtTs) return null
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(startedAtTs * 1000))
}

function taskTone(task: TaskUiItem): { color: string; label: string } {
  if (task.status === 'cancelled') return { color: 'orange', label: '已取消' }
  if (task.status === 'failed') return { color: 'red', label: '失败' }
  if (task.status === 'succeeded') return { color: 'green', label: '已完成' }
  if (task.cancelRequested) return { color: 'orange', label: '取消中' }
  if (task.status === 'streaming' || task.status === 'running') return { color: 'blue', label: '进行中' }
  return { color: 'default', label: '等待中' }
}

export function TaskCenter() {
  const navigate = useNavigate()
  const [scopeFilter, setScopeFilter] = useState<'all' | 'current' | 'active' | 'settled'>('active')
  const [taskKindFilter, setTaskKindFilter] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [historyItems, setHistoryItems] = useState<TaskListItemRead[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [buttonPosition, setButtonPosition] = useState(getDefaultButtonPosition)
  const [dragging, setDragging] = useState(false)
  const open = useTaskUiStore((state) => state.open)
  const setOpen = useTaskUiStore((state) => state.setOpen)
  const toggleOpen = useTaskUiStore((state) => state.toggleOpen)
  const serverItems = useTaskUiStore((state) => state.serverItems)
  const optimisticItems = useTaskUiStore((state) => state.optimisticItems)
  const contextScopes = useTaskUiStore((state) => state.contextScopes)
  const cancelTask = useTaskUiStore((state) => state.cancelTask)
  const dragStateRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const defaultPosition = getDefaultButtonPosition()
    try {
      setOpen(window.localStorage.getItem(TASK_CENTER_OPEN_STORAGE_KEY) === '1')
      const rawPosition = window.localStorage.getItem(TASK_CENTER_POSITION_STORAGE_KEY)
      if (!rawPosition) {
        setButtonPosition(defaultPosition)
        return
      }
      const parsed = JSON.parse(rawPosition) as { x?: number; y?: number }
      const x = Number.isFinite(parsed?.x) ? Number(parsed.x) : defaultPosition.x
      const y = Number.isFinite(parsed?.y) ? Number(parsed.y) : defaultPosition.y
      setButtonPosition({ x, y })
    } catch {
      setOpen(false)
      setButtonPosition(defaultPosition)
    }
  }, [setOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TASK_CENTER_OPEN_STORAGE_KEY, open ? '1' : '0')
  }, [open])

  useEffect(() => {
    if (!open) return
    setScopeFilter('active')
    setTaskKindFilter(undefined)
    setPage(1)
  }, [open])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TASK_CENTER_POSITION_STORAGE_KEY, JSON.stringify(buttonPosition))
  }, [buttonPosition])

  useEffect(() => {
    const clampPosition = () => {
      if (typeof window === 'undefined') return
      setButtonPosition((prev) => snapButtonPosition(clampButtonPosition(prev)))
    }
    clampPosition()
    window.addEventListener('resize', clampPosition)
    return () => {
      window.removeEventListener('resize', clampPosition)
    }
  }, [])

  const tasks = useMemo(
    () =>
      mergeTaskUiItems(serverItems, optimisticItems).sort((a, b) => {
        const activeContexts = flattenPageContexts(contextScopes)
        const priority = (task: TaskUiItem): number => {
          if (isTaskHighlighted(task, activeContexts)) return 4
          if (task.cancelRequested) return 3
          if (task.status === 'running' || task.status === 'streaming') return 2
          if (task.status === 'pending') return 1
          return 0
        }
        const priorityDelta = priority(b) - priority(a)
        if (priorityDelta !== 0) return priorityDelta
        const aTs = a.startedAtTs ?? 0
        const bTs = b.startedAtTs ?? 0
        return bTs - aTs
      }),
    [contextScopes, optimisticItems, serverItems],
  )
  const activeContexts = useMemo(() => flattenPageContexts(contextScopes), [contextScopes])
  const resolvedTasks = useResolvedTaskCenterTasks(tasks, navigate)
  const taskKindOptions = useMemo(
    () => Object.entries(TASK_KIND_TITLE_MAP).map(([taskKind, title]) => ({ label: title, value: taskKind })),
    [],
  )
  const summaryCounts = useMemo(
    () => ({
      current: resolvedTasks.filter((task) => isTaskHighlighted(task, activeContexts)).length,
      active: resolvedTasks.filter((task) => ['pending', 'running', 'streaming'].includes(task.status)).length,
      settled: resolvedTasks.filter((task) => ['succeeded', 'failed', 'cancelled'].includes(task.status)).length,
    }),
    [activeContexts, resolvedTasks],
  )
  const effectiveScopeFilter = scopeFilter
  const usesServerHistory = open && (effectiveScopeFilter === 'all' || effectiveScopeFilter === 'settled')

  useEffect(() => {
    if (!usesServerHistory) {
      setHistoryLoading(false)
      return
    }
    let cancelled = false
    setHistoryLoading(true)
    const statuses = effectiveScopeFilter === 'settled' ? TERMINAL_TASK_STATUSES : ALL_TASK_STATUSES
    void FilmService.listTasksApiV1FilmTasksGet({
      statuses,
      taskKind: taskKindFilter,
      page,
      pageSize: TASK_CENTER_PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return
        setHistoryItems(res.data?.items ?? [])
        setHistoryTotal(res.data?.pagination.total ?? 0)
      })
      .catch(() => {
        if (cancelled) return
        setHistoryItems([])
        setHistoryTotal(0)
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [effectiveScopeFilter, page, taskKindFilter, usesServerHistory])

  const historyTasks = useMemo(
    () => mergeTaskUiItems(Object.fromEntries(historyItems.map((task) => [task.task_id, task])), {}),
    [historyItems],
  )
  const resolvedHistoryTasks = useResolvedTaskCenterTasks(historyTasks, navigate)
  const filteredTasks = useMemo(
    () =>
      resolvedTasks.filter((task) => {
        if (effectiveScopeFilter === 'current' && !isTaskHighlighted(task, activeContexts)) return false
        if (effectiveScopeFilter === 'active' && !['pending', 'running', 'streaming'].includes(task.status)) return false
        if (effectiveScopeFilter === 'settled' && !['succeeded', 'failed', 'cancelled'].includes(task.status)) return false
        if (taskKindFilter && task.taskKind !== taskKindFilter) return false
        return true
      }),
    [activeContexts, effectiveScopeFilter, resolvedTasks, taskKindFilter],
  )
  const displayedTasks = usesServerHistory ? resolvedHistoryTasks : filteredTasks
  const displayedTotal = usesServerHistory ? historyTotal : filteredTasks.length
  const totalPages = Math.max(1, Math.ceil(displayedTotal / TASK_CENTER_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedTasks = useMemo(
    () =>
      usesServerHistory
        ? displayedTasks
        : displayedTasks.slice((currentPage - 1) * TASK_CENTER_PAGE_SIZE, currentPage * TASK_CENTER_PAGE_SIZE),
    [currentPage, displayedTasks, usesServerHistory],
  )
  const groupedTasks = useMemo(() => {
    if (effectiveScopeFilter !== 'all') {
      return [{ key: effectiveScopeFilter, title: null as string | null, tasks: pagedTasks }]
    }
    const currentTasks = pagedTasks.filter((task) => isTaskHighlighted(task, activeContexts))
    const activeTasks = pagedTasks.filter(
      (task) => !isTaskHighlighted(task, activeContexts) && ['pending', 'running', 'streaming'].includes(task.status),
    )
    const settledTasks = pagedTasks.filter(
      (task) => !isTaskHighlighted(task, activeContexts) && ['succeeded', 'failed', 'cancelled'].includes(task.status),
    )
    const otherTasks = pagedTasks.filter(
      (task) =>
        !isTaskHighlighted(task, activeContexts) &&
        !['pending', 'running', 'streaming', 'succeeded', 'failed', 'cancelled'].includes(task.status),
    )
    return [
      { key: 'current', title: currentTasks.length > 0 ? `当前页 ${currentTasks.length}` : null, tasks: currentTasks },
      { key: 'active', title: activeTasks.length > 0 ? `运行中 ${activeTasks.length}` : null, tasks: activeTasks },
      { key: 'settled', title: settledTasks.length > 0 ? `最近结束 ${settledTasks.length}` : null, tasks: settledTasks },
      { key: 'all', title: otherTasks.length > 0 ? `全部 ${otherTasks.length}` : null, tasks: otherTasks },
    ].filter((group) => group.tasks.length > 0)
  }, [activeContexts, effectiveScopeFilter, pagedTasks])
  const panelStyle = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        left: TASK_CENTER_EDGE_PADDING,
        top: TASK_CENTER_EDGE_PADDING,
        width: TASK_CENTER_PANEL_WIDTH,
        height: TASK_CENTER_PANEL_HEIGHT,
      }
    }
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const panelWidth = Math.min(TASK_CENTER_PANEL_WIDTH, viewportWidth - TASK_CENTER_EDGE_PADDING * 2)
    const panelHeight = Math.max(
      320,
      Math.min(TASK_CENTER_PANEL_HEIGHT, viewportHeight - TASK_CENTER_EDGE_PADDING * 2),
    )
    const preferTop = buttonPosition.y - TASK_CENTER_PANEL_GAP - panelHeight
    const preferBottom = buttonPosition.y + TASK_CENTER_BUTTON_HEIGHT + TASK_CENTER_PANEL_GAP
    const hasSpaceAbove = preferTop >= TASK_CENTER_EDGE_PADDING
    const rawTop = hasSpaceAbove
      ? preferTop
      : Math.min(
          preferBottom,
          Math.max(TASK_CENTER_EDGE_PADDING, viewportHeight - panelHeight - TASK_CENTER_EDGE_PADDING),
        )
    const alignedLeft = buttonPosition.x
    const alignedRight = buttonPosition.x + TASK_CENTER_BUTTON_WIDTH - panelWidth
    const rawLeft = alignedLeft + panelWidth <= viewportWidth - TASK_CENTER_EDGE_PADDING ? alignedLeft : alignedRight
    return {
      left: Math.max(
        TASK_CENTER_EDGE_PADDING,
        Math.min(rawLeft, viewportWidth - panelWidth - TASK_CENTER_EDGE_PADDING),
      ),
      top: Math.max(
        TASK_CENTER_EDGE_PADDING,
        Math.min(rawTop, viewportHeight - panelHeight - TASK_CENTER_EDGE_PADDING),
      ),
      width: panelWidth,
      height: panelHeight,
    }
  }, [buttonPosition.x, buttonPosition.y])

  const handleButtonPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleButtonPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const nextX = event.clientX - drag.offsetX
    const nextY = event.clientY - drag.offsetY
    drag.moved = true
    setButtonPosition(clampButtonPosition({ x: nextX, y: nextY }))
  }

  const handleButtonPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setButtonPosition((prev) => snapButtonPosition(prev))
    setDragging(false)
  }

  const handleButtonClick = () => {
    const drag = dragStateRef.current
    if (drag?.moved) {
      dragStateRef.current = null
      return
    }
    dragStateRef.current = null
    toggleOpen()
  }

  const showFailureReason = async (task: TaskUiItem) => {
    /** 按需读取任务结果，避免任务列表承载大结果或错误堆栈。 */
    try {
      const response = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId: task.taskId })
      const error = response.data?.error?.trim() || '该任务未记录具体失败原因，请结合服务日志定位。'
      Modal.error({
        title: '任务失败原因',
        width: 620,
        content: (
          <div className="space-y-3">
            <div className="text-sm text-gray-500">{task.title} · {task.taskId}</div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-xs text-gray-700">
              {error}
            </pre>
          </div>
        ),
        okText: '关闭',
      })
    } catch (error) {
      message.error(defaultTaskActionErrorMessage(error, '读取任务失败原因失败'))
    }
  }

  return (
    <div
      className={`fixed z-[1200] pointer-events-none ${dragging ? '' : 'transition-[left,top] duration-200 ease-out'}`}
      style={{ left: buttonPosition.x, top: buttonPosition.y }}
    >
      {open ? (
        <div
          className={`fixed pointer-events-auto ${dragging ? '' : 'transition-[left,top] duration-200 ease-out'}`}
          style={{
            left: panelStyle.left,
            top: panelStyle.top,
            width: panelStyle.width,
            height: panelStyle.height,
          }}
        >
          <Card
            title="任务中心"
            size="small"
            className="shadow-lg"
            style={{ height: '100%', borderRadius: 14, overflow: 'hidden' }}
            extra={
              <Button size="small" type="text" onClick={() => setOpen(false)}>
                收起
              </Button>
            }
            bodyStyle={{ height: 'calc(100% - 46px)', overflow: 'hidden', padding: 0, position: 'relative' }}
          >
            <div className="flex h-full min-h-0 flex-col">
              {usesServerHistory && historyLoading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
                  <Spin tip="正在加载任务" />
                </div>
              ) : null}
              <div className="shrink-0 border-b border-gray-100 px-4 pb-3 pt-4">
                <div className="flex flex-col gap-2">
                  <Segmented
                    size="small"
                    value={scopeFilter}
                    onChange={(value) => {
                      setScopeFilter(value as 'all' | 'current' | 'active' | 'settled')
                      setPage(1)
                    }}
                    options={[
                      { label: `当前页面 ${summaryCounts.current}`, value: 'current' },
                      { label: `未结束 ${summaryCounts.active}`, value: 'active' },
                      {
                        label: `已结束 ${effectiveScopeFilter === 'settled' && usesServerHistory ? historyTotal : summaryCounts.settled}`,
                        value: 'settled',
                      },
                      { label: '全部', value: 'all' },
                    ]}
                  />
                  <Select
                    size="small"
                    allowClear
                    dropdownStyle={{ zIndex: 1301 }}
                    placeholder="按任务类型筛选"
                    value={taskKindFilter}
                    onChange={(value) => {
                      setTaskKindFilter(value)
                      setPage(1)
                    }}
                    options={taskKindOptions}
                  />
                  <div className="text-[11px] text-gray-400">
                    任务范围：未结束含等待中、进行中、取消中；已结束含已完成、失败、已取消 · 每页最多 4 条
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]">
                {displayedTasks.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有任务记录" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupedTasks.map((group) => (
                      <div key={group.key} className="space-y-2">
                        {group.title ? <div className="text-[11px] font-medium text-gray-400">{group.title}</div> : null}
                        {group.tasks.map((task) => {
                      const tone = taskTone(task)
                      const elapsed = formatElapsedMs(task.elapsedMs)
                      const startedAt = formatStartedAt(task.startedAtTs)
                      const highlighted = isTaskHighlighted(task, activeContexts)
                      return (
                        <div
                          key={task.taskId}
                          className={`rounded-lg border px-3 py-2 ${
                            highlighted ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{task.title}</div>
                              {task.sourceLabel ? <div className="mt-1 text-xs text-gray-500 truncate">{task.sourceLabel}</div> : null}
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                                {highlighted ? <Tag color="blue">当前页面</Tag> : null}
                                <Tag color={tone.color}>{tone.label}</Tag>
                                <span>进度 {Math.max(0, Math.min(100, Math.round(task.progress)))}%</span>
                                {elapsed ? <span>耗时 {elapsed}</span> : null}
                              </div>
                              {startedAt ? <div className="mt-1 text-xs text-gray-400">开始于 {startedAt}</div> : null}
                            </div>
                            <div className="flex flex-col gap-2">
                              {task.status === 'failed' ? (
                                <Button
                                  size="small"
                                  icon={<InfoCircleOutlined />}
                                  onClick={() => void showFailureReason(task)}
                                >
                                  失败原因
                                </Button>
                              ) : null}
                              {task.onNavigate ? (
                                <Button
                                  size="small"
                                  icon={<ArrowRightOutlined />}
                                  onClick={() => {
                                    task.onNavigate?.()
                                    setOpen(false)
                                  }}
                                >
                                  查看
                                </Button>
                              ) : null}
                              {['pending', 'running', 'streaming'].includes(task.status) && task.onCancel ? (
                                <Button
                                  size="small"
                                  danger
                                  icon={<CloseCircleOutlined />}
                                  disabled={task.cancelRequested}
                                  onClick={task.onCancel}
                                >
                                  {task.cancelRequested ? '正在取消' : '取消'}
                                </Button>
                              ) : task.status === 'pending' || task.status === 'running' || task.status === 'streaming' ? (
                                <Button
                                  size="small"
                                  danger
                                  icon={<CloseCircleOutlined />}
                                  disabled={task.cancelRequested}
                                  onClick={() => {
                                    void cancelTask(task.taskId)
                                  }}
                                >
                                  {task.cancelRequested ? '正在取消' : '取消'}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <Progress
                            percent={Math.max(0, Math.min(100, Math.round(task.progress)))}
                            size="small"
                            status={
                              task.cancelRequested || task.status === 'failed'
                                ? 'exception'
                                : task.status === 'succeeded'
                                  ? 'success'
                                  : 'active'
                            }
                            showInfo={false}
                            className="mt-2"
                          />
                        </div>
                      )
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex h-12 shrink-0 items-center justify-between border-t border-gray-100 bg-gray-50/80 px-4 text-xs text-gray-500">
                <span>共 {displayedTotal} 条</span>
                <div className="flex items-center gap-1">
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowLeftOutlined />}
                      aria-label="上一页"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    />
                    <span className="min-w-[32px] text-center">{currentPage}/{totalPages}</span>
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowRightOutlined />}
                      aria-label="下一页"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    />
                  </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      <Badge count={tasks.length} size="small" offset={[-4, 4]} showZero={false}>
        <Button
          type="primary"
          size="middle"
          shape="round"
          icon={<UnorderedListOutlined />}
          onClick={handleButtonClick}
          onPointerDown={handleButtonPointerDown}
          onPointerMove={handleButtonPointerMove}
          onPointerUp={handleButtonPointerUp}
          onPointerCancel={handleButtonPointerUp}
          className="shadow-lg pointer-events-auto touch-none select-none"
        >
          <span className="inline-flex items-center gap-1">
            <span>{open ? '收起任务' : '任务中心'}</span>
            <PushpinOutlined className="text-[11px] opacity-70" />
          </span>
        </Button>
      </Badge>
    </div>
  )
}
