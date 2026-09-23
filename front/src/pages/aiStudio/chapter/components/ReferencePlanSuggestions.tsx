import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Image, Select, Space } from 'antd'
import { StudioShotsService, StudioTimelineService, type ShotAssetOverviewItem, type CharacterAngleGroup } from '../../../../services/generated'
import { buildFileDownloadUrl, buildFilePreviewUrl } from '../../assets/utils'

/** Local reference suggestions explain identity/wardrobe/scene roles and require explicit adoption. */
export function ReferencePlanSuggestions({ shotId, disabled, onApply }: {
  shotId: string; disabled: boolean; onApply: (ids: string[]) => void
}) {
  const [assets, setAssets] = useState<ShotAssetOverviewItem[]>([])
  const [characters, setCharacters] = useState<CharacterAngleGroup[]>([])
  const [angle, setAngle] = useState('FRONT')
  const [included, setIncluded] = useState<string[]>(['character', 'scene'])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let current = true
    setLoading(true); setAssets([]); setCharacters([]); setError('')
    void Promise.all([
      StudioShotsService.getShotAssetsOverviewApiApiV1StudioShotsShotIdAssetsOverviewGet({ shotId }),
      StudioTimelineService.getShotCharacterViewsApiV1StudioTimelineShotsShotIdCharacterViewsGet({ shotId }),
    ]).then(([overview, views]) => {
      if (current) { setAssets(overview.data?.items ?? []); setCharacters(views.data ?? []) }
    }).catch(() => { if (current) setError('参考建议读取失败，请关闭后重试；当前选择未改变') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [shotId])
  const suggestions = useMemo(() => {
    const people = included.includes('character') ? characters.flatMap(group => {
      const matching = (group.views ?? []).filter(view => view.view_angle === angle)
      const view = matching.find(item => item.source_type === 'character') ?? matching[0]
      return view ? [{ id: view.file_id, name: group.name, reason: view.source_type === 'character'
        ? `${view.label}：优先角色定妆，减少演员其他服装干扰`
        : `${view.label}：缺少同角度角色定妆；请核对服装，不自动代替角色造型` }] : []
    }) : []
    const others = assets.filter(item => item.type !== 'character' && included.includes(item.type) && item.is_linked && item.file_id)
      .map(item => ({ id: item.file_id!, name: item.name, reason: item.type === 'scene' ? '已关联场景：用于空间与光影'
        : item.type === 'costume' ? '已关联服装：用于本镜头穿着；请核对归属角色' : '已关联道具：仅在本帧可见且需要约束外形时选用' }))
    return [...new Map([...people, ...others].map(item => [item.id, item])).values()]
  }, [characters, assets, angle, included])
  return <details className="my-3 rounded border p-3"><summary>参考方案建议（本地规则，无模型费用）</summary>
    <p>按本帧需要选择角度和用途。每位角色最多推荐一张同角度图片，缺图不借用其他角度；只从已关联资产中建议。采用后仍可取消、排序，再保存本帧。</p>
    <Space wrap><Select aria-label="建议角色角度" value={angle} onChange={setAngle} disabled={disabled}
      options={[{value:'FRONT',label:'正面'},{value:'LEFT',label:'左侧'},{value:'RIGHT',label:'右侧'},{value:'BACK',label:'背面'},{value:'THREE_QUARTER',label:'3/4侧面'}]} />
      <Checkbox.Group value={included} disabled={disabled} onChange={values => setIncluded(values as string[])}
        options={[{label:'角色',value:'character'},{label:'场景',value:'scene'},{label:'服装',value:'costume'},{label:'道具',value:'prop'}]} />
    </Space>
    {error && <Alert type="warning" message={error} />}
    <div className="my-3 flex flex-wrap gap-3"><Image.PreviewGroup>{suggestions.map(item => <div key={item.id} style={{width:160}}>
      <Image width={150} height={100} style={{objectFit:'contain'}} src={buildFilePreviewUrl(item.id)} preview={{src:buildFileDownloadUrl(item.id)}} alt={item.name} />
      <div>{item.name}</div><p className="text-xs text-slate-600">{item.reason}</p>
    </div>)}</Image.PreviewGroup></div>
    {!loading && !suggestions.length && <p>没有匹配图片，可手动补选或先准备对应角度图片。</p>}
    <Button loading={loading} disabled={disabled || !suggestions.length || !!error} onClick={() => onApply(suggestions.map(item => item.id))}>用此方案替换本帧选择（尚未保存）</Button>
  </details>
}
