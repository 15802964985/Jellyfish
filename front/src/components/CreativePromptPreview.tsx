import { useEffect, useState } from 'react'
import { Alert, Spin } from 'antd'
import { StudioCreativeDirectionsService as Api } from '../services/generated'
import type { CreativeRead } from '../services/generated'

/** 免费编译预览，输入或设定变化时旧结果立即失效；不发起模型请求。 */
export function useCreativePrompt(scope: CreativeRead['scope'], entityId: string, purpose: 'asset' | 'frame' | 'video' | 'script', prompt: string) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; prompt?: string; error?: string }>()
  const key = JSON.stringify([scope, entityId, purpose, prompt, revision])
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    window.addEventListener('creative-direction-updated', refresh)
    return () => window.removeEventListener('creative-direction-updated', refresh)
  }, [])
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      Api.previewCreativePromptApiV1StudioCreativeDirectionsScopeEntityIdPreviewPost({ scope, entityId, requestBody: { prompt, purpose } })
        .then(response => { if (active) setResult({ key, prompt: response.data?.prompt }) })
        .catch(error => { if (active) setResult({ key, error: error?.body?.message || error?.body?.detail || error.message || '创作设定预览失败' }) })
    }, 300)
    return () => { active = false; window.clearTimeout(timer) }
  }, [key, scope, entityId, purpose, prompt])
  return { prompt: result?.key === key ? result.prompt : undefined, error: result?.key === key ? result.error : undefined, loading: result?.key !== key }
}

/** 展示真正提交的提示词，用户仍在原输入框修改；预览失败只阻止本次提交。 */
export function CreativePromptPreview({ result }: { result: ReturnType<typeof useCreativePrompt> }) {
  return <div style={{ margin: '8px 0' }}>{result.error ? <Alert type="error" message={result.error} /> : <details><summary>本次最终提示词（含有效创作设定 · 免费预览）{result.loading && <Spin size="small" />}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto' }}>{result.prompt || '正在读取当前设定…'}</pre></details>}</div>
}
