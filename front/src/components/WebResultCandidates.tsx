import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Modal, Select, Space, Spin, Tag, message } from 'antd'
import { StudioWebGenerationService as Web } from '../services/generated'
import { PreviewImage } from './PreviewImage'
import { buildFileDownloadUrl } from '../pages/aiStudio/assets/utils'

type CandidateJob = { task_id:string; target_type:string; entity_id:string; slot_id?:number|null; candidate_count:number; created_at:string; model:string; status:string }
type Candidate = { artifact_id:string; file_id:string; modality:string; role?:string|null }
type Target = { version:number; file_id?:string|null }

/** Put original-task candidates beside their business object; polling never creates or adopts anything. */
export function WebResultCandidates({targetType,entityId,slotId,onAdopt}:{targetType:string;entityId:string;slotId?:number;onAdopt?:()=>void|Promise<void>}) {
 const scope=JSON.stringify([targetType,entityId,slotId]),active=useRef(scope),selected=useRef('')
 active.current=scope
 const [jobs,setJobs]=useState<CandidateJob[]>([]),[open,setOpen]=useState(false),[taskId,setTaskId]=useState('')
 const [items,setItems]=useState<Candidate[]>([]),[target,setTarget]=useState<Target|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(''),[revision,setRevision]=useState(0)
 selected.current=taskId
 /** Restore candidates by exact object/slot after navigation or refresh; discard late responses. */
 useEffect(()=>{
  let live=true,timer:ReturnType<typeof setTimeout>,loading=false,queued=false
  setJobs([]);setOpen(false);setTaskId('');setItems([]);setTarget(null);setError('');setBusy('')
  const poll=async()=>{
   if(!live)return
   if(loading){queued=true;return}
   clearTimeout(timer);loading=true
   try{
   const rows=await Web.handoffJobsApiV1StudioWebGenerationHandoffJobsGet({targetType,entityId,slotId})
   if(live)setJobs(rows.filter((row:any)=>row.status==='succeeded'&&row.candidate_count>1) as CandidateJob[])
  }catch{ /* Existing business UI stays usable when the optional result summary is unavailable. */ }
  finally{loading=false;if(live){const delay=queued?0:10000;queued=false;timer=setTimeout(()=>void poll(),delay)}}}
  /** Reuse the shared terminal notification; requests coalesce and remain scoped to this object. */
  const wake=()=>{void poll()}
  window.addEventListener('jellyfish:task-settled',wake);window.addEventListener('focus',wake)
  void poll();return()=>{live=false;clearTimeout(timer);window.removeEventListener('jellyfish:task-settled',wake);window.removeEventListener('focus',wake)}
 },[scope])
 const job=jobs.find(row=>row.task_id===taskId)
 /** Download previews only when requested, alongside the current selection used for compare-and-swap. */
 useEffect(()=>{
  if(!open||!job)return
  let live=true;setLoading(true);setError('');setItems([]);setTarget(null)
  void Promise.all([
   Web.webArtifactsApiV1StudioWebGenerationTasksTaskIdArtifactsGet({taskId:job.task_id}),
   Web.targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({targetType:job.target_type,entityId:job.entity_id,slotId:job.slot_id||1}),
  ]).then(([rows,current])=>{if(live){setItems(rows.filter(item=>item.role!=='platform_raw_original').map(item=>({artifact_id:item.artifact_id,file_id:item.file_id,modality:item.modality,role:item.role})));setTarget({version:current.version,file_id:current.file_id??null})}})
   .catch(()=>{if(live)setError('结果读取失败，请重试；原文件仍保留。')}).finally(()=>{if(live)setLoading(false)})
  return()=>{live=false}
 },[open,taskId,revision,scope])
 /** An explicit choice may replace the displayed current version; late changes are rejected by the backend. */
 const adopt=async(item:Candidate)=>{
  if(!job||!target||busy)return
  const originalScope=scope,originalTask=job.task_id;setBusy(item.artifact_id)
  try{
   await Web.adoptWebExportApiV1StudioWebGenerationTasksTaskIdArtifactsArtifactIdAdoptPost({taskId:originalTask,artifactId:item.artifact_id,requestBody:{expected_version:target.version,expected_current_file_id:target.file_id??null}})
   if(active.current===originalScope&&selected.current===originalTask){message.success('已采用所选结果，其他候选仍保留');setRevision(v=>v+1);await onAdopt?.()}
  }catch(e:any){if(active.current===originalScope&&selected.current===originalTask){setError(e?.status===409?'当前使用版本已变化，请刷新候选后再选择。':'采用未完成，候选仍保留，请重试。')}}
  finally{if(active.current===originalScope)setBusy('')}
 }
 if(!jobs.length)return null
 const count=jobs.reduce((sum,row)=>sum+row.candidate_count,0)
 return <div className="my-2 rounded-lg border border-blue-200 bg-blue-50 p-3" onClick={event=>event.stopPropagation()}>
  <div role="status" className="mb-2 text-sm text-blue-900">已生成 {count} 个候选，选择要使用的结果</div>
  <Button type="primary" size="small" onClick={()=>{setTaskId(jobs[0].task_id);setOpen(true)}}>选择生成结果（{count}）</Button>
  <Modal title="选择生成结果" open={open} onCancel={()=>setOpen(false)} footer={null} width={880} styles={{body:{maxHeight:'75vh',overflowY:'auto'}}}>
   <p>点击图片可放大，视频可直接播放。采用后只更换当前使用版本，所有候选仍保留。</p>
   {jobs.length>1&&<Select aria-label="选择生成批次" className="mb-3 w-full" value={taskId} disabled={!!busy} onChange={setTaskId} options={jobs.map(row=>({value:row.task_id,label:new Date(row.created_at).toLocaleString()+' · '+row.model+' · '+row.candidate_count+' 个结果'}))}/>}
   {error&&<Alert className="mb-3" type="warning" message={error} action={<Button onClick={()=>setRevision(v=>v+1)}>刷新候选</Button>}/>}
   {loading?<div className="p-8 text-center"><Spin/></div>:!items.length?<Empty description="暂无可查看的结果"/>:<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {items.map((item,index)=><Card key={item.artifact_id} size="small" title={'候选 '+(index+1)}>
     {item.modality==='video'?<video controls preload="metadata" src={buildFileDownloadUrl(item.file_id)} className="h-44 w-full bg-black object-contain"/>:<PreviewImage src={buildFileDownloadUrl(item.file_id)} alt={'候选 '+(index+1)} style={{height:176,width:'100%',objectFit:'contain'}}/>}
     <Space wrap className="mt-3">{target?.file_id===item.file_id?<Tag color="green">当前使用</Tag>:<Button type="primary" disabled={!!busy||!target} loading={busy===item.artifact_id} onClick={()=>void adopt(item)}>采用此结果</Button>}<a href={buildFileDownloadUrl(item.file_id)} download>下载</a></Space>
    </Card>)}
   </div>}
  </Modal>
 </div>
}
