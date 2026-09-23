import {submissionEnd} from './doubao-submission.mjs'
import { createHash } from 'node:crypto'
/** Doubao webpage video adapter. Uses visible controls and exact task receipts, never private generation APIs. */
import {basename} from 'node:path'
import {clearDraft,doubaoImageAdapter,fillPrompt,firstComposer} from './doubao-adapter.mjs'
import {dismissAnnouncements,dismissAffordance,sessionBlocker} from './doubao-session.mjs'
import {captureOfficialDownload} from './official-download.mjs'
import {matchingPromptIds,promptMatches} from './doubao-messages.mjs'
export const VIDEO_MODELS=['Seedance 2.0 Mini','Seedance 2.0 Fast']
const START='开始生成视频'
const normalize=value=>value.replace(/\s+/g,' ').trim()

/** Deduplicate nested card/video nodes by their outer result container. */
export async function videoCandidates(reply){
 return await reply.locator('[class*="block-video"], video').evaluateAll(nodes=>nodes.filter(n=>!nodes.some(other=>other!==n&&other.contains(n))).length)
}

/** Parse complete displayed specifications; missing or contradictory fields never authorize a send. */
export function confirmationMatches(text,request){
 const normalized=text.normalize('NFKC')
 const aspects=[...normalized.matchAll(/(?<!\d)(\d{1,2})\s*:\s*(\d{1,2})(?!\d)/g)].map(m=>`${Number(m[1])}:${Number(m[2])}`)
 const durations=[...normalized.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(?:秒|s\b)/gi)].map(m=>Number(m[1]))
 const models=VIDEO_MODELS.filter(model=>normalized.includes(model))
 return models.length===1&&models[0]===request.requested_model&&aspects.length>0&&durations.length>0
  &&aspects.every(value=>value===request.aspect_ratio)&&durations.every(value=>value===request.duration_seconds)
}

/** Enter the explicit video composer; opening controls does not submit a generation. */
export async function openVideoEntry(page){
 await dismissAnnouncements(page)
 if(await sessionBlocker(page))return false
 const model=page.getByRole('button',{name:/^模型 Seedance/})
 try{await model.waitFor({state:'visible',timeout:3000})}catch{await page.getByText('视频生成',{exact:true}).first().click({timeout:15000});await model.waitFor({timeout:30000})}
 return true
}

/** Observe allowed names in the actual account menu; names alone never expand adapter support. */
export async function observeVideoModels(page){
 if(!await openVideoEntry(page))return []
 const model=page.getByRole('button',{name:/^模型 Seedance/})
 await model.click()
 try{
  const found=[]
  for(const name of VIDEO_MODELS){const option=page.getByText(name,{exact:true}).last();if(await option.isVisible()&&await option.isEnabled())found.push(name)}
  return found
 }finally{await page.keyboard.press('Escape')}
}

/** Scope all following messages to the frozen user message, permitting at most one generation confirmation. */
export async function videoThread(page,anchor,prompt){
 const nodes=await page.locator('[data-message-id]').evaluateAll(elements=>elements.map(n=>{const media=[...n.querySelectorAll('[class*="block-video"], video')];return {id:n.getAttribute('data-message-id'),user:n.classList.contains('justify-end'),text:n.innerText,cards:media.filter(node=>!media.some(other=>other!==node&&other.contains(node))).length}}))
 const index=nodes.findIndex(n=>n.id===anchor.user_message_id&&n.user)
 if(index<0)throw new Error('原视频会话用户消息节点已不在（豆包可能改版），停止恢复')
 if(anchor.binding_version!==2&&!promptMatches(nodes[index].text,prompt))throw new Error('原视频提示词消息内容不匹配，禁止使用其他会话结果')
 const end=anchor.binding_version===2?submissionEnd(nodes,anchor):index
 const thread=nodes.slice(end+1),users=thread.filter(n=>n.user)
 const results=thread.filter(n=>!n.user&&n.cards>0)
 // A benign manual confirmation is a button click (no extra text) or exactly the START phrase, neither of which
 // trips this guard; only a genuinely different user prompt blocks, preventing cross-use of another result.
 if(users.length>1||users.some(n=>normalize(n.text)!==START))throw new Error('原会话出现其他输入，暂停避免串用视频结果')
 return {results,confirmation:users[0],replies:thread.filter(n=>!n.user)}
}

/** Wait for the original result. A matching parameter confirmation is sent once, with intent saved before Enter. */
async function waitVideo(page,request,initial,checkpoint,{restore=false,guard=async()=>{}}={}){
 let anchor={...initial}
 if(restore)await page.goto(anchor.conversation_url,{waitUntil:'domcontentloaded'})
 const deadline=Date.now()+30*60*1000
 let candidateSignature='',stableSince=0
 while(!page.isClosed()){
  await guard()
  await dismissAnnouncements(page)
  // Always check for a pure up-sell/risk card first; dismissAffordance closes it
  // without disturbing the genuine "confirm to start" flow.
  await dismissAffordance(page).catch(()=>{})
  if(await sessionBlocker(page)){await page.waitForTimeout(2000);continue}
  if(page.url()!==anchor.conversation_url)throw new Error('已离开原视频会话，暂停核对')
  await page.locator(`[data-message-id="${anchor.user_message_id}"]`).waitFor({timeout:30000})
  const thread=await videoThread(page,anchor,request.prompt)
  if(thread.results.length){
   const signature=JSON.stringify(thread.results.map(n=>[n.id,n.cards]))
   if(signature!==candidateSignature){candidateSignature=signature;stableSince=Date.now()}
   if(Date.now()-stableSince<6000){await page.waitForTimeout(1000);continue}
   return {...anchor,message_id:thread.results[0].id,result_messages:thread.results.map(n=>({message_id:n.id,count:n.cards}))}
  }
  if(thread.replies.some(n=>/生成失败|未能生成|生成出错/.test(n.text)))throw new Error('官网报告视频生成失败，保留原任务，不自动重试生成')
  const confirm=thread.replies.find(n=>/确认后.*开始生成|确认.*再.*生成视频/.test(n.text))
  if(confirm&&!thread.confirmation){
   // License / membership / purchase / payment / safety text is only treated as a
   // blocking confirmation when it is presented as a real modal (with backdrop or
   // dialog role). Inline chat copy mentioning "安全确认" or "授权" used to throw
   // here on every page that displayed up-sell or risk text — that was the main
   // source of "standard-plan account still asks me to upgrade" false positives.
   const confirmNode=page.locator(`[data-message-id="${confirm.id}"]`).first()
   const modalLike=await confirmNode.evaluate(target=>{
    let parent=target
    while(parent){
     const style=getComputedStyle(parent)
     const role=parent.getAttribute('role')
     if(role==='dialog'||role==='alertdialog')return true
     if(style.position==='fixed'&&Number(style.zIndex)>=100&&parent.querySelector('[class*=overlay],[class*=mask],[class*=backdrop]'))return true
     parent=parent.parentElement
    }
    return false
   }).catch(()=>false)
   if(modalLike && /授权|会员|购买|支付|安全确认/.test(confirm.text))throw new Error('官网需要单独授权或权益确认，请核对原窗口')
   // Presentation may vary, but model, aspect and duration must all match the frozen request.
   if(!confirmationMatches(confirm.text,request))throw new Error('官网确认的模型或参数不完整/不一致，不自动确认')
   if(anchor.confirmation_intent)throw new Error('原确认消息尚未取得回执，不再次发送')
   anchor={...anchor,confirmation_intent:new Date().toISOString()};await checkpoint(anchor)
   // The redesigned Tiptap composer ignores programmatic fill(); send real input events.
   const composer=await firstComposer(page)
   await composer.click({timeout:10000}).catch(()=>{})
   await page.keyboard.press('Control+A');await page.keyboard.insertText(START);await composer.press('Enter')
  }
  if(Date.now()>deadline){const error=new Error('官网仍在生成，继续等待原结果');error.code='WAITING_RESULT';throw error}
  await page.waitForTimeout(3000)
 }
 throw new Error('原视频窗口已关闭，保留回执等待恢复')
}

/** Select exact visible model, aspect and slider duration, upload ordered references, then collect one original MP4. */
export function doubaoVideoAdapter(page,paths,destination,guard=async()=>{}){
 return {
  async prepare(request){
   if(!VIDEO_MODELS.includes(request.requested_model)||!['text','first_frame'].includes(request.reference_mode)||request.resolution||request.source_video_file_id)throw new Error('所选视频模型或参考/分辨率模式尚未通过网页适配')
   if(paths.length!==(request.reference_mode==='first_frame'?1:0))throw new Error('视频参考角色与文件数量不一致')
   await clearDraft(page)
   if(!await openVideoEntry(page))throw new Error('请先处理官网登录或验证')
   const model=page.getByRole('button',{name:/^模型 Seedance/})
   const selected=page.getByRole('button',{name:`模型 ${request.requested_model}`,exact:true})
   // Initial hydration can replace the menu. Retrying model selection is safe only before submission.
   for(let attempt=0;!await selected.isVisible();attempt++){
    if(attempt>=3)throw new Error('官网模型选择未稳定，停止提交')
    try{await model.click({timeout:5000});await page.getByText(request.requested_model,{exact:true}).last().click({timeout:5000});await selected.waitFor({timeout:5000})}catch{await page.keyboard.press('Escape');await page.waitForTimeout(1000)}
   }
   await selected.waitFor({timeout:15000})
   const params=page.getByRole('button',{name:/ · \d+s$/})
   await params.click();await page.getByText(request.aspect_ratio,{exact:true}).last().click()
   const slider=page.getByRole('slider')
   if(!await slider.isVisible())await params.click()
   await slider.waitFor({timeout:10000})
   // The slider value is an index (observed 0..11), not seconds. Verify visible duration after each key.
   const duration=async()=>{const label=await params.innerText();const match=label.match(/ · (\d+)s$/);if(!match)throw new Error('官网时长标签变化');return Number(match[1])}
   await slider.press('Home');const minimum=await duration()
   await slider.press('End');const maximum=await duration()
   if(request.duration_seconds<minimum||request.duration_seconds>maximum)throw new Error(`官网当前时长范围为${minimum}—${maximum}秒，已停止，未生成`)
   await slider.press('Home')
   for(let step=0;await duration()!==request.duration_seconds;step++){
    if(step>=120||await duration()>request.duration_seconds)throw new Error('所选时长不在官网实际档位中，停止生成')
    const previous=await duration();await slider.press('ArrowRight');if(await duration()<=previous)throw new Error('官网时长控件没有按预期变化')
   }
   await page.getByRole('button',{name:`${request.aspect_ratio} · ${request.duration_seconds}s`,exact:true}).waitFor({timeout:10000})
   await page.keyboard.press('Escape')
   const cards=page.locator('[class*="horizontal-scroll-container"] [data-kind="image"]')
   for(let n=0;await cards.count();n++){if(n>=10||await cards.first().locator('button').count()!==1)throw new Error('视频草稿附件入口变化，停止以防多传参考');await cards.first().locator('button').click()}
   if(paths.length){
    await page.locator('input[type=file]').setInputFiles(paths)
    await page.waitForFunction(names=>{const cards=[...document.querySelectorAll('[class*="horizontal-scroll-container"] [data-kind="image"]')];return cards.length===names.length&&cards.every((card,i)=>{const img=card.querySelector('img');return img?.alt===names[i]&&img.complete&&img.naturalWidth>0})},paths.map(path=>basename(path)),{timeout:60000})
   }
   await fillPrompt(page, request.prompt)
   await page.waitForFunction(()=>!/(^|\s)\d{1,3}%($|\s)/.test(document.body.innerText),null,{timeout:60000})
  },
  async submit(request,checkpoint=async()=>{}){
   const first=await doubaoImageAdapter(page,[],null,guard).submit(request,checkpoint)
   const anchor={...first};delete anchor.message_id
   await checkpoint(anchor)
   return await waitVideo(page,request,anchor,checkpoint,{guard})
  },
  async reconcile(anchor,request,checkpoint=async()=>{}){
   if(anchor.binding_version===2&&anchor.local_task_id!==request.local_task_id)throw new Error('任务绑定编号不一致，禁止恢复其他任务')
   if(!/^https:\/\/www\.doubao\.com\/chat\/\d+$/.test(anchor.conversation_url))return null
   if(anchor.binding_version===2&&!anchor.user_message_id){
    const remote=await doubaoImageAdapter(page,[],null,guard).reconcile(anchor,request,checkpoint)
    if(!remote)return null
    anchor={...remote};delete anchor.message_id
   }
   if(!/^\d+$/.test(anchor.user_message_id||'')){
    await page.goto(anchor.conversation_url,{waitUntil:'domcontentloaded'})
    await page.locator('[data-message-id].justify-end').first().waitFor({state:'attached',timeout:30000})
    const ids=anchor.binding_version===2&&anchor.exclusive_empty?await page.locator('[data-message-id].justify-end').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-message-id'))):await matchingPromptIds(page,request.prompt)
    if(ids.length!==1)throw new Error('原视频会话没有唯一匹配输入，停止恢复')
    anchor={...anchor,user_message_id:ids[0]};await checkpoint(anchor)
   }
   return await waitVideo(page,request,anchor,checkpoint,{restore:true,guard})
  },
  async collect(remote,_request,collection={original:async(_key,download)=>download()}){
   if(!/^https:\/\/www\.doubao\.com\/chat\/\d+$/.test(remote.conversation_url)||!/^\d+$/.test(remote.message_id))throw new Error('视频回执无效')
   if(page.url()!==remote.conversation_url)await page.goto(remote.conversation_url,{waitUntil:'domcontentloaded'})
   await dismissAnnouncements(page)
   const members=remote.result_messages||[{message_id:remote.message_id,count:1}],outputs=[]
   if(members.reduce((total,item)=>total+item.count,0)>16)throw new Error('官网结果数量超出单次安全采集范围')
   for(const member of members){
    if(!/^\d+$/.test(member.message_id))throw new Error('结果消息编号无效')
    const reply=page.locator(`[data-message-id="${member.message_id}"]`)
    await reply.waitFor({timeout:30000})
    if(await videoCandidates(reply)!==member.count)throw new Error('原回执视频列表已变化，重新核对原结果')
    const cards=reply.locator('[class*="block-video"]'),targets=await cards.count()?cards:reply.locator('video')
    // Nested containers are ambiguous click targets; do not click an unrelated sibling.
    const outer=targets.filter({hasNot:page.locator('[class*="block-video"]')})
    const items=await cards.count()?outer:targets
    if(await items.count()!==member.count)throw new Error('视频候选控件数量与回执不符')
    for(let index=0;index<member.count;index++){
     await guard()
     if(page.url()!==remote.conversation_url)throw new Error('已离开原视频会话')
     // A stable visible media source permits reuse; absent sources are always downloaded again.
     const source=await items.nth(index).evaluate(el=>{const video=el.matches('video')?el:el.querySelector('video');return video?.currentSrc||video?.src||video?.querySelector('source')?.src||null})
     const descriptor={message_id:member.message_id,ordinal:index,source}
     const originalPath=destination+'.'+createHash('sha256').update(JSON.stringify(descriptor)).digest('hex').slice(0,24)
     const download=async()=>{
     await items.nth(index).click()
     try{
     const target=page.locator('button.bg-dbx-fill-highlight[data-trigger-type="hover"]').filter({visible:true})
     await target.first().waitFor({timeout:15000})
     if(await target.count()!==1)throw new Error('官网原视频下载入口变化，请人工核对')
     return {...await captureOfficialDownload(page,()=>target.click(),originalPath),message_id:member.message_id,ordinal:index}}
     finally{await page.keyboard.press('Escape')}
     }
     outputs.push(source?await collection.original(descriptor,download):await download())
    }
   }
   return outputs.length===1?outputs[0]:{outputs}
  }
 }
}
