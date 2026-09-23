import {submissionEnd} from './doubao-submission.mjs'
import { createHash } from 'node:crypto'
/** Collect only an image belonging to a verified conversation and reply message. */
import { captureOfficialDownload } from './official-download.mjs'
import { dismissAnnouncements, sessionBlocker } from './doubao-session.mjs'

/** Wait within the original user-message thread, including delayed replies after an acknowledgement.
 * A stable list is a collection heuristic, not proof of provider completion; never cross another user input.
 * Captcha suspends waiting, while the guard keeps cancellation responsive.
 */
export async function waitImageResults(page,remote,guard=async()=>{},timeout=10*60*1000){
 const {conversation_url,message_id,user_message_id}=remote
 let deadline=Date.now()+timeout,signature='',stableSince=0
 while(!page.isClosed()){
  await guard()
  if(await sessionBlocker(page)){deadline=Date.now()+timeout;await page.waitForTimeout(1000);continue}
  if(page.url()!==conversation_url)throw new Error('已离开原图片会话，停止采集')
  const rows=await page.locator('[data-message-id]').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-message-id'),user:n.classList.contains('justify-end'),sources:[...n.querySelectorAll('img[alt="image"]')].map(img=>({src:img.currentSrc||img.src,ready:img.complete&&img.naturalWidth>0}))})))
  let replies
  if(remote.binding_version===2){
   const index=submissionEnd(rows,remote)
   if(index<0)throw new Error('原图片用户消息编号缺失，禁止改用提示词匹配')
   replies=rows.slice(index+1)
   if(replies.some(n=>n.user))throw new Error('原图片会话出现其他输入，停止避免串用')
  }else replies=rows.filter(n=>n.id===message_id&&!n.user)
  const results=replies.filter(n=>n.sources.length)
  const count=results.reduce((sum,n)=>sum+n.sources.length,0)
  if(count>16)throw new Error('官网结果数量超出单次安全采集范围')
  const next=JSON.stringify(results)
  if(next!==signature){signature=next;stableSince=Date.now()}
  if(count&&results.every(n=>n.sources.every(img=>img.ready))&&Date.now()-stableSince>=6000)return results
  if(Date.now()>deadline){const error=new Error('原图片仍未完成，继续等待同一结果');error.code='WAITING_RESULT';throw error}
  await page.waitForTimeout(1000)
 }
 throw new Error('原图片窗口已关闭')
}

/** Download every original from the verified reply set; never rewrite signed thumbnail URLs. */
export async function downloadOriginal(page,remote,destination,guard=async()=>{},collection={original:async(_key,download)=>download()}) {
 const {conversation_url,message_id}=remote
 if(!/^https:\/\/www\.doubao\.com\/chat\/\d+$/.test(conversation_url) || !/^\d+$/.test(message_id)) throw new Error('Unverified conversation/message identity')
 if(page.url()!==conversation_url)await page.goto(conversation_url,{waitUntil:'domcontentloaded'})
 await dismissAnnouncements(page)
 const results=await waitImageResults(page,remote,guard)
 const count=results.reduce((sum,n)=>sum+n.sources.length,0),outputs=[]
 for(const result of results){
  const generated=page.locator('[data-message-id="'+result.id+'"]').locator('img[alt="image"]')
  for(let index=0;index<result.sources.length;index++){
   await guard()
   const sources=await generated.evaluateAll(nodes=>nodes.map(img=>img.currentSrc||img.src))
   if(page.url()!==conversation_url||JSON.stringify(sources)!==JSON.stringify(result.sources.map(img=>img.src)))throw new Error('原结果列表变化，重新核对同一回执')
   const descriptor={message_id:result.id,ordinal:index,source:result.sources[index].src}
   const originalPath=destination+'.'+createHash('sha256').update(JSON.stringify(descriptor)).digest('hex').slice(0,24)
   const output=await collection.original(descriptor,async()=>{
   await generated.nth(index).click()
   try{
   const precise=page.locator('button.bg-dbx-fill-highlight').filter({has:page.locator('svg path[d^="M20.375 14.8535"]')})
   const target=precise.filter({visible:true})
   await target.first().waitFor({state:'visible',timeout:20000})
   if(await target.count()!==1)throw new Error('原图下载按钮不唯一；请人工核对原窗口')
   return {...await captureOfficialDownload(page,()=>target.click(),originalPath),message_id:result.id,ordinal:index}}
   finally{await page.keyboard.press('Escape')}
   })
   outputs.push(output)
  }
 }
 return count===1?outputs[0]:{outputs}
}
