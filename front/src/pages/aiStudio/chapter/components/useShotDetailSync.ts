import { useEffect, useRef, useState } from 'react'
import { StudioShotDetailsService, type ShotDetailRead } from '../../../../services/generated'

type Patch = Partial<ShotDetailRead>
type Entry = { detail: ShotDetailRead | null; pending: Patch; running: Promise<void> | null; timer: ReturnType<typeof setTimeout> | null; error: string }

/** 按镜头串行保存字段，迟到回包只确认已提交字段，不覆盖其他标签页的新编辑。 */
export class ShotDetailDraftStore {
  private entries = new Map<string, Entry>()
  revision = 0
  /** 注入通知与实际写入函数，使业务保存和离线并发验证共用同一实现。 */
  constructor(private changed: () => void, private write: (id: string, patch: Patch) => Promise<ShotDetailRead>) {}
  /** 所有排队任务绑定原镜头，切换页面后仍不能写入新镜头。 */
  entry(id: string): Entry {
    if (!this.entries.has(id)) this.entries.set(id, { detail: null, pending: {}, running: null, timer: null, error: '' })
    return this.entries.get(id)!
  }
  /** 刷新服务器快照时保留尚未确认的本地字段。 */
  load(id: string, detail: ShotDetailRead | null) {
    const entry = this.entry(id)
    entry.detail = detail ? { ...detail, ...entry.pending } : null
    this.revision++; this.changed()
  }
  /** 即时更新所有标签页的共同草稿；仅延迟网络保存，不延迟显示。 */
  patch(id: string, patch: Patch) {
    const entry = this.entry(id)
    if (!entry.detail || entry.detail.id !== id) throw new Error('镜头详情尚未加载，请稍后再试')
    entry.detail = { ...entry.detail, ...patch }
    entry.pending = { ...entry.pending, ...patch }; entry.error = ''
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => { entry.timer = null; void this.flush(id).catch(() => {}) }, 700)
    this.changed()
  }
  /** 等待所有当前编辑提交成功；失败保留草稿，生成必须停止，不能按旧参数继续。 */
  async flush(id: string): Promise<ShotDetailRead> {
    const entry = this.entry(id)
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null }
    if (entry.running) await entry.running
    if (Object.keys(entry.pending).length) {
      entry.running = (async () => {
        try {
          while (Object.keys(entry.pending).length) {
            const sent = { ...entry.pending }
            const response = await this.write(id, sent)
            if (response.id !== id) throw new Error('保存响应镜头不匹配')
            for (const field of Object.keys(sent) as (keyof ShotDetailRead)[]) {
              // 同字段在请求途中再次编辑时，保留新值并继续下一次串行保存。
              if (JSON.stringify(entry.pending[field]) === JSON.stringify(sent[field])) {
                delete entry.pending[field]
                entry.detail = { ...entry.detail!, [field]: response[field] }
              }
            }
            entry.error = ''; this.revision++; this.changed()
          }
        } catch (error) {
          entry.error = '镜头设置保存失败，请重试保存后再生成'; this.changed(); throw error
        }
      })()
      this.changed()
      try { await entry.running } finally { entry.running = null; this.changed() }
    }
    if (!entry.detail) throw new Error('镜头详情尚未加载')
    return entry.detail
  }
}

/** 工作室共享保存队列；卸载不取消已授权的编辑保存，只停止回写已卸载组件。 */
export function useShotDetailSync(shotId: string | null) {
  const [, render] = useState(0)
  const mounted = useRef(true)
  const storeRef = useRef<ShotDetailDraftStore | null>(null)
  if (!storeRef.current) storeRef.current = new ShotDetailDraftStore(() => { if (mounted.current) render(n => n + 1) }, async (id, patch) => {
    const result = await StudioShotDetailsService.updateShotDetailApiV1StudioShotDetailsShotIdPatch({ shotId: id, requestBody: patch })
    if (!result.data) throw new Error('保存未返回镜头详情')
    return result.data
  })
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const store = storeRef.current
  const entry = store.entry(shotId || '')
  return { store, shotDetail: entry.detail, saving: !!entry.running || Object.keys(entry.pending).length > 0, error: entry.error, revision: store.revision }
}
