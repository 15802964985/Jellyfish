import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Collapse, Input, Select, Space, Tag } from 'antd'
import { StudioCreativeDirectionsService as Api, type CreativeRead, type CreativeContextOption, type TemplateContextRead, type PromptTemplateRead } from '../../../services/generated'
type CreativeScope=CreativeRead['scope']
const scopes=[['project','项目'],['chapter','章节'],['shot','分镜'],['character','角色'],['actor','演员'],['scene','场景'],['prop','道具'],['costume','服装']]
/** 在模板管理中免费试渲染真实对象上下文，结果不会保存为业务提示词。 */
export function TemplateContextPreview({template}:{template:PromptTemplateRead}) {
  const [scope,setScope]=useState<CreativeScope>('project'),[entityId,setEntityId]=useState(''),[query,setQuery]=useState('')
  const [options,setOptions]=useState<CreativeContextOption[]>([]),[variables,setVariables]=useState<Record<string,string>>({})
  const [result,setResult]=useState<TemplateContextRead>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const signature=JSON.stringify([scope,entityId,variables,template.id,template.version]),current=useRef(signature);current.current=signature
  useEffect(()=>{setResult(undefined);setError('')},[signature])
  useEffect(()=>{let active=true;const timer=setTimeout(()=>{Api.getContextOptionsApiV1StudioCreativeDirectionsContextOptionsScopeGet({scope,q:query}).then(r=>{if(active)setOptions(r.data||[])}).catch(()=>{if(active)setError('业务对象加载失败')})},250);return()=>{active=false;clearTimeout(timer)}},[scope,query])
  /** 迟到响应不覆盖切换模板、对象或变量后的试渲染草稿。 */
  const preview=async()=>{const requested=signature;setBusy(true);setError('');try{const r=await Api.previewTemplateApiV1StudioCreativeDirectionsTemplatePreviewPost({requestBody:{template_id:template.id,scope,entity_id:entityId,variables}});if(current.current===requested)setResult(r.data||undefined)}catch(e){if(current.current===requested)setError((e as {body?:{detail?:string}}).body?.detail||'试渲染失败')}finally{setBusy(false)}}
  return <Collapse items={[{key:'context',label:'绑定业务对象试渲染（免费）',children:<Space direction="vertical" style={{width:'100%'}}>
    <p>读取已保存对象的当前设定，按本模板试填变量；不会保存、生成图片或调用模型。生成页面还会加入本次参数、参考图和执行约束。</p>
    <Select aria-label="模板上下文类型" style={{width:'100%'}} value={scope} onChange={v=>{setScope(v);setEntityId('');setQuery('');setOptions([])}} options={scopes.map(([value,label])=>({value,label}))}/>
    <Select aria-label="模板上下文对象" style={{width:'100%'}} showSearch filterOption={false} onSearch={setQuery} value={entityId||undefined} onChange={setEntityId} options={options} placeholder="搜索并选择具体对象（最多显示50项）"/>
    <Collapse items={[{key:'variables',label:'手工试填模板变量（可选，优先于对象变量）',children:template.variables.map(key=><label key={key} style={{display:'block'}}>{key}<Input.TextArea value={variables[key]} placeholder="不填写则读取当前对象或模板默认值" onChange={e=>setVariables(old=>({...old,[key]:e.target.value}))}/></label>)}]}/>
    <Button disabled={!entityId} loading={busy} onClick={()=>void preview()}>免费试渲染</Button>{error&&<Alert type="error" message={error}/>}
    {result&&<><Tag>模板 v{result.template_version} · 设定 v{result.direction.revision}</Tag>{result.missing.length>0&&<Alert type="warning" message={`未填变量：${result.missing.join('、')}；该试稿不完整`}/>}<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:420,overflow:'auto'}}>{result.prompt}</pre><Collapse items={[{key:'actual',label:'本次实际变量与设定来源',children:<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({variables:result.variables,sources:result.direction.sources},null,2)}</pre>} ]}/></>}
  </Space>} ]}/>
}
