import {readSubmissionGroup,submissionEnd} from './doubao-submission.mjs'
/** Doubao image adapter: one empty conversation per business task, no private API calls. */
import { basename } from 'node:path'
import { downloadOriginal } from './doubao-images.mjs'
import { dismissAnnouncements, sessionBlocker } from './doubao-session.mjs'
import { matchingPromptIds, promptMatches } from './doubao-messages.mjs'
export { matchingPromptIds } from './doubao-messages.mjs'

// Shared matching removes known presentation markup only; callers require a unique message.

/** Read the composer text for both <textarea> and contenteditable rich-text editors.
 * Playwright's inputValue() only accepts <input>/<textarea>/<select> and throws for
 * contenteditable — which is what Doubao's image composer is, as openImageEntry already
 * assumes when it reads the [data-placeholder] child. Reading through evaluate keeps the
 * verification honest; inputValue() there would report an empty box forever. */
async function composerText(box){
 return await box.evaluate(el=>(typeof el.value==='string'?el.value:el.innerText??el.textContent??'')).catch(()=>'')
}

/** Resolve the composer across Doubao's 2026-09 redesign. The composer used to be a
 * <textarea role=textbox>; it is now a Tiptap ProseMirror contenteditable DIV whose
 * placeholder lives in a data-placeholder attribute and which exposes no textbox role,
 * so getByRole('textbox') resolves to zero elements after the redesign. The legacy
 * role lookup is kept as a fallback for gradual rollouts. */
export async function firstComposer(page){
 const editor=page.locator('.ProseMirror[contenteditable="true"]:visible').first()
 if(await editor.count())return editor
 return page.getByRole('textbox').filter({visible:true}).first()
}
/** Effective placeholder of an editor root: its own or a descendant data-placeholder. */
async function editorPlaceholder(box){
 return await box.evaluate(el=>[el.getAttribute('data-placeholder'),...Array.from(el.querySelectorAll('[data-placeholder]')).map(n=>n.getAttribute('data-placeholder'))].filter(Boolean).join('|')).catch(()=>'')
}
async function editorVisible(box){
 return await box.evaluate(el=>!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)).catch(()=>false)
}

/** Pick the active image composer among possibly several editors on the page.
 * Prefer the editor already holding our prompt, then the image-composer placeholder,
 * then any visible editor, so the prompt can never silently land in the wrong input. */
async function composerBox(page,prompt){
 const norm=s=>(s||'').normalize('NFKC').replace(/\s+/g,'').trim()
 const target=norm(prompt)
 // Redesigned composer first: role=textbox matches nothing on the new Tiptap editor.
 const editors=page.locator('.ProseMirror[contenteditable="true"]:visible')
 const n=await editors.count()
 let visible=null
 for(let i=0;i<n;i++){
  const box=editors.nth(i)
  if(!await editorVisible(box))continue
  if(!visible)visible=box
  if(target&&norm(await composerText(box)).includes(target))return box
  const placeholder=norm(await editorPlaceholder(box))
  if(placeholder.includes('描述你想要的图片')||placeholder.includes('图片'))return box
 }
 if(visible)return visible
 // Legacy pre-redesign composer (textarea role=textbox) for gradual rollouts.
 const boxes=page.getByRole('textbox').filter({visible:true})
 const count=await boxes.count()
 if(count===1)return boxes.first()
 for(const box of await boxes.all()){
  const value=norm(await composerText(box))
  if(target&&value.includes(target))return box
  const placeholder=norm(await box.getAttribute('placeholder').catch(()=>''))
  if(placeholder.includes('描述你想要的图片')||placeholder.includes('图片'))return box
 }
 return boxes.last()
}

/** Fill the image-composer prompt and verify it actually landed before returning.
 * A plain fill() after attachment upload can be silently lost or hit the wrong box;
 * retry a few times, then fail loudly instead of submitting an empty generation. */
export async function fillPrompt(page,prompt){
 const norm=s=>(s||'').normalize('NFKC').replace(/\s+/g,'').trim()
 const target=norm(prompt)
 for(let attempt=0;attempt<3;attempt++){
  const box=await composerBox(page,prompt)
  if(attempt>=1){
   // Rich-text editors (Tiptap ProseMirror since the 2026-09 redesign) keep their own
   // document state and ignore a programmatic fill(), so focus the composer, select all
   // and insert the text as real input events instead.
   await box.click().catch(()=>{})
   await page.keyboard.press('Control+A')
   await page.keyboard.insertText(prompt)
  } else await box.fill(prompt)
  await page.waitForTimeout(300)
  const value=norm(await composerText(box))
  if(value.length>0&&value===target)return
 }
 throw new Error('提示词无法填入图片编辑框，停止提交以免生成空内容')
}

/** Prepare the official image entry and attest the actual visible model. */
export async function openImageEntry(page,{navigate=true}={}) {
 if(navigate) await page.goto('https://www.doubao.com/chat/',{waitUntil:'domcontentloaded'})
 await dismissAnnouncements(page)
 if(await sessionBlocker(page)) return false
 // The model selector may load after the image composer; absence is not a different model.
 const model=page.getByText('Seedream 4.5',{exact:true}).first()
 if(await model.isVisible())return 'Seedream 4.5'
 const composer=await firstComposer(page)
 const imageEntry=page.getByText('图像生成',{exact:true}).first()
 // Only enter the mode if the composer does not already have its image-only placeholder.
 const imageComposer=async()=>await composer.evaluate(el=>[el.getAttribute('placeholder'),el.getAttribute('data-placeholder'),...Array.from(el.querySelectorAll('[data-placeholder]')).map(n=>n.getAttribute('data-placeholder'))].some(value=>value?.includes('描述你想要的图片'))).catch(()=>false)
 const placeholder=await imageComposer()
 if(!placeholder)await imageEntry.click({timeout:20000})
 // Confirm image mode via the model selector rather than a specific textbox: after entering
 // image mode the composer can re-render or change role, so a first-textbox waitFor is brittle
 // and strands preparation at "进行中". The Seedream chip is the reliable signal the entry is ready.
 try {await model.waitFor({state:'visible',timeout:30000});return 'Seedream 4.5'}catch{}
 throw new Error('图像入口或实际型号无法核实；不会猜测型号')
}


/** Remove only unsent attachment cards in the isolated worker's empty conversation.
 * Doubao persists drafts even across new-chat navigation. Retrying preparation must
 * clear them before uploading, otherwise references silently accumulate.
 */
export async function clearDraft(page) {
 if(page.url()!=='https://www.doubao.com/chat/')await page.goto('https://www.doubao.com/chat/',{waitUntil:'domcontentloaded'})
 await dismissAnnouncements(page)
 // Proactively start a fresh conversation so a restored/older session cannot break
 // the empty-session prerequisite below. Tolerant of the labels Doubao may use.
 for(const label of ['新建对话','开启新对话','新对话']){
  const button=page.getByRole('button',{name:label}).first()
  if(await button.count()&&await button.isVisible().catch(()=>false)){await button.click();await page.waitForTimeout(800);break}
 }
 // The redesigned composer exposes no textbox role; resolve it through firstComposer
 // (ProseMirror editor with legacy fallback) and wait for it below.
 await (await firstComposer(page)).waitFor({state:'visible',timeout:30000})
 if(await page.locator('[data-message-id]').count()) throw new Error('拒绝清理非空历史会话')
 const cards=page.locator('[data-kind="image"][role="button"]')
 for(let attempt=0;await cards.count();attempt++) {
  if(attempt>=20) throw new Error('草稿附件数量异常，停止准备')
  const count=await cards.count()
  const remove=cards.first().locator('svg[aria-label="delete"]')
  if(await remove.count()!==1) throw new Error('草稿附件删除入口变化，请核对网页')
  await remove.click()
  await page.waitForFunction(previous=>document.querySelectorAll('[data-kind="image"][role="button"]').length<previous,count,{timeout:5000})
 }
 // Clear any persisted draft through real keystrokes instead of a programmatic fill().
 // Doubao's composer is a React-controlled node; fill() sets the value then dispatches input
 // events that re-render and detach the node, which surfaced as "element was detached" and a
 // 30s timeout. Focus + select-all + delete clears both <textarea> and contenteditable; retry
 // and verify emptiness because the click step can also race a re-render.
 const box=await firstComposer(page)
 await box.waitFor({state:'visible',timeout:30000})
 for(let i=0;i<3;i++){
  await box.click({timeout:5000}).catch(()=>{})
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await page.waitForTimeout(250)
  const left=await box.evaluate(el=>typeof el.value==='string'?el.value:el.innerText??'').catch(()=>'')
  if(!left.trim())break
 }
}

/** Wait until every reference file shows an uploaded card with a decoded preview.
 * The 2026-09 redesign moved the real preview (img[alt=image], blob: URL) OUT of the
 * card element (which now holds only a small svg icon), so the old per-card
 * querySelector('img[alt=image]') never matched and verification timed out with the
 * prompt unfilled. Cards also no longer keep upload order. Match as a set instead:
 * every file name must own one card label, and each name must have a decoded preview
 * reachable through its nearest aria-label ancestor — this also stays compatible with
 * the pre-redesign DOM, where the preview sat inside the card itself. */
export async function waitAttachmentsUploaded(page,names,timeout=60000){
 await page.waitForFunction(names=>{
  const cards=[...document.querySelectorAll('[data-kind="image"][role="button"]')]
  const labels=cards.map(card=>card.getAttribute('aria-label'))
  if(cards.length!==names.length||!names.every(name=>labels.includes(name)))return false
  const previews=[...document.querySelectorAll('img[alt="image"]')]
  return names.every(name=>{
   const img=previews.find(node=>node.closest('[aria-label]')?.getAttribute('aria-label')===name)
   return !!img&&img.complete&&img.naturalWidth>0&&(img.currentSrc.startsWith('https://')||img.currentSrc.startsWith('blob:https://www.doubao.com/'))
  })
 },names,{timeout})
}

/** Bind submitted prompt to its own following assistant message, never a global latest image. */
export function doubaoImageAdapter(page,paths,destination,guard=async()=>{}) {
 return {
  async prepare(request) {
   await clearDraft(page)
   const actual=await openImageEntry(page,{navigate:false})
   if(actual!==request.requested_model) throw new Error('网页实际图像型号与任务不同，保留原任务，不自动切换型号')
   if(await page.locator('[data-message-id]').count()) throw new Error('当前不是空白会话，已停止以避免串用历史内容')
   if(paths.length) {
    await page.locator('input[type=file]').setInputFiles(paths)
    // The official composer keeps a loaded blob preview after upload; HTTPS-only checks never finish.
    // Require every file's card with a decoded preview; the official composer owns upload/send gating.
    await waitAttachmentsUploaded(page,paths.map(path=>basename(path)))
   }
   await fillPrompt(page, request.prompt)
  },
  async submit(request,checkpoint=async()=>{}) {
   await guard()
   await fillPrompt(page, request.prompt)
   // New tasks bind the single fresh message in an exclusive empty conversation.
   // Legacy receipts still require a unique full prompt match; presentation text is not a v2 key.
   const before=new Set(await page.locator('[data-message-id].justify-end').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-message-id'))))
   if(request.local_task_id && before.size)throw new Error('新任务必须使用独占空会话')
   const binding=request.local_task_id?{binding_version:2,local_task_id:request.local_task_id,exclusive_empty:true}:{}
   // Persist the empty-conversation send boundary before Enter; never inject IDs into artwork prompts.
   await checkpoint({...binding,conversation_url:page.url()})
   await (await composerBox(page, request.prompt)).press('Enter')
   // A visible challenge suspends the timeout, not the task. Finishing verification must not require resending.
   let deadline=Date.now()+60000, userId, url, unmatchedSince=0, group=null
   while(!page.isClosed()) {
    await guard()
    if(await sessionBlocker(page)){deadline=Date.now()+60000;unmatchedSince=0;await page.waitForTimeout(1000);continue}
    if(/^https:\/\/www\.doubao\.com\/chat\/\d+$/.test(page.url())){
     if(!url){url=page.url();await checkpoint({...binding,conversation_url:url})}
     if(page.url()!==url)throw new Error('提交后离开原会话，停止核对')
     if(binding.binding_version===2){
      group=await readSubmissionGroup(page,request)
      if(group){userId=group.user_message_id;break}
      if(Date.now()>deadline)throw new Error('提交消息组或附件尚未核实，保留原任务，不再次发送')
      await page.waitForTimeout(500);continue
     }
     const messages=await page.locator('[data-message-id].justify-end').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-message-id'),text:n.innerText||''})))
     const fresh=messages.filter(m=>!before.has(m.id))
     const matched=fresh.filter(m=>promptMatches(m.text,request.prompt))
     if(matched.length===1){userId=matched[0].id;break}
     if(matched.length>1)throw new Error('本次提示词存在多个匹配，停止以防串用结果')
     // Fresh but non-matching input (attachment-only node, manual interference) must
     // never be adopted; a short grace covers slow text rendering, then stop closed.
     if(fresh.length){if(!unmatchedSince)unmatchedSince=Date.now();else if(Date.now()-unmatchedSince>5000)throw new Error('新消息内容与提示词不一致，停止以防张冠李戴，请人工核对')}
    }
    if(Date.now()>deadline)throw new Error(unmatchedSince?'新消息内容与提示词不一致，停止以防张冠李戴，请人工核对':'未取得唯一提交回执，保留原任务，不再次发送')
    await page.waitForTimeout(1000)
   }
   if(!userId)throw new Error('原提交窗口已关闭，不能重新生成')
   const groupBinding=group?{user_message_ids:group.user_message_ids,attachment_message_ids:group.attachment_message_ids,reference_count:group.reference_count}:{}
   await checkpoint({...binding,...groupBinding,conversation_url:url,user_message_id:userId})
   // The first assistant after the complete verified submission group belongs to this send.
   await page.waitForFunction(id=>{
    const nodes=[...document.querySelectorAll('[data-message-id]')]
    const index=nodes.findIndex(n=>n.getAttribute('data-message-id')===id)
    return index>=0 && nodes[index+1] && !nodes[index+1].classList.contains('justify-end')
   },group?.user_message_ids.at(-1)||userId,{timeout:120000})
   if(page.url()!==url) throw new Error('网页跳转，必须核对原会话')
   const messageId=await page.evaluate(id=>{const ns=[...document.querySelectorAll('[data-message-id]')];return ns[ns.findIndex(n=>n.getAttribute('data-message-id')===id)+1].getAttribute('data-message-id')},group?.user_message_ids.at(-1)||userId)
   return {...binding,...groupBinding,conversation_url:url,message_id:messageId,user_message_id:userId}
  },
  async reconcile(anchor,request,checkpoint=async()=>{}) {
   if(anchor.binding_version===2 && anchor.local_task_id!==request.local_task_id)throw new Error('任务绑定编号不一致，禁止恢复其他任务')
   if(!/^https:\/\/www\.doubao\.com\/chat\/\d+$/.test(anchor.conversation_url))return null
   await page.goto(anchor.conversation_url,{waitUntil:'domcontentloaded'})
   await dismissAnnouncements(page)
   await page.locator('[data-message-id].justify-end').first().waitFor({state:'attached',timeout:30000})
   if(anchor.binding_version===2){
    if(!anchor.user_message_id){
     if(!anchor.exclusive_empty)return null
     const group=await readSubmissionGroup(page,request)
     if(!group)return null
     const {message_id,...members}=group
     const verified={...anchor,...members};await checkpoint(verified)
     return message_id?{...verified,message_id}:null
    }
    const rows=await page.locator('[data-message-id]').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-message-id'),user:n.classList.contains('justify-end')})))
    const end=submissionEnd(rows,anchor),next=rows[end+1]
    return next&&!next.user?{...anchor,message_id:next.id}:null
   }
   // id主路径：anchor.user_message_id 是数字时直接 DOM 定位，不依赖文本指纹。
   // 仅旧回执允许唯一完整提示词兜底；v2 编号缺失时保留原回执。
   if(/^\d+$/.test(anchor.user_message_id||'')){
    const node=page.locator(`[data-message-id="${anchor.user_message_id}"].justify-end`).first()
    if(await node.count()){
     const message=await page.evaluate(id=>{const nodes=[...document.querySelectorAll('[data-message-id]')];const index=nodes.findIndex(n=>n.getAttribute('data-message-id')===id);const next=nodes[index+1];return index>=0&&next&&!next.classList.contains('justify-end')?next.getAttribute('data-message-id'):null},anchor.user_message_id)
     return message?{...anchor,message_id:message}:null
    }
   }
   // 兜底路径：id 失效或缺失时用 prompt 唯一匹配。会话内 prompt 唯一 → 信任并写回 anchor
   // （ids.length===1 已保证会话内无串用；conversation_url 限定了豆包对话边界）
   const ids=await matchingPromptIds(page,request.prompt)
   if(ids.length!==1)return null
   const verified={...anchor,user_message_id:ids[0]}
   await checkpoint(verified)
   const message=await page.evaluate(id=>{const nodes=[...document.querySelectorAll('[data-message-id]')];const index=nodes.findIndex(n=>n.getAttribute('data-message-id')===id);const next=nodes[index+1];return index>=0&&next&&!next.classList.contains('justify-end')?next.getAttribute('data-message-id'):null},ids[0])
   return message?{...verified,message_id:message}:null
  },
  async collect(remote,_request,collection) {
   // Reopening uses only the stored conversation/message pair. Timeout means retry collection, not generation.
   return await downloadOriginal(page,remote,destination,guard,collection)
  }
 }
}
