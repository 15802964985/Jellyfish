import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Select, Tag } from 'antd'
import { StudioGenerationTasksService, type QualityReviewRecord, type ReviewGenerationContext_Input as ReviewContext } from '../../../../services/generated'
import { QualityReviewPanel, reviewContextKey } from './QualityReviewPanel'
import { CharacterViewPicker } from '../../components/CharacterViewPicker'
import { PreviewImage } from '../../../../components/PreviewImage'
import { buildFileDownloadUrl } from '../../assets/utils'

export type FrameApplication = { record: QualityReviewRecord; prompt: string; before: string; binding: string }
/** 阶段和被检查结果不是下一次生成输入；其余模型/来源/顺序必须精确一致。 */
export function frameInputKey(context: ReviewContext) { return reviewContextKey({...context, stage:'before',output_file_id:null}) }

/** 单帧辅助流程：免费本地检查，按版本检查产物，持久优化可应用/恢复，不自动付费。 */
export function FrameQualityWorkflow({shotId,scope,basePrompt,context,ready,application,outputs,onApplication,onRefresh,initialOutput}: {
 initialOutput?:string;
 shotId:string;scope:'first'|'key'|'last';basePrompt:string;context:ReviewContext;ready:boolean;
 application:FrameApplication|null;outputs:Array<{fileId:string;thumbUrl:string}>;
 onApplication:(value:FrameApplication|null)=>void;onRefresh:()=>void
}) {
 const [stage,setStage]=useState<'before'|'after'>(initialOutput?'after':'before')
 const [output,setOutput]=useState<string|undefined>(initialOutput)
 const [baselines,setBaselines]=useState<string[]>([])
 const [checks,setChecks]=useState<Array<{key:string;ok:boolean;message:string}>>([])
 const [checking,setChecking]=useState(false),[error,setError]=useState('')
 const binding=frameInputKey(context)
 const effective=application && application.before===basePrompt && application.binding===binding ? application : null
 const prompt=effective?.prompt || basePrompt
 const reviewContext=useMemo(()=>({...context,stage,output_file_id:stage==='after'?output:null}),[binding,stage,output])
 useEffect(()=>{
  let cancelled=false
  setChecks([]);setError('')
  if(!ready)return
  setChecking(true)
  const timer=setTimeout(()=>{void StudioGenerationTasksService.checkFrameReviewApiV1StudioGenerationTasksShotsShotIdFrameReviewCheckPost({shotId,requestBody:{scope,prompt:basePrompt,generation_context:context}})
    .then(r=>{if(!cancelled)setChecks(r.data?.checks||[])}).catch(e=>{if(!cancelled)setError(String(e))}).finally(()=>{if(!cancelled)setChecking(false)})},350)
  return ()=>{cancelled=true;clearTimeout(timer)}
 },[shotId,scope,basePrompt,binding,ready])
 const inputReady=ready&&!checking&&!error&&checks.length>0&&checks.every(c=>c.ok)&&(stage==='before'||!!output)
 /** 免费读取已应用版本；只有输入一致才恢复到实际发送稿。 */
 const recover=useCallback((record:QualityReviewRecord|null)=>{
  if(record?.application?.active && record.application.generation_context?.draft_prompt===basePrompt && record.application.generation_context && frameInputKey(record.application.generation_context)===binding){
   onApplication({record,prompt:record.application.prompt,before:basePrompt,binding})
  }
 },[basePrompt,binding,onApplication])
 useEffect(()=>{
  let cancelled=false
  StudioGenerationTasksService.getQualityReviewHistoryApiV1StudioGenerationTasksShotsShotIdQualityReviewsGet({shotId,scope,page:1,pageSize:10})
    .then(r=>{if(!cancelled)recover(r.data?.latest_applied||null)}).catch(()=>{})
  return ()=>{cancelled=true}
 },[shotId,scope,recover])
 /** 应用成功才替换发送文本，原始模板草稿保持可恢复，结果像素不会被自动改动。 */
 const apply=async(record:QualityReviewRecord,proposed:string)=>{
  if(record.prompt!==prompt||reviewContextKey(record.generation_context)!==reviewContextKey(reviewContext))throw new Error('本帧输入已变化，请重新核对')
  const result=await StudioGenerationTasksService.applyQualityRevisionApiV1StudioGenerationTasksShotsShotIdQualityReviewsTaskIdApplyPost({shotId,taskId:record.task_id,requestBody:{prompt:proposed,before_prompt:record.prompt,image_file_ids:context.image_file_ids,generation_context:reviewContext}})
  if(result.data)onApplication({record:result.data,prompt:proposed,before:basePrompt,binding})
 }
 const restore=async(record:QualityReviewRecord)=>{
  await StudioGenerationTasksService.restoreQualityRevisionApiV1StudioGenerationTasksShotsShotIdQualityReviewsTaskIdRestorePost({shotId,taskId:record.task_id})
  onApplication(null)
 }
 return <section className="mt-4 space-y-3" aria-label="帧图质量辅助">
  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
   <strong>基础检查 · 免费</strong>
   {!ready&&<p>请先填写提示词、选定规格并更新发送预览。</p>}
   {checking&&<p>正在核对当前输入…</p>}
   {checks.map(c=><div key={c.key}><Tag color={c.ok?'green':'orange'}>{c.ok?'已核对':'待处理'}</Tag>{c.message}</div>)}
   {error&&<Alert type="error" message={error}/>}
   <p className="mb-0 text-xs text-slate-500">核对输入和模型规格，不调用AI、不判断尚未生成的画面质量。</p>
  </div>
  {application&&!effective&&<Alert type="warning" message="已有优化稿，但当前提示词、参考图或模型规格已变化；本次不会使用旧稿。"/>}
  {effective&&<Alert type="success" message="本帧已应用智能优化；下方最终发送预览与实际生成一致"/>}
  <details open={initialOutput ? true : undefined} className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer">AI 检查与优化（可选） · 不影响直接生成</summary>
   <p>生成前检查单张画面意图；生成后检查具体图片版本。应用优化只改变下一次生成提示词，不会修改现有图片。</p>
   <Select aria-label="图片检查阶段" value={stage} onChange={setStage} options={[{value:'before',label:'生成前 · 提示词与参考图'},{value:'after',label:'生成后 · 检查具体图片'}]} style={{width:'100%'}}/>
   {stage==='after'&&<div className="my-3 space-y-3">
    <Select aria-label="待检查图片版本" placeholder="明确选择要检查的图片版本" value={output} onChange={setOutput} style={{width:'100%'}} options={outputs.map((v,i)=>({value:v.fileId,label:`图片版本 ${i+1} · ${v.fileId}`}))}/>
    <Button onClick={onRefresh}>刷新已有图片（免费）</Button>
    {!outputs.length&&<Alert type="info" message="暂无图片，请先生成或上传；可先使用生成前检查。"/>}
    {output&&<PreviewImage src={buildFileDownloadUrl(output)} alt="本次待检查图片" className="h-40 w-full object-contain"/>}
    <CharacterViewPicker shotId={shotId} selected={baselines} onClearFiles={ids=>setBaselines(prev=>prev.filter(id=>!ids.includes(id)))} canAdd={()=>baselines.length<3} onToggle={(_,v,checked)=>setBaselines(prev=>checked?[...new Set([...prev,v.file_id])]:prev.filter(id=>id!==v.file_id))}/>
    <p>选择角色基准后，在下方确认实际送检的图片；总共最多4张（包含待检查图）。</p>
   </div>}
   <QualityReviewPanel key={`${shotId}:${scope}:${stage}:${output||''}`} shotId={shotId} scope={scope} prompt={prompt}
    inputReady={inputReady} disabledReason={stage==='after'&&!output?'请先选择具体图片版本':!ready?'请先更新最终提示词和规格（免费）':error||'请先解决上方基础检查中的待处理项'}
    imageFileIds={stage==='after'?[...new Set([...(output?[output]:[]),...baselines])]:context.image_file_ids}
    generationContext={reviewContext} onApply={apply} onRestore={restore} onLatestApplied={recover}/>
  </details>
 </section>
}
