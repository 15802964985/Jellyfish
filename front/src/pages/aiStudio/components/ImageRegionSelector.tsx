import { useRef } from 'react'
import { Button } from 'antd'
import type { ImageEditRegion } from '../../../services/generated'
import { buildFileDownloadUrl } from '../assets/utils'

/** Select a normalized rectangle on the displayed original; coordinates never depend on zoom or file size. */
export function ImageRegionSelector({fileId,value,onChange,onRatio,disabled}: {
  fileId:string;value:ImageEditRegion|null;onChange:(value:ImageEditRegion|null)=>void;onRatio:(ratio:string|null)=>void;disabled:boolean
}) {
  const start=useRef<{x:number;y:number}|null>(null)
  return <section className="my-3 rounded border p-3">
    <strong>框选修正 · 图像编辑＋本地合成</strong>
    <p>拖动框选需要修改的区域，在提示词中描述修改要求。只支持已接通的即梦图片3.0或FLUX Kontext Pro；按正常生图计费，不保证更便宜。原文件保留，框外使用原图像素，框内需比较验收。红框会随原图一起发送。</p>
    <div style={{position:'relative',maxWidth:520,touchAction:'none',userSelect:'none'}}
      onPointerDown={event=>{if(disabled)return;const box=event.currentTarget.getBoundingClientRect();start.current={x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};event.currentTarget.setPointerCapture(event.pointerId)}}
      onPointerMove={event=>{if(!start.current||disabled)return;const box=event.currentTarget.getBoundingClientRect();const x=Math.max(0,Math.min(1,(event.clientX-box.left)/box.width));const y=Math.max(0,Math.min(1,(event.clientY-box.top)/box.height));const w=Math.abs(x-start.current.x),h=Math.abs(y-start.current.y);if(w>.01&&h>.01)onChange({x:Math.min(x,start.current.x),y:Math.min(y,start.current.y),width:w,height:h})}}
      onPointerUp={()=>{start.current=null}} onPointerCancel={()=>{start.current=null}}>
      <img src={buildFileDownloadUrl(fileId)} alt="待修正原图，拖动框选" draggable={false} style={{display:'block',width:'100%'}} onLoad={event=>{const img=event.currentTarget;const ratio=img.naturalWidth/img.naturalHeight;const match=['1:1','16:9','9:16','4:3','3:4','3:2','2:3','21:9'].find(text=>{const [w,h]=text.split(':').map(Number);return Math.abs((w/h)/ratio-1)<.01});onRatio(match??null)}} />
      {value&&<div style={{pointerEvents:'none',position:'absolute',border:'2px solid red',left:`${value.x*100}%`,top:`${value.y*100}%`,width:`${value.width*100}%`,height:`${value.height*100}%`}} />}
    </div>
    <Button size="small" disabled={disabled} onClick={()=>onChange(null)}>清除框选，恢复普通生成</Button>
    <p>{value?'已框选；生成结果会出现在本会话，与原图并列比较。':'尚未框选，当前仍为普通参考图生成。'}</p>
  </section>
}
