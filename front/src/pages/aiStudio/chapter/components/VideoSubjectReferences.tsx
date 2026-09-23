import { useState } from 'react'
import { Alert, Button, Input, Space, Typography, message } from 'antd'
import { PreviewImage } from '../../../../components/PreviewImage'
import { MediaFilePicker } from '../../files/MediaFilePicker'
import { CharacterViewPicker } from '../../components/CharacterViewPicker'
import { buildFileDownloadUrl } from '../../assets/utils'
import type { VideoSubjectMediaReference, CharacterAngleGroup, CharacterAngleView } from '../../../../services/generated'

/** 以有序主体组保存同一人物的多角度图，组数、组内和总体图片分别遵守当前模型限制。 */
export function VideoSubjectReferences({ value: inputValue, limit, groupLimit = limit, perGroupLimit = 1, shotId, onChange }: {
  value: VideoSubjectMediaReference[]; limit: number; groupLimit?: number; perGroupLimit?: number; shotId?: string;
  onChange: (value: VideoSubjectMediaReference[]) => void
}) {
  const value = inputValue.map(subject => ({ ...subject, media: subject.media ?? [] }))
  const [picking, setPicking] = useState<number | null>(null)
  const allFiles = value.flatMap(s => s.media.map(m => m.file_id))
  const total = allFiles.length
  /** 每次组内变动重新排列ordinal，保证预览图号和供应商实际数组顺序一致。 */
  const updateMedia = (index: number, media: NonNullable<VideoSubjectMediaReference['media']>) => onChange(value.flatMap((s, i) => i !== index ? [s] : media.length ? [{ ...s, media: media.map((m, ordinal) => ({ ...m, ordinal })) }] : []))
  /** 用已选图片保持角色组身份，用户改组名后继续补角度仍进入原组。 */
  const characterGroupIndex = (group: CharacterAngleGroup) => {
    const files = new Set((group.views ?? []).map(view => view.file_id))
    const index = value.findIndex(subject => subject.media.some(media => files.has(media.file_id)))
    return index >= 0 ? index : value.findIndex(subject => subject.name === `角色：${group.name}`)
  }
  /** 角色角度归入同名角色组，禁止把不同角度当成不同人物。 */
  const toggleCharacter = (group: CharacterAngleGroup, view: CharacterAngleView, checked: boolean) => {
    if (!checked) { onChange(value.flatMap(s => { const media = s.media.filter(m => m.file_id !== view.file_id).map((m, ordinal) => ({ ...m, ordinal })); return media.length ? [{ ...s, media }] : [] })); return }
    const name = `角色：${group.name}`, index = characterGroupIndex(group)
    if (total >= limit || (index < 0 ? value.length >= groupLimit : value[index].media.length >= perGroupLimit)) { message.warning('超过当前模型参考图片或主体数量限制'); return }
    const media = { file_id: view.file_id, media_kind: 'image' as const, ordinal: index < 0 ? 0 : value[index].media.length }
    if (index < 0) onChange([...value, { name, media: [media] }])
    else updateMedia(index, [...value[index].media, media])
  }
  /** 主体组排序会改变模型图号，调用方据此让旧预览与预检失效。 */
  const move = (index: number, offset: number) => { const next = [...value]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange(next) }
  return <Space direction="vertical" className="w-full" size={12}>
    <Alert type="info" showIcon message={`同角色多角度参考 · 已选 ${value.length}/${groupLimit} 组、${total}/${limit} 张；每组最多 ${perGroupLimit} 张`} description="同组图片表示同一个人物/物件的不同视角，不是多人或首尾帧。先选角色角度，再核对实际图号和提示词。" />
    {(total > limit || value.length > groupLimit || value.some(s => s.media.length > perGroupLimit)) && <Alert type="error" message="现有选择超过当前模型限制，请手动移除部分图片；系统不会静默丢图" />}
    {shotId && <CharacterViewPicker shotId={shotId} selected={allFiles} onClearFiles={ids=>onChange(value.flatMap(s=>{const media=s.media.filter(m=>!ids.includes(m.file_id)).map((m,ordinal)=>({...m,ordinal}));return media.length?[{...s,media}]:[]}))} canAdd={group => { const existing = value[characterGroupIndex(group)]; return total < limit && (existing ? existing.media.length < perGroupLimit : value.length < groupLimit) }} onToggle={toggleCharacter} />}
    <Typography.Text type="secondary">保存主体名称、组内顺序及全局图号到生成任务；当前页参考草稿仍按镜头保存在本机。</Typography.Text>
    {value.map((subject, index) => <section key={index} className="rounded border border-slate-200 p-3">
      <strong>主体组 {index + 1} · {subject.media.length} 张</strong>
      <Input aria-label={`参考图 ${index + 1} 用途`} maxLength={120} value={subject.name} placeholder="同一人物或物件的名称" onChange={event => onChange(value.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '8px 0' }}>{subject.media.map((media, imageIndex) => <div key={media.file_id} style={{ width: 112 }}>
        <PreviewImage src={buildFileDownloadUrl(media.file_id)} alt={`${subject.name} 角度${imageIndex + 1}`} className="h-24 w-24 object-contain" />
        <div>图{value.slice(0, index).reduce((n,s) => n+s.media.length, 0)+imageIndex+1} · 组内{imageIndex+1}</div>
        <Space size={2}><Button size="small" aria-label={`组${index+1}角度${imageIndex+1}前移`} disabled={!imageIndex} onClick={() => { const next=[...subject.media];[next[imageIndex-1],next[imageIndex]]=[next[imageIndex],next[imageIndex-1]];updateMedia(index,next) }}>←</Button>
          <Button size="small" danger aria-label={`组${index+1}移除角度${imageIndex+1}`} onClick={() => updateMedia(index,subject.media.filter((_,i)=>i!==imageIndex))}>移除</Button></Space>
      </div>)}</div>
      <Space wrap><Button size="small" disabled={!index} onClick={() => move(index,-1)}>上移</Button><Button size="small" disabled={index===value.length-1} onClick={() => move(index,1)}>下移</Button>
        <Button size="small" disabled={total>=limit || subject.media.length>=perGroupLimit} onClick={()=>setPicking(index)}>补充同一主体图片</Button>
        <Button size="small" danger onClick={()=>onChange(value.filter((_,i)=>i!==index))}>移除整组</Button></Space>
    </section>)}
    <Button disabled={total>=limit || value.length>=groupLimit} onClick={()=>setPicking(-1)}>从素材库选择参考图片</Button>
    {picking !== null && <MediaFilePicker kind="image" selectedIds={allFiles} onClose={()=>setPicking(null)} onSelect={file=>{
      if (allFiles.includes(file.id) || total>=limit) return
      const media={file_id:file.id,media_kind:'image' as const,ordinal:0}
      if(picking<0 && value.length<groupLimit) onChange([...value,{name:`参考${value.length+1}·${file.name || '图片'}`,media:[media]}])
      else if(value[picking] && value[picking].media.length<perGroupLimit) updateMedia(picking,[...value[picking].media,media])
      setPicking(null)
    }} />}
  </Space>
}
