import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Input, InputNumber, Modal, Select, Space, message } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { StudioWebGenerationService as Web, type WebImageRequest, type WebVideoRequest, type WebAccountRead, type WebModelEvidence, type WebExecutionRead } from '../services/generated'

import { webAccountStatus } from './webAccountStatus'

export type HandoffImageTarget=Pick<WebImageRequest,'target_type'|'entity_id'|'slot_id'|'expected_version'|'prompt'|'reference_file_ids'|'edit_region'>
export type HandoffVideoTarget=Pick<WebVideoRequest,'target_type'|'entity_id'|'expected_version'|'prompt'|'reference_file_ids'|'duration_seconds'|'aspect_ratio'|'resolution'|'reference_mode'|'source_video_file_id'|'preserve_instructions'|'keep_audio'|'subject_groups'>
export type HandoffTarget=HandoffImageTarget|HandoffVideoTarget
/** Review a frozen task and prefer automatic execution; manual fallback must be selected explicitly. */
export function WebHandoffButton({prepare,disabled=false,onAccepted}:{prepare:()=>Promise<HandoffTarget|HandoffTarget[]>;disabled?:boolean;onAccepted?:(id:string)=>void}){
 const batchRequest=useRef<Array<WebImageRequest|WebVideoRequest>|null>(null),[batch,setBatch]=useState<HandoffTarget[]>([])
 const navigate=useNavigate(),request=useRef<WebImageRequest|WebVideoRequest|null>(null),guard=useRef(false)
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[draft,setDraft]=useState<HandoffImageTarget|HandoffVideoTarget|null>(null)
 const [platform,setPlatform]=useState<NonNullable<WebImageRequest['platform']>>('doubao'),[model,setModel]=useState(''),[confirmed,setConfirmed]=useState(false)
 const [accounts,setAccounts]=useState<WebAccountRead[]>([]),[accountId,setAccountId]=useState<string>(),[execution,setExecution]=useState<'manual'|'browser'>('browser')
 const [modelOptions,setModelOptions]=useState<WebModelEvidence[]>([]),[modelError,setModelError]=useState('')
 const modelTouched=useRef(false)
 const [availability,setAvailability]=useState<{key:string;value:WebExecutionRead}|null>(null),[refresh,setRefresh]=useState(0)
 const modality=draft&&'duration_seconds' in draft?'video':'image'
 const localEdit=!!(draft&&'edit_region' in draft&&draft.edit_region),isBatch=!!batch.length
 const videoParams=draft&&'duration_seconds' in draft?{referenceMode:draft.reference_mode,durationSeconds:draft.duration_seconds,aspectRatio:draft.aspect_ratio,resolution:draft.resolution||undefined,sourceVideo:!!draft.source_video_file_id}:{}
 const checkKey=JSON.stringify([platform,modality,model,accountId,isBatch,localEdit,videoParams])
 const automatic=availability?.key===checkKey&&availability.value.available
 const selectedModel=modelOptions.find(item=>item.name===model)
 const selectionBlocked=selectedModel?.enabled===false||!!(accountId&&selectedModel?.excluded_account_ids?.includes(accountId))
 /** Same readiness copy as the accounts page; disabled submit shows its reason next to the button. */
 const currentReasons=availability?.key===checkKey?availability.value.reasons:[]
 const checked=availability?.key===checkKey
 const scopedAccounts=accounts.filter(a=>a.platform===platform&&a.enabled&&(!accountId||a.id===accountId)&&!selectedModel?.excluded_account_ids?.includes(a.id))
 // Summarize the best account; an unavailable neighbor cannot mask usable accounts.
 const poolStatus=scopedAccounts.map(webAccountStatus).sort((a,b)=>a.rank-b.rank)[0]
 const accountStatus=!checked?'正在检查账号状态…':automatic?`账号${poolStatus?.label||'可用'}${poolStatus?.label==='忙碌，可排队'?'':'，可提交任务'}`:'当前不可用'
 const accountHelp=automatic?poolStatus?.help:checked?(currentReasons[0]||'请重新选择账号或检查账号设置。'):undefined
 /** Poll authoritative readiness serially; late responses and errors cannot retain old availability. */
 useEffect(()=>{if(!open||!draft)return;let live=true,timer:ReturnType<typeof setTimeout>|undefined
  setAvailability(null);setModelOptions([]);setModelError('')
  const load=async()=>{try{
   const [directory,rows,status]=await Promise.all([
    Web.platformModelsApiV1StudioWebGenerationPlatformsPlatformModelsModalityGet({platform,modality}),
    Web.accountsApiV1StudioWebGenerationAccountsGet(),
    Web.executionStatusApiV1StudioWebGenerationExecutionStatusGet({platform,modality,model,accountId,batch:isBatch,localEdit,...videoParams})])
   if(live){setModelOptions(directory.models||[]);setAccounts(rows);setAvailability({key:checkKey,value:status});setModelError('')
    if(!model&&!modelTouched.current&&!request.current&&!batchRequest.current){const chosen=directory.models.find(m=>m.enabled&&m.is_default);if(chosen)setModel(chosen.name)}
   }
  }catch{if(live){setAvailability(null);setModelError('账号或型号状态读取失败，自动执行暂不可用；可刷新重试')}}
  finally{if(live)timer=setTimeout(()=>void load(),3000)}}
  void load();return()=>{live=false;if(timer)clearTimeout(timer)}
 },[open,!!draft,checkKey,refresh])
 const [catalog,setCatalog]=useState<Record<string,any>>({})
 /** Prepare only local business values; reopening preserves an uncertain submit request. */
 const show=async()=>{
  setOpen(true);setConfirmed(false)
  if(request.current||batchRequest.current)return
  setBusy(true);setDraft(null);setBatch([])
  try{const [data,platforms,rows]=await Promise.all([prepare(),Web.platformsApiV1StudioWebGenerationPlatformsGet(),Web.accountsApiV1StudioWebGenerationAccountsGet()]);setDraft(Array.isArray(data)?data[0]:data);setBatch(Array.isArray(data)?data:[]);setCatalog(platforms);setAccounts(rows)}catch(e:any){message.error(e?.message||'无法准备当前材料')}finally{setBusy(false)}
 }
 /** A request ID and input remain stable after a lost HTTP response. */
 const submit=async()=>{
  if(guard.current||!draft||!confirmed||(!(request.current||batchRequest.current)&&(selectionBlocked||(execution==='browser'&&!automatic))))return
  guard.current=true;setBusy(true)
  try{
   if(batch.length){
    if(!batchRequest.current)batchRequest.current=batch.map((item,index)=>({...(index===0?draft:item),platform,execution_mode:execution,requested_model:model.trim(),account_id:accountId||null,request_id:crypto.randomUUID(),external_transfer_confirmed:true}))
    const results=await (batchRequest.current[0].execution_mode==='browser'?Web.browserBatchApiV1StudioWebGenerationBatchPost({requestBody:{items:batchRequest.current}}):Web.handoffBatchApiV1StudioWebGenerationHandoffBatchPost({requestBody:{items:batchRequest.current}}))
    results.forEach(result=>window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId:result.task_id,title:'网页生成'}})))
    batchRequest.current=null;setOpen(false);if(results[0])onAccepted?.(results[0].task_id);if(execution==='manual')navigate('/web-generation');message.success(`已创建 ${results.length} 个独立交接任务`);return
   }
   if(!request.current)request.current={...draft,platform,execution_mode:execution,requested_model:model.trim(),account_id:accountId||null,request_id:crypto.randomUUID(),external_transfer_confirmed:true}
   const body=request.current
   const result=!('duration_seconds' in body)?await (body.execution_mode==='browser'?Web.submitImageApiV1StudioWebGenerationImagesPost({requestBody:body}):Web.handoffImageApiV1StudioWebGenerationHandoffImagesPost({requestBody:body})):await (body.execution_mode==='browser'?Web.submitVideoApiV1StudioWebGenerationVideosPost({requestBody:body}):Web.handoffVideoApiV1StudioWebGenerationHandoffVideosPost({requestBody:body}))
   window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId:result.task_id,title:'网页生成'}}))
   request.current=null;setOpen(false);onAccepted?.(result.task_id);if(body.execution_mode==='manual')navigate(`/web-generation/${result.task_id}`);else message.success('已提交后台生成，结果将在当前业务页面显示')
  }catch(e:any){if([409,422].includes(e?.status)){request.current=null;batchRequest.current=null};message.error(typeof e?.body?.detail==='string'?e.body.detail:'提交未确认；再次点击仅核对同一请求')}finally{guard.current=false;setBusy(false)}
 }
 return <><Button disabled={disabled} onClick={()=>void show()}>平台网页生成</Button><Modal width={800} style={{top:24}} styles={{body:{maxHeight:'calc(100dvh - 160px)',overflowY:'auto'}}} title="平台网页生成 · 模型与账号" open={open} onCancel={()=>setOpen(false)} footer={<Space><Button onClick={()=>setOpen(false)}>关闭</Button>{execution==='browser'&&!automatic&&<span aria-label="提交不可用原因" style={{color:'#d4380d',maxWidth:340}} title={currentReasons.join('；')}>{currentReasons[0]||'正在核对可用状态…'}</span>}<Button type="primary" loading={busy} disabled={!draft||!confirmed||!model.trim()||!draft.prompt.trim()||(!(request.current||batchRequest.current)&&(selectionBlocked||(execution==='browser'&&!automatic)))} onClick={()=>void submit()}>{(request.current||batchRequest.current)?'核对原提交':execution==='browser'?'提交后台任务':'创建交接单'}</Button></Space>}>
  <div style={{paddingTop:16}}>
   <Space wrap><Select aria-label="交接平台" style={{width:180}} value={platform} disabled={!!(request.current||batchRequest.current)} onChange={value=>{modelTouched.current=false;setPlatform(value);setModel('');setAccountId(undefined);setExecution('browser')}} options={Object.entries(catalog).map(([value,item])=>({value,label:item.name}))}/><Select aria-label="官网实际模型" mode="tags" style={{width:300}} value={model?[model]:[]} disabled={!!(request.current||batchRequest.current)} onChange={values=>{modelTouched.current=true;setModel((values[values.length-1]||'').trim());setAccountId(undefined);setExecution('browser')}} options={modelOptions.map(item=>({value:item.name,label:item.name+(item.enabled===false?'（已停用）':item.is_default?'（默认）':''),title:item.note,disabled:item.enabled===false}))} placeholder="选择网页模型；未列出可输入官网名称"/></Space>
   <p>{modelError||modelOptions.find(item=>item.name===model)?.note||'未核实的型号仅用于人工交接，不据此开放自动执行。网页型号与 API 型号分别维护。'}</p>
   <Space wrap><Select aria-label="网页账号" style={{width:260}} value={accountId} allowClear placeholder="自动分配空闲账号" disabled={!!(request.current||batchRequest.current)} onChange={setAccountId} options={accounts.filter(a=>a.platform===platform&&a.enabled).map(a=>{const status=webAccountStatus(a);return {value:a.id,label:a.display_name+'（'+status.label+'）',title:status.help,disabled:!!selectedModel?.excluded_account_ids?.includes(a.id)}})}/><Select aria-label="网页执行方式" style={{width:240}} value={execution} disabled={!!(request.current||batchRequest.current)} onChange={setExecution} options={[{value:'browser',label:'本机执行器 · 自动执行（优先）'},{value:'manual',label:'人工交接 · 手动降级'}]}/></Space>
   <Alert className="my-3" showIcon type={automatic?(poolStatus?.help?'info':'success'):checked?'warning':'info'}
    message={execution==='browser'?accountStatus:'人工交接：请在官网生成后上传结果'}
    description={execution==='browser'&&(accountHelp||(!automatic&&checked))?<>
     {accountHelp&&<div>{accountHelp}</div>}
     {!automatic&&checked&&<Space wrap className="mt-2"><Button size="small" onClick={()=>setRefresh(v=>v+1)}>重新检查</Button><Link to="/settings/web-accounts" target="_blank">管理账号</Link>{currentReasons.some(reason=>/型号|模型/.test(reason))&&<Link to="/settings/web-models" target="_blank">检查模型设置</Link>}</Space>}
    </>:undefined}/>
   {selectionBlocked&&<Alert type="warning" message="型号已停用或当前账号被排除，请重新选择；不会自动换型号提交。"/>}
   <p>人工交接：你在官网生成后上传原结果回填。 本机执行器：已适配流程由系统上传、提交、下载并回填；登录或验证仍可能需要你操作。</p>
   <p>{availability?.value.cost_notice||'网页权益未实时核实；可用不代表免费，不自动升级会员或切换收费模型。'}</p>
   <p>模型、账号、输入及目标会冻结到同一任务；更换模型后需重新核对网页实际规格。API 参数不会自动套用。</p>
   {batch.length>0&&<Alert className="my-3" message={`共 ${batch.length} 个独立任务；账号忙时排队。以下可编辑第一项，其余材料可展开核对。`} description={<details><summary>查看全部镜头材料</summary>{batch.map((item,i)=><p key={`${item.entity_id}:${i}`} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{i+1}. {item.entity_id}：{item.prompt}</p>)}</details>}/>}
   {draft&&'edit_region' in draft&&draft.edit_region&&<Alert className="my-3" message="局部修正：官网需生成与原图同画幅的编辑整图" description={`选区（归一化坐标）：${JSON.stringify(draft.edit_region)}。回填时只采用选区内像素，选区外保持原图；平台原件另行保留。`}/>}
   {draft&&<Input.TextArea aria-label="交接提示词" rows={7} value={draft.prompt} disabled={!!(request.current||batchRequest.current)} onChange={e=>setDraft({...draft,prompt:e.target.value})}/>}
   {draft&&'duration_seconds' in draft&&<Space wrap className="mt-3"><span>时长（秒）</span><InputNumber min={1} max={120} value={draft.duration_seconds} disabled={!!(request.current||batchRequest.current)} onChange={value=>setDraft({...draft,duration_seconds:value||1})}/><span>画幅</span><Input style={{width:85}} value={draft.aspect_ratio} disabled={!!(request.current||batchRequest.current)} onChange={e=>setDraft({...draft,aspect_ratio:e.target.value})}/><span>分辨率</span><Input style={{width:110}} value={draft.resolution||''} placeholder="可留空" disabled={!!(request.current||batchRequest.current)} onChange={e=>setDraft({...draft,resolution:e.target.value||null})}/></Space>}
   {draft&&'subject_groups' in draft&&!!draft.subject_groups?.length&&<Alert className="my-3" message="主体分组保持独立，不合并为无差别参考图片" description={draft.subject_groups.map(group=>`${group.name}：${group.media.length} 份素材`).join('；')}/>}
   {draft&&'source_video_file_id' in draft&&draft.source_video_file_id&&<Alert type="info" message="视频编辑：会携带原视频，结果另存，确认后再采用" description={draft.preserve_instructions||'请在官网选择支持视频编辑的模型；普通图生视频不能代替编辑。'}/>}<p>参考图片：{draft?.reference_file_ids?.length||0} 张，保持当前选择顺序。交接单会显示逐张预览和下载。</p>
   <Checkbox checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}>我确认将当前材料发送到选定平台，按所选模型生成；可能消耗该账号权益。</Checkbox>
  </div>
 </Modal></>
}
