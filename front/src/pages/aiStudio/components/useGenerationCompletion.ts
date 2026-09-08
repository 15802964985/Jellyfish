import { useEffect, useRef } from 'react'
import { FilmService } from '../../../services/generated'
import type { TaskStatusRead } from '../../../services/generated'

/** Follow an explicitly submitted task until terminal, without a one-minute cutoff.
 * Poll only active submissions, retry transient reads, and stop on unmount/task change.
 */
export function useGenerationCompletion(
  taskId: string | null | undefined,
  onStatus: (status: TaskStatusRead) => void,
  onSettled: (status: TaskStatusRead) => Promise<void>,
) {
  const callbacks = useRef({ onStatus, onSettled })
  callbacks.current = { onStatus, onSettled }
  useEffect(() => {
    if (!taskId) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const response = await FilmService.getTaskStatusApiV1FilmTasksTaskIdStatusGet({ taskId })
        if (disposed) return
        const status = response.data
        if (status) {
          if (['succeeded', 'failed', 'cancelled'].includes(status.status)) {
            // Refresh before releasing tracking, so a failed refresh is retried.
            await callbacks.current.onSettled(status)
            return
          }
          callbacks.current.onStatus(status)
        }
      } catch {
        // A temporary status/read failure must not abandon a billable generation.
      }
      if (!disposed) timer = setTimeout(() => void poll(), 10_000)
    }
    void poll()
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [taskId])
}
