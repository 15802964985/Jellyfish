import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Modal, Space, message } from 'antd'
import { StudioFilesService, StudioMediaAssetsService, type FileRead, type ManualMediaSelection, type ManualMediaState } from '../services/generated'
import { MediaFilePicker } from '../pages/aiStudio/files/MediaFilePicker'
import { FilePreviewModal } from '../pages/aiStudio/files/FilePreviewModal'
import { PreviewImage } from './PreviewImage'
import { buildFileDownloadUrl } from '../pages/aiStudio/assets/utils'

type Target = Omit<ManualMediaSelection, 'file_id' | 'expected_version'>
type Props = { target:Target; label?:string; title?:string; onAdopted:()=>void|Promise<void> }

/** Remount on business identity changes so an old upload/selection never targets a new object. */
export function ManualMediaButton(props:Props) {
 return <ManualMediaControl key={JSON.stringify(props.target)} {...props}/>
}

/** Select or upload locally, preview, then explicitly adopt against the viewed slot version. */
function ManualMediaControl({target,label,title,onAdopted}:Props) {
 const kind=target.target_type==='shot'?'video':'image', noun=kind==='video'?'视频':'图片'
 const [open,setOpen]=useState(false),[picker,setPicker]=useState(false),[preview,setPreview]=useState(false)
 const [snapshot,setSnapshot]=useState<ManualMediaState|null>(null),[file,setFile]=useState<FileRead|null>(null)
 const [loading,setLoading]=useState(false),[uploading,setUploading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('')
 const input=useRef<HTMLInputElement>(null),epoch=useRef(0),alive=useRef(true),adopting=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++}},[])
 /** Only the latest open session may update its confirmation snapshot. */
 const read=async()=>{
  const token=++epoch.current;setLoading(true);setSnapshot(null);setError('')
  try{const result=await StudioMediaAssetsService.manualMediaTargetApiApiV1StudioMediaAssetsManualSelectionGet({targetType:target.target_type,entityId:target.entity_id,slotId:target.slot_id,frameType:target.frame_type})
   if(alive.current&&token===epoch.current){if(!result.data)throw Error('目标读取失败');setSnapshot(result.data)}
  }catch(e:any){if(alive.current&&token===epoch.current)setError(e?.body?.detail||e?.message||'读取失败，请重试')}
  finally{if(alive.current&&token===epoch.current)setLoading(false)}
 }
 /** Closing abandons selection only; an uploaded file remains reusable in file management. */
 const close=()=>{epoch.current++;setOpen(false);setPicker(false);setPreview(false);setUploading(false);setLoading(false)}
 /** Upload through the existing file API; upload alone never changes the business slot. */
 const upload=async(value?:File)=>{
  if(!value)return
  if(value.type&&!value.type.startsWith(kind+'/')){message.error('请选择'+noun+'文件');return}
  const token=epoch.current;setUploading(true);setError('')
  try{const result=await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({name:value.name.replace(/\.[^.]+$/,''),formData:{file:value as unknown as string}})
   if(alive.current&&token===epoch.current){if(!result.data||result.data.type!==kind)throw Error('上传文件类型不符，请重新选择');setFile(result.data)}
  }catch(e:any){if(alive.current&&token===epoch.current)setError(e?.body?.detail||e?.message||'上传失败，请重试')}
  finally{if(alive.current&&token===epoch.current)setUploading(false)}
 }
 /** A conflict requires a fresh explicit review; never silently retries a changed target. */
 const adopt=async()=>{
  if(!file||!snapshot||adopting.current)return
  const token=epoch.current;adopting.current=true;setSaving(true);setError('')
  try{await StudioMediaAssetsService.adoptManualMediaApiApiV1StudioMediaAssetsManualSelectionPost({requestBody:{...target,slot_id:snapshot.slot_id??target.slot_id,file_id:file.id,expected_version:snapshot.version}})
   if(alive.current){if(token===epoch.current)close();message.success('已采用'+noun);try{await onAdopted()}catch{message.warning('已保存，请刷新页面查看最新素材')}}
  }catch(e:any){if(alive.current&&token===epoch.current){setError(e?.body?.detail||'采用未确认，请重新核对当前素材后重试');setSnapshot(null)}}
  finally{adopting.current=false;if(alive.current)setSaving(false)}
 }
 return <>
  <Button size="small" onClick={()=>{setFile(null);setOpen(true);void read()}}>{label||'修改'+noun}</Button>
  <Modal title={title||'修改'+noun} open={open} onCancel={close} width={640} footer={<Space><Button onClick={close}>取消</Button><Button type="primary" loading={saving} disabled={!snapshot||!file||uploading||loading||saving||file.id===snapshot.file_id} onClick={()=>void adopt()}>确认采用{noun}</Button></Space>}>
   <p>从文件管理选择或上传素材，预览后确认采用。原文件保留，不调用模型。</p>
   {error&&<Alert className="mb-3" type="error" message={error} action={<Button onClick={()=>void read()} disabled={saving||uploading}>重新核对</Button>}/>}
   <Space wrap><Button disabled={!snapshot||uploading||saving} onClick={()=>setPicker(true)}>从文件管理选择</Button><Button loading={uploading} disabled={!snapshot||saving||uploading} onClick={()=>input.current?.click()}>上传素材</Button></Space>
   <input ref={input} type="file" accept={kind+'/*'} hidden aria-label={'上传'+noun} onChange={event=>{const selected=event.target.files?.[0];event.target.value='';void upload(selected)}}/>
   {loading&&<p>正在读取当前素材…</p>}
   {snapshot?.file_id&&<details className="mt-3"><summary>查看当前使用的{noun}</summary>{kind==='image'?<PreviewImage className="max-h-48 max-w-full" src={buildFileDownloadUrl(snapshot.file_id)} alt="当前图片"/>:<video className="max-h-48 w-full" controls preload="metadata" src={buildFileDownloadUrl(snapshot.file_id)}/>}</details>}
   {file&&<div className="mt-4"><p>{file.name}{file.id===snapshot?.file_id?'（当前已使用）':''}</p>{kind==='image'?<PreviewImage className="max-h-72 max-w-full" src={buildFileDownloadUrl(file.id)} alt={file.name}/>:<video className="max-h-72 w-full" controls preload="metadata" src={buildFileDownloadUrl(file.id)}/>}<Button className="mt-2" onClick={()=>setPreview(true)}>打开预览</Button></div>}
  </Modal>
  {picker&&open&&<MediaFilePicker title={'从文件管理选择'+noun} kind={kind} selectedIds={file?[file.id]:[]} onClose={()=>setPicker(false)} onSelect={selected=>{setFile(selected);setPicker(false)}}/>}
  <FilePreviewModal file={preview&&open?file:null} onClose={()=>setPreview(false)}/>
 </>
}
