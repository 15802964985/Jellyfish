import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Checkbox, Descriptions, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { StudioWebGenerationService as Web, FilmService } from '../services/generated'
import { PreviewImage } from '../components/PreviewImage'
import { buildFileDownloadUrl, resolveAssetUrl } from './aiStudio/assets/utils'

const stageNames:Record<string,string>={queued:'排队中',preparing:'准备材料',submitting:'提交中',needs_user:'等待处理',awaiting_user:'等待您完成人机交互',downloading:'下载与归档',cancelled:'已取消',handoff_ready:'等待官网操作',submitted:'已在官网提交',submission_unknown:'官网受理待核对',completed:'已归档',cancelled_unsent:'未提交，已取消'}
const watermarkNames:Record<string,string>={unknown:'水印待核对',visible:'有可见水印',official_clean:'官方无水印导出（人工核对）','待核对':'水印待核对'}
/** Keep heavy handoff inputs and original/export variants in their own business workbench. */
export default function WebGenerationWorkbench(){
 const {taskId}=useParams(),activeTask=useRef(taskId),generation=useRef(0),readVersion=useRef(0),busyRef=useRef(false),exportRequest=useRef<string|null>(null)
 activeTask.current=taskId
 const [jobs,setJobs]=useState<any[]>([]),[bundle,setBundle]=useState<any>(null),[artifacts,setArtifacts]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [url,setUrl]=useState(''),[remoteId,setRemoteId]=useState(''),[model,setModel]=useState(''),[watermark,setWatermark]=useState('unknown'),[evidence,setEvidence]=useState('')
 const [confirmed,setConfirmed]=useState(false),[file,setFile]=useState<File|null>(null),[cleanFile,setCleanFile]=useState<File|null>(null),[cleanEvidence,setCleanEvidence]=useState(''),[cleanConfirmed,setCleanConfirmed]=useState(false)
 /** Discard late responses from a different task; reopening does not create a platform request. */
 useEffect(()=>{
  const version=++generation.current
  setBundle(null);setArtifacts([]);setFile(null);setCleanFile(null);setConfirmed(false);setCleanConfirmed(false);setUrl('');setRemoteId('');setModel('');setError('');exportRequest.current=null
  let hydrated=false
  const load=async()=>{const read=++readVersion.current;try{
   if(taskId){const [data,outputs]=await Promise.all([Web.handoffManifestApiV1StudioWebGenerationTasksTaskIdHandoffGet({taskId}),Web.webArtifactsApiV1StudioWebGenerationTasksTaskIdArtifactsGet({taskId})]);if(generation.current===version&&read===readVersion.current){setBundle(data);setArtifacts(outputs);setError('');if(!hydrated){hydrated=true;setUrl(data.remote?.conversation_url||'');setRemoteId(data.remote?.message_id||'');setModel(data.request?.requested_model||'')}}}
   else {const data=await Web.handoffJobsApiV1StudioWebGenerationHandoffJobsGet({});if(generation.current===version)setJobs(data)}
  }catch{if(generation.current===version)setError('无法读取任务，请检查服务或任务编号')}}
  let timer:ReturnType<typeof setTimeout>
  const poll=async()=>{await load();if(generation.current===version)timer=setTimeout(()=>void poll(),10000)}
  void poll()
  return()=>{generation.current++;clearTimeout(timer)}
 },[taskId])
 /** Refresh only the still-open task following an explicit action. */
 const refresh=async(id:string)=>{if(activeTask.current!==id)return;const version=generation.current,read=++readVersion.current;const [data,outputs]=await Promise.all([Web.handoffManifestApiV1StudioWebGenerationTasksTaskIdHandoffGet({taskId:id}),Web.webArtifactsApiV1StudioWebGenerationTasksTaskIdArtifactsGet({taskId:id})]);if(generation.current===version&&activeTask.current===id&&read===readVersion.current){setBundle(data);setArtifacts(outputs);setError('')}}
 /** Centralize local busy state; the user can always leave this page during file transfer. */
 const action=async(work:()=>Promise<unknown>)=>{
  if(busyRef.current)return;busyRef.current=true;setBusy(true)
  try{await work()}catch(e:any){message.error(typeof e?.body?.detail==='string'?e.body.detail:'操作未完成，请核对材料；重传不会重新生成')}finally{busyRef.current=false;setBusy(false)}
 }
 /** Freeze the form contents at click time; backend compares the original task fingerprint. */
 const upload=()=>void action(async()=>{
  if(!taskId||!file||!bundle)return
  const id=taskId,receipt={input_fingerprint:bundle.input_fingerprint,conversation_url:url.trim(),message_id:remoteId.trim(),observed_model:model.trim(),account_and_input_confirmed:confirmed,original_download_confirmed:confirmed,watermark,export_evidence:evidence}
  await Web.handoffResultApiV1StudioWebGenerationTasksTaskIdHandoffResultPost({taskId:id,formData:{receipt_json:JSON.stringify(receipt),file:file as unknown as string}})
  message.success('原文件已归档；是否采用以目标版本与规格检查结果为准');await refresh(id)
 })
 /** Import a platform-provided clean original; never edit pixels or replace the original file. */
 const uploadClean=()=>void action(async()=>{
  if(!taskId||!cleanFile||!bundle?.remote||!artifacts.length)return
  const id=taskId
  exportRequest.current ||= crypto.randomUUID()
  const receipt={request_id:exportRequest.current,source_file_id:artifacts[0].file_id,conversation_url:bundle.remote.conversation_url,message_id:bundle.remote.message_id,export_evidence:cleanEvidence,same_result_confirmed:cleanConfirmed}
  await Web.officialExportApiV1StudioWebGenerationTasksTaskIdOfficialExportPost({taskId:id,formData:{receipt_json:JSON.stringify(receipt),file:cleanFile as unknown as string}})
  if(activeTask.current===id){exportRequest.current=null;setCleanFile(null)};message.success('已另存官方导出版本，原文件及当前选择保留');await refresh(id)
 })
 /** Adoption targets only the original image slot/shot and checks the current version again. */
 const adopt=(artifactId:string)=>void action(async()=>{
  if(!taskId||!bundle)return
  const id=taskId,request=bundle.request
  const target=await Web.targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({targetType:request.target_type,entityId:request.entity_id,slotId:request.slot_id||1})
  await Web.adoptWebExportApiV1StudioWebGenerationTasksTaskIdArtifactsArtifactIdAdoptPost({taskId:id,artifactId,requestBody:{expected_version:target.version,...(bundle.result?.requires_adoption?{expected_current_file_id:target.file_id??null}:{})}})
  message.success('已采用所选版本，原文件保留');await refresh(id)
 })
 const progress=(stage:'submitted'|'submission_unknown')=>void action(async()=>{if(!taskId||!bundle)return;const id=taskId;await Web.handoffProgressApiV1StudioWebGenerationTasksTaskIdHandoffProgressPost({taskId:id,requestBody:{stage,input_fingerprint:bundle.input_fingerprint}});await refresh(id)})
 /** Explicit recovery retains the same task and receipt; cancellation releases only its own account lease. */
 const recover=()=>void action(async()=>{if(!taskId||!bundle)return;const id=taskId;await Web.recoverOriginalApiV1StudioWebGenerationTasksTaskIdRecoverPost({taskId:id,requestBody:{expected_recovery_epoch:bundle.recovery_epoch}});await refresh(id)})
 const cancelBrowser=()=>Modal.confirm({title:'取消本地网页任务？',content:'将停止本地回填并释放账号；不保证官网已经受理的生成被撤回。',onOk:()=>action(async()=>{if(!taskId)return;const id=taskId;await FilmService.cancelTaskApiV1FilmTasksTaskIdCancelPost({taskId:id,requestBody:{}});await refresh(id)})})
 const release=()=>Modal.confirm({title:'确认尚未在官网提交生成？',content:'只有从未点击官网生成才能释放账号。已提交或不确定时请选择“受理待核对”，不要重新生成。',okText:'确实未提交，取消交接',onOk:()=>action(async()=>{if(!taskId)return;const id=taskId;await Web.releaseUnsentApiV1StudioWebGenerationTasksTaskIdReleaseUnsentPost({taskId:id,requestBody:{not_submitted_confirmed:true}});await refresh(id)})})
 return <Card title="网页生成交接与官方导出" extra={<Space wrap><Link to="/web-generation">最近交接</Link><Link to="/settings/web-accounts">网页账号</Link></Space>}>
  {error&&<Alert type="error" message={error}/>}
  {!taskId?<><p>从资产或关键帧生成弹窗、视频确认弹窗的“平台网页生成”创建任务。这里显示最近 30 条交接，刷新不会重新生成。</p><Table rowKey="task_id" dataSource={jobs} pagination={false} scroll={{x:800}} columns={[{title:'平台',dataIndex:'platform'},{title:'模型',dataIndex:'model'},{title:'目标',dataIndex:'target_type'},{title:'状态',render:(_,r)=>stageNames[r.stage]||r.status},{title:'操作',render:(_,r)=><Link to={`/web-generation/${r.task_id}`}>继续原任务</Link>}]}/></>:bundle&&<>
   <Alert showIcon type={bundle.stage==='awaiting_user'?'warning':'info'} message={`${bundle.platform.name} · ${stageNames[bundle.stage]||bundle.stage}`} description={bundle.status==='cancelled'?'本地任务已取消并释放账号。官网已受理的生成不代表已撤回，原回执保留。':bundle.status==='succeeded'?'原文件已归档，当前采用情况以原业务对象为准。':bundle.stage==='awaiting_user'?'执行器检测到豆包网页出现了需要您人工处理的内容（人机验证/付费确认/需要手动点开始生成）。原账号已保留，您在原账号窗口完成后，系统会自动继续原任务，无需再次提交。账号不会因为您稍慢而停。':bundle.manual?'任务固定原账号与材料。关闭页面不会取消任务；在官网操作后回填原文件。':'任务在后台执行，关闭页面不会取消。登录或验证需在原账号窗口处理；恢复只继续原任务，不重新发送已受理或受理未知的生成。'}/>
   {bundle.error&&bundle.status!=='cancelled'&&<Alert className="my-3" type="warning" message={bundle.error}/>}
   {!bundle.manual&&['pending','running'].includes(bundle.status)&&<Space className="my-3" wrap>{bundle.paused&&<Button disabled={busy} onClick={recover}>恢复原任务</Button>}<Button disabled={busy} onClick={cancelBrowser}>取消并释放账号</Button><Link to="/settings/web-accounts">查看原账号</Link></Space>}
   {bundle.request.edit_region&&<Alert className="my-3" message="局部修正材料" description={`官网编辑整图，回填仅保留选区内变化。选区归一化坐标：${JSON.stringify(bundle.request.edit_region)}`}/>}
   <Descriptions bordered size="small" column={{xs:1,md:2}} className="my-4"><Descriptions.Item label="指定账号">{bundle.account_name}</Descriptions.Item><Descriptions.Item label="模型">{bundle.request.requested_model}</Descriptions.Item><Descriptions.Item label="原业务对象">{bundle.request.target_type} / {bundle.request.entity_id}</Descriptions.Item><Descriptions.Item label="版本">{bundle.request.expected_version}</Descriptions.Item></Descriptions>
   <p>官网链接使用默认浏览器，登录身份可能与指定账号不同。</p><Space wrap><a href={bundle.platform.url} target="_blank" rel="noreferrer">打开对应官网</a><Button onClick={()=>void navigator.clipboard.writeText(bundle.request.prompt).then(()=>message.success('已复制本任务提示词'))}>复制提示词</Button>{bundle.manual&&bundle.status==='pending'&&<Button disabled={busy} onClick={release}>取消尚未分配任务</Button>}{bundle.manual&&bundle.status==='running'&&<><Button disabled={busy} onClick={()=>progress('submitted')}>已在官网提交</Button><Button disabled={busy} onClick={()=>progress('submission_unknown')}>受理待核对</Button>{bundle.stage==='handoff_ready'&&<Button disabled={busy} onClick={release}>尚未提交，取消交接</Button>}</>}</Space>
   <details className="my-4"><summary>查看冻结的提示词与参数</summary><Input.TextArea readOnly value={bundle.request.prompt} rows={8}/>{'duration_seconds' in bundle.request&&<p>{bundle.request.reference_mode} · {bundle.request.duration_seconds} 秒 · {bundle.request.aspect_ratio} · {bundle.request.resolution||'分辨率未指定'}</p>}</details>
   {(bundle.request.subject_groups||[]).map((group:any,groupIndex:number)=><Card size="small" className="my-3" key={groupIndex} title={`同一主体：${group.name}`}><Space wrap>{group.media.map((media:any,index:number)=>{
    const ordinal=bundle.request.reference_file_ids.length+(bundle.request.source_video_file_id?1:0)+bundle.request.subject_groups.slice(0,groupIndex).reduce((total:number,item:any)=>total+item.media.length,0)+index
    const url=resolveAssetUrl(`/api/v1/studio/web-generation/tasks/${taskId}/handoff-references/${ordinal}`)
    return <div key={index} style={{width:180}}>{media.media_kind==='image'?<PreviewImage src={url} alt={`${group.name} 参考 ${index+1}`} style={{width:180,height:120,objectFit:'contain'}}/>:media.media_kind==='video'?<video src={url} controls preload="metadata" style={{width:180}}/>:<audio src={url} controls preload="metadata" style={{width:180}}/>}<a href={`${url}?download=true`} download>下载 {group.name} 素材 {index+1}</a></div>
   })}</Space></Card>)}{bundle.request.source_video_file_id&&<div className="my-3"><strong>待编辑原视频（冻结版本）</strong><video controls preload="metadata" style={{maxWidth:'100%',width:400}} src={resolveAssetUrl(`/api/v1/studio/web-generation/tasks/${taskId}/handoff-references/${bundle.request.reference_file_ids.length}`)}/><a href={resolveAssetUrl(`/api/v1/studio/web-generation/tasks/${taskId}/handoff-references/${bundle.request.reference_file_ids.length}?download=true`)}>下载原视频</a><p>保留要求：{bundle.request.preserve_instructions||'未额外填写'}；原音轨：{bundle.request.keep_audio?'要求保留':'不要求保留'}</p></div>}<div className="flex flex-wrap gap-3 my-4">{(bundle.request.reference_file_ids||[]).map((id:string,i:number)=><div key={`${i}:${id}`} style={{width:160}}><PreviewImage src={resolveAssetUrl(`/api/v1/studio/web-generation/tasks/${taskId}/handoff-references/${i}`)} alt={`参考图 ${i+1}`} style={{width:160,height:120,objectFit:'contain'}}/><a href={resolveAssetUrl(`/api/v1/studio/web-generation/tasks/${taskId}/handoff-references/${i}?download=true`)} download>下载参考图 {i+1}</a></div>)}</div>
   {bundle.manual&&bundle.status==='pending'&&<Button disabled={busy} onClick={release}>取消尚未分配任务</Button>}{(bundle.manual||bundle.can_import_original)&&bundle.status==='running'&&<Card size="small" title="将这条任务的官网原文件回填" className="my-4">
    <Space direction="vertical" style={{width:'100%'}}><Input aria-label="官网结果地址" value={url} onChange={e=>setUrl(e.target.value)} placeholder="官网具体结果页 / 会话地址"/><Input aria-label="官网结果编号" value={remoteId} onChange={e=>setRemoteId(e.target.value)} placeholder="官网作品或消息编号，不能填本地任务编号"/><Input value={model} onChange={e=>setModel(e.target.value)} placeholder="本次官网实际选定的完整模型名"/><Select style={{minWidth:260}} value={watermark} onChange={setWatermark} options={Object.entries(watermarkNames).filter(([key])=>key!=='待核对').map(([value,label])=>({value,label}))}/>{watermark==='official_clean'&&<Input value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="官网无水印导出选项或权益依据"/>}<input aria-label="官网原文件" type="file" accept={'duration_seconds' in bundle.request?'video/mp4':'image/png,image/jpeg,image/webp'} onChange={e=>setFile(e.target.files?.[0]||null)}/><Checkbox checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}>已核对指定账号、提示词、参考顺序与官网参数；这是该任务结果的官方下载原文件。</Checkbox><Button type="primary" loading={busy} disabled={!confirmed||!file||!url.trim()||!remoteId.trim()||!model.trim()||(watermark==='official_clean'&&!evidence.trim())} onClick={upload}>校验并回填原业务</Button></Space>
   </Card>}
   {bundle.result&&<Alert type={bundle.result.published?'success':'warning'} message={bundle.result.published?'已回填原业务对象':'文件已归档，未自动采用'} description={bundle.result.requires_adoption?'同一任务的多个原文件已全部归档，请在下方选择采用，不自动覆盖当前版本。':(bundle.result.spec_issues||[]).join('；')||(!bundle.result.published?'目标版本已变化，请在原业务中选择需要的版本。':'')}/>}
   {!!artifacts.length&&<><h3 className="mt-4">原文件与导出版本</h3><div className="flex flex-wrap gap-4">{artifacts.map(item=><Card key={item.artifact_id} size="small" style={{width:280}}>{item.modality==='video'?<video src={buildFileDownloadUrl(item.file_id)} controls preload="metadata" style={{width:'100%'}}/>:<PreviewImage src={buildFileDownloadUrl(item.file_id)} alt="归档图片" style={{width:'100%',height:180,objectFit:'contain'}}/>}<Tag>{watermarkNames[item.watermark]||'水印待核对'}</Tag><p>{item.role==='platform_raw_original'?'官网生成原件（未合成）':item.raw_original_file_id?'局部修正合成结果':item.source_file_id?(item.published?'已执行采用（当前选择以原业务为准）':'另存导出版本，尚未采用'):'平台原文件'}</p>{(item.source_file_id||bundle.request.target_type==='shot_edit'||bundle.result?.requires_adoption)&&!bundle.request.target_type.startsWith('lab_')&&item.role!=='platform_raw_original'&&!item.published&&<Button disabled={busy} onClick={()=>adopt(item.artifact_id)}>采用此版本</Button>}<a href={buildFileDownloadUrl(item.file_id)} download>下载原文件</a></Card>)}</div>
   {!bundle.request.edit_region&&<Card size="small" title="已有官方无水印下载：另存导出版本" className="mt-4"><Alert type="info" message="保留原文件和AI来源记录" description="使用官网提供的无水印原始下载。本功能不裁剪、涂抹或购买会员，也不将无水印等同于已获公开发布授权。"/><Space direction="vertical" className="mt-3" style={{width:'100%'}}><Input value={cleanEvidence} disabled={!!exportRequest.current} onChange={e=>setCleanEvidence(e.target.value)} placeholder="官网导出选项 / 已具备权益的依据"/><input type="file" aria-label="官方无水印文件" disabled={!!exportRequest.current} accept={'duration_seconds' in bundle.request?'video/mp4':'image/png,image/jpeg,image/webp'} onChange={e=>setCleanFile(e.target.files?.[0]||null)}/><Checkbox checked={cleanConfirmed} onChange={e=>setCleanConfirmed(e.target.checked)}>确认来自同账号、同一条生成结果的官方无水印导出，不是另一条重新生成的内容。</Checkbox><Button loading={busy} disabled={!cleanFile||!cleanEvidence.trim()||!cleanConfirmed} onClick={uploadClean}>校验并另存，不重新生成</Button></Space></Card>}</>}
  </>}
 </Card>
}
