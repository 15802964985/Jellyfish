/** Preserve the exact official download without Edge 152's crashing saveAs/path calls. */
import {open,rename,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';

/** Save a same-origin blob supplied by the website's download event, never a preview URL.
 * The download URL must belong to the currently open official page. Unsupported schemes
 * fail closed so callers resume collection rather than generate another paid result.
 */
export async function saveOfficialBlobDownload(page,download,destination,captureKey=null){
 const url=download.url(),origin=new URL(page.url()).origin;
 if(!url.startsWith(`blob:${origin}/`))throw Error('Official download is not a same-origin blob');
 const transferKey='__jellyfish_transfer_'+randomUUID().replaceAll('-','');
 const temp=destination+'.'+randomUUID()+'.tmp';let file;
 try{
  const size=await page.evaluate(async ({url,captureKey,transferKey})=>{
   let blob=captureKey ? window[captureKey]?.blobs.get(url) : null;
   if(!blob){const response=await fetch(url);if(!response.ok)throw Error('Official blob unavailable');blob=await response.blob();}
   if(!blob.size||blob.size>500*1024*1024)throw Error('Invalid original size');
   if(!['video/mp4','image/png','image/jpeg','image/webp','application/octet-stream'].includes(blob.type))throw Error('Unsupported original type');
   window[transferKey]=blob;return blob.size;
  },{url,captureKey,transferKey});
  file=await open(temp,'wx',0o600);const hash=createHash('sha256');let bytes=0;
  // Bound Playwright/base64 allocations to 4 MiB; the official Blob is never rewritten.
  for(let offset=0;offset<size;offset+=4*1024*1024){
   const end=Math.min(size,offset+4*1024*1024);
   const data=await page.evaluate(async({transferKey,offset,end})=>await new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(Error('Cannot read official original'));
    reader.onload=()=>resolve(reader.result);reader.readAsDataURL(window[transferKey].slice(offset,end));
   }),{transferKey,offset,end});
   const chunk=Buffer.from(data.slice(data.indexOf(',')+1),'base64');
   if(chunk.length!==end-offset)throw Error('Incomplete official original chunk');
   await file.writeFile(chunk);hash.update(chunk);bytes+=chunk.length;
  }
  await file.sync();await file.close();file=null;await rename(temp,destination);
  return {path:destination,bytes,sha256:hash.digest('hex')};
 }finally{
  await file?.close();await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error});
  if(!page.isClosed())await page.evaluate(key=>{delete window[key]},transferKey).catch(()=>{});
 }
}

/** Capture the Blob produced by the official download button before native Edge delivery.
 * Edge 152 may crash on resumed-profile downloads. Intercept only this bounded click's
 * same-origin Blob anchor, preserve its exact bytes, and restore both hooks in finally.
 * No media URL rewriting, generation request, account switch, or content alteration occurs.
 */
export async function captureOfficialDownload(page,click,destination){
 const key='__jellyfish_download_'+randomUUID().replaceAll('-','');
 await page.evaluate(key=>{
  const original=URL.createObjectURL,anchorClick=HTMLAnchorElement.prototype.click,blobs=new Map();
  const state={original,anchorClick,blobs,captured:null};
  state.hook=function(blob){const url=original.call(URL,blob);if(blob instanceof Blob)blobs.set(url,blob);return url};
  state.clickHook=function(){
   const url=this.href;
   if(this.hasAttribute('download')){
    if(state.captured){state.error='Multiple original downloads require manual reconciliation';return;}
    if(!url.startsWith('blob:'+location.origin+'/')||!blobs.has(url)){state.error='Unsupported original download; preserve task for collection';return;}
    state.captured={url,name:this.download};return;
   }
   return anchorClick.call(this);
  };
  window[key]=state;URL.createObjectURL=state.hook;HTMLAnchorElement.prototype.click=state.clickHook;
 },key);
 try{
  await click();await page.waitForFunction(key=>Boolean(window[key]?.captured||window[key]?.error),key,{timeout:60000});
  const captured=await page.evaluate(key=>{if(window[key].error)throw Error(window[key].error);return window[key].captured},key);
  return await saveOfficialBlobDownload(page,{url:()=>captured.url},destination,key);
 }finally{
  if(!page.isClosed())await page.evaluate(key=>{
   const state=window[key];if(state){
    if(URL.createObjectURL===state.hook)URL.createObjectURL=state.original;
    if(HTMLAnchorElement.prototype.click===state.clickHook)HTMLAnchorElement.prototype.click=state.anchorClick;
    state.blobs.clear();delete window[key];
   }
  },key);
 }
}
