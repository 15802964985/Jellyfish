import { Alert, Button, Input, Tag } from 'antd'
import type { ShotVideoPromptPackRead } from '../../../../services/generated'

/** 将可编辑稿、系统增补与本次提交稿并排呈现；旧预览不能冒充当前发送内容。 */
export function VideoPromptWorkbench({ draft, finalPrompt, fresh, loading, disabled, error, onChange, onRefresh }: {
  draft: string; finalPrompt: string; fresh: boolean; loading: boolean; disabled: boolean; error?: string | null
  onChange: (text: string) => void; onRefresh: () => void
}) {
  // 当前编译器保留原稿并在末尾补充；不是前缀时只展示完整稿，不猜测语义差异。
  const base = draft.trim()
  const addition = fresh && finalPrompt.startsWith(base) ? finalPrompt.slice(base.length).trim() : ''
  return <section className="cs-video-workbench" aria-label="编辑与发送预览">
    <div className="cs-video-workbench-head">
      <div><strong>编辑内容 → 更新发送预览 → 生成视频</strong><p>编辑、更新预览和查看历史免费。AI 预检与智能优化可选，主动调用才计费。</p></div>
      <Tag color={fresh ? 'green' : 'orange'}>{fresh ? '发送预览已同步' : loading ? '正在更新发送预览' : '编辑已变化，待更新预览'}</Tag>
    </div>
    <div className="cs-video-workbench-grid">
      <div className="cs-video-workbench-pane">
        <h3>1 · 编辑提示词</h3>
        <p>当前使用稿：首次来自镜头信息；已应用优化时自动恢复保存稿。编辑后点击右侧更新，核对系统补充内容。</p>
        <Input.TextArea aria-label="视频可编辑提示词" rows={12} value={draft} disabled={disabled}
          onChange={event => onChange(event.target.value)} placeholder="描述这段视频要呈现的内容…" />
      </div>
      <div className="cs-video-workbench-pane cs-video-workbench-final">
        <div className="cs-video-workbench-head"><h3>2 · 本次发送提示词</h3>
          <Button size="small" loading={loading} disabled={disabled || !base} onClick={onRefresh}>更新发送预览（免费）</Button></div>
        <p>{fresh ? '生成按钮将提交这份完整提示词。参考图片、分辨率和时长作为独立参数发送。' : '下方是上次预览，尚未包含最新编辑。更新成功后才能生成。'}</p>
        <Input.TextArea aria-label="视频本次发送提示词" rows={12} readOnly value={finalPrompt} />
        {fresh && <details className="mt-2"><summary>{addition ? '查看本次系统补充内容' : '本次没有新增补充内容'}</summary>
          <p className="mt-2">{addition ? '以下文字已加入右侧完整稿，可能包括镜头依据、动作衔接与质量约束。' : '所需内容已包含在编辑稿中。'}</p>
          {addition && <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans">{addition}</pre>}
        </details>}
      </div>
    </div>
    {error && <Alert className="mt-2" type="error" message="发送预览或提交失败" description={error} />}
    <p className="cs-video-workbench-note">系统补充不是 AI 审片结论。明确剧情应优先于通用连续性要求；若与已保存资产设定冲突，请先修正来源，避免两种说法同时发送。仅删除编辑稿中的规则，更新预览时可能再次补入。</p>
  </section>
}


/** 先核对当前镜头目标与已关联设定；这些是业务来源，不能冒充图像识别或质量合格结论。 */
export function VideoShotBrief({ pack, title, onEdit, onReview }: {
  pack: ShotVideoPromptPackRead | null; title?: string; onEdit: () => void; onReview: () => void
}) {
  return <section className="cs-video-shot-brief" aria-label="本镜头创作目标">
    <div className="cs-video-workbench-head"><div><strong>这段视频要表现什么</strong><p>{title || pack?.title || '当前镜头'}</p></div>
      <Button size="small" onClick={onEdit}>修正镜头与资产设定</Button></div>
    <div className="cs-video-input-summary">
      <span><strong>场景：</strong>{pack?.scene?.name || '未关联，以提示词为准'}</span>
      <span><strong>角色：</strong>{pack?.characters?.map(item => item.name).join('、') || '未关联，以提示词为准'}</span>
      <span><strong>道具：</strong>{pack?.props?.map(item => item.name).join('、') || '未关联'}</span>
    </div>
    <details><summary>查看本镜头剧情与动作要求</summary>
      <p className="whitespace-pre-wrap mt-2">{pack?.script_excerpt || '暂无剧本摘录，请结合镜头描述核对。'}</p>
      {!!pack?.action_beats?.length && <ol className="pl-5 list-decimal">{pack.action_beats.map((beat, index) => <li key={index} className="whitespace-pre-wrap mb-1">{beat}</li>)}</ol>}
    </details>
    <p className="cs-video-workbench-note">先核对剧情和下方参考图，再调整提示词。设定错误请修正镜头；图片不合适请更换参考帧。相邻镜头只用于衔接，不能提前演完后续剧情。</p>
    <Button className="mt-2" size="small" type="link" onClick={onReview}>需要帮助判断图文是否一致？查看已有预检与优化</Button>
  </section>
}
