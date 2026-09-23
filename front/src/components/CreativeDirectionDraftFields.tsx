import { useEffect, useState } from 'react'
import { Alert, Collapse, Input, Select, Space, Button, Tabs, Tooltip, message } from 'antd'
import { StudioCreativeDirectionsService as Api } from '../services/generated'
import type { CreativeCatalog, CreativeFields } from '../services/generated'
import { creativeHelp, creativeFormError } from './creativeDirectionForm'
import './creative-direction-form.css'
/** 两项基础选择加按需展开的设定；稀疏值继续支持角色、章节继承。 */
export function CreativeDirectionDraftFields({value={},onChange,required=false}:{value?:CreativeFields;onChange?:(value:CreativeFields)=>void;required?:boolean}) {
 const [catalog,setCatalog]=useState<CreativeCatalog>(),[error,setError]=useState(false)
 useEffect(()=>{let active=true;Api.getCreativeCatalogApiV1StudioCreativeDirectionsCatalogGet().then(r=>{if(active&&r.data)setCatalog(r.data)}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[])
 /** 改主题材时移除重复辅题材；其他已填写剧情约束原样保留。 */
 const change=(patch:Partial<CreativeFields>)=>{const next={...value,...patch};if((next.secondary_genres?.length||0)>4||(next.narrative_tags?.length||0)>10){message.warning('辅助题材最多4项，叙事标签最多10项');return}if(next.primary_genre)next.secondary_genres=next.secondary_genres?.filter(x=>x!==next.primary_genre);onChange?.(next)}
 const options=(values:string[])=>values.map(x=>({value:x,label:x}))
 const visual=value.presentation&&value.treatment?`${value.presentation}|${value.treatment}`:undefined
 const issue=creativeFormError(value,required)
 if(error)return <Alert type="error" message="创作分类加载失败，请重新打开后设置"/>
 const extraCount=(value.secondary_genres?.length||0)+(value.narrative_tags?.length||0)+['era','geography','world_rules','art_constraints'].filter(k=>Boolean(value[k as keyof CreativeFields])).length
 return <div className="creative-fields">
  <Space wrap size={[6,6]} style={{marginBottom:10}}><span className="creative-field-help">快捷起点</span>{Object.entries(catalog?.presets||{}).map(([name,fields])=><Button key={name} size="small" onClick={()=>change(fields as CreativeFields)}>{name}</Button>)}</Space>
  <div className="creative-fields-grid">
   <div><label className="creative-field-label">画面表现{required?' *':''}</label><Select aria-label="画面表现" showSearch optionFilterProp="label" value={visual} placeholder={required?'请选择画面表现':'不选则沿用项目或默认设定'} options={Object.entries(catalog?.treatments||{}).flatMap(([p,styles])=>styles.map(t=>({value:`${p}|${t}`,label:`${p} · ${t}`})))} onChange={next=>{const [presentation,treatment]=next.split('|');change({presentation:presentation as CreativeFields['presentation'],treatment})}}/><p className="creative-field-help">决定画面长什么样，不限制故事题材。</p></div>
   <div><label className="creative-field-label">故事主题材{required?' *':''}</label><Select aria-label="故事主题材" allowClear={!required} value={value.primary_genre||undefined} options={options(catalog?.genres||[])} onChange={next=>change({primary_genre:next??null})} placeholder={required?'请选择主要故事类型':'可沿用上级设定'}/><p className="creative-field-help">只选一个主要方向，如仙侠、悬疑探案。</p></div>
  </div>
  {issue&&<Alert type="error" message={issue} style={{marginBottom:8}}/>}
  <Collapse items={[{key:'more',label:`补充设定（可选${extraCount?`，已填 ${extraCount} 项`:''}）`,children:<Tabs items={[
   {key:'story',label:'题材与叙事',children:<div className="creative-fields-grid"><div><label className="creative-field-label">辅助题材</label><Select aria-label="辅助题材" disabled={!value.primary_genre} placeholder="先选择主题材" mode="multiple" maxTagCount="responsive" value={value.secondary_genres||[]} options={options((catalog?.genres||[]).filter(x=>x!==value.primary_genre))} onChange={v=>change({secondary_genres:v})}/><p className="creative-field-help">{creativeHelp.secondary_genres.help}</p></div><div><label className="creative-field-label">叙事标签</label><Select aria-label="叙事标签" mode="tags" maxTagCount="responsive" value={value.narrative_tags||[]} options={options(catalog?.narrative_tags||[])} onChange={v=>change({narrative_tags:v})}/><p className="creative-field-help">{creativeHelp.narrative_tags.help}</p></div>{Boolean(value.secondary_genres?.length)&&<div style={{gridColumn:'1 / -1'}}><label className="creative-field-label">混合题材说明（必填，保存为世界规则）</label><Input.TextArea aria-label="混合题材说明" value={value.world_rules||''} maxLength={3000} autoSize={{minRows:2,maxRows:3}} placeholder="例如：以现代都市为背景，修炼者隐居普通人之中；城市日常服务修炼主线，不混入古代社会制度。" onChange={e=>change({world_rules:e.target.value})}/><p className="creative-field-help">说明统一背景、主次关系和特殊规则；填写说明不代表系统已证明其无矛盾，生成前仍需核对。</p></div>}</div>},
   {key:'world',label:'世界与美术',children:<><p className="creative-field-help">这些文字会进入提示词与预检。只写已确认事实；不确定可留空，系统不能自动判断所有自由文本是否合理。</p><div className="creative-fields-grid">{(['era','geography','world_rules','art_constraints'] as const).map(key=><div key={key}><Tooltip title={creativeHelp[key].help}><label className="creative-field-label">{catalog?.field_labels[key]} ⓘ</label></Tooltip><Input.TextArea aria-label={catalog?.field_labels[key]} placeholder={creativeHelp[key].example} autoSize={{minRows:2,maxRows:3}} showCount maxLength={key==='era'||key==='geography'?200:3000} value={value[key]||''} onChange={e=>change({[key]:e.target.value})}/><p className="creative-field-help">{creativeHelp[key].help}</p></div>)}</div></>}
  ]}/>}]}/>
 </div>
}
