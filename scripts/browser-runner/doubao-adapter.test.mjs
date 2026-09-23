/** Offline DOM regression: no website request, account, or model generation. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearDraft, doubaoImageAdapter, fillPrompt } from './doubao-adapter.mjs'

/** Fulfil every browser request locally; use a temporary, unpaired browser context. */
async function fixture(html,run){
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const context=await browser.newContext({serviceWorkers:'block'})
  await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}))
  await run(await context.newPage())
 }finally{await browser.close()}
}
const card='<div data-kind="image" role="button"><svg aria-label="delete" width="24" height="24" onclick="this.parentElement.remove()"><rect width="24" height="24"/></svg></div>'
test('retry preparation removes all unsent images and clears prompt',()=>fixture(`<textarea>old draft</textarea>${card.repeat(6)}`,async page=>{
 await clearDraft(page)
 assert.equal(await page.locator('[data-kind="image"]').count(),0)
 assert.equal(await page.getByRole('textbox').inputValue(),'')
}))
test('existing conversation is never cleared',()=>fixture(`<textarea>keep</textarea><div data-message-id="123">history</div>${card}`,async page=>{
 await assert.rejects(clearDraft(page),/非空历史/)
 assert.equal(await page.locator('[data-kind="image"]').count(),1)
 assert.equal(await page.getByRole('textbox').inputValue(),'keep')
}))
test('changed delete control stops preparation before submitting',()=>fixture('<textarea>keep</textarea><div data-kind="image" role="button">unknown</div>',async page=>{
 await assert.rejects(clearDraft(page),/删除入口变化/)
 assert.equal(await page.getByRole('textbox').inputValue(),'keep')
}))

/** A decoded local blob remains the official composer's preview after upload. */
test('prepared reference accepts the official blob preview and keeps exact prompt', async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jellyfish-reference-'))
 const path=join(directory,'reference.png')
 await writeFile(path,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNkYPjPwMDAxAAGAAsfAQMU4wsAAAAAAElFTkSuQmCC','base64'))
 try {await fixture(`<span>Seedream 4.5</span><textarea></textarea><input type="file" onchange="const card=document.createElement('div');card.dataset.kind='image';card.setAttribute('role','button');card.setAttribute('aria-label',this.files[0].name);const img=document.createElement('img');img.alt='image';img.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNkYPjPwMDAxAAGAAsfAQMU4wsAAAAAAElFTkSuQmCC';Object.defineProperty(img,'currentSrc',{get:()=> 'blob:https://www.doubao.com/offline-preview'});card.append(img);document.body.append(card)">`,async page=>{
  await doubaoImageAdapter(page,[path],join(directory,'unused.png')).prepare({requested_model:'Seedream 4.5',prompt:'one building'})
  assert.equal(await page.getByRole('textbox').inputValue(),'one building')
  assert.equal(await page.locator('[data-kind="image"]').count(),1)
  assert.equal(await page.locator('[data-message-id]').count(),0)
 })} finally {await unlink(path); await rmdir(directory)}
})

/** Completing login should discover image mode, without sending a prompt or clearing a draft. */
test('login recovery opens image entry and dismisses only the known informational tour',()=>fixture(`<textarea>keep draft</textarea><button onclick="this.textContent='Seedream 4.5'">图像生成</button><div id="tour"><span>多条消息支持列队发送</span><button onclick="document.getElementById('tour').remove()">开启体验</button></div>`,async page=>{
 const {openImageEntry}=await import('./doubao-adapter.mjs')
 assert.equal(await openImageEntry(page),'Seedream 4.5')
 assert.equal(await page.getByRole('textbox').inputValue(),'keep draft')
 assert.equal(await page.locator('#tour').count(),0)
}))
/** A true visible challenge must remain for the user; hidden widgets do not block a ready page. */
test('captcha is not confused with download errors or announcements',()=>fixture('<textarea></textarea><div id="captcha">verification</div>',async page=>{
 const {sessionBlocker,recoveryPolicy}=await import('./doubao-session.mjs')
 await page.goto('https://www.doubao.com/chat/')
 assert.equal(await sessionBlocker(page),'needs_verification')
 await page.locator('#captcha').evaluate(n=>n.style.display='none')
 assert.equal(await sessionBlocker(page),null)
 assert.equal(recoveryPolicy('submitted',undefined,null),'retry_original')
 assert.equal(recoveryPolicy('downloaded',503,null),'retry_original')
 assert.equal(recoveryPolicy('submission_unknown',undefined,null),'reconcile_only')
 assert.equal(recoveryPolicy('submitted',409,null),'hold')
 assert.equal(recoveryPolicy('submitted',undefined,'needs_login'),'wait_user')
}))

/** Informational up-sell / risk cards without a real modal must not be classified as
 * a captcha — they are affordance copy and dismissAffordance closes them in place. */
test('inline 安全确认 is not a captcha and affordance cards are dismissed',()=>fixture(`<textarea></textarea><span id="risk">生成内容存在风险，请确认</span><button id="know">我已知晓</button><script>document.getElementById('know').addEventListener('click',()=>document.getElementById('risk').remove())</script>`,async page=>{
 const {sessionBlocker,dismissAffordance,affordanceUI,classifyHumanHandOff}=await import('./doubao-session.mjs')
 await page.goto('https://www.doubao.com/chat/')
 // Inline copy is not a verification request — without a backdrop the worker must
 // keep the account ready and surface the affordance to the user instead of pinning offline.
 assert.equal(await sessionBlocker(page),null)
 assert.equal(await affordanceUI(page),'affordance')
 assert.equal(await dismissAffordance(page),1)
 assert.equal(await page.locator('#risk').count(),0)
 assert.equal(await affordanceUI(page),null)
 assert.equal(classifyHumanHandOff('官网需要单独授权或权益确认，请核对原窗口').handoff,true)
 assert.equal(classifyHumanHandOff('请完成安全验证').handoff,true)
 assert.equal(classifyHumanHandOff('无关错误').handoff,false)
}))

/** A real modal-styled "安全确认" still classifies as needs_verification so a true
 * captcha is never silently dismissed. */
test('modal-styled 安全确认 is still detected as verification',()=>fixture(`<div role="dialog" style="position:fixed;z-index:1000"><span>安全确认</span></div>`,async page=>{
 const {sessionBlocker}=await import('./doubao-session.mjs')
 await page.goto('https://www.doubao.com/chat/')
 assert.equal(await sessionBlocker(page),'needs_verification')
}))


/** A challenge is user-completed; the adapter waits in place and sends exactly once. */
test('submission resumes automatically when a real challenge disappears',()=>fixture(`<span>Seedream 4.5</span><textarea></textarea><script>window.sends=0;document.querySelector('textarea').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();window.sends++;const box=document.createElement('div');box.id='captcha';box.textContent='verification';document.body.append(box);setTimeout(()=>{box.remove();history.pushState({},'', '/chat/12345');document.body.insertAdjacentHTML('beforeend','<div class="justify-end" data-message-id="111">test prompt</div><div data-message-id="222">result pending</div>')},1800)}};</script>`,async page=>{
 await page.goto('https://www.doubao.com/chat/')
 await page.getByRole('textbox').fill('test prompt')
 let anchor
 const remote=await doubaoImageAdapter(page,[],'unused.png').submit({prompt:'test prompt'},async value=>anchor=value)
 assert.equal(await page.evaluate(()=>window.sends),1)
 assert.equal(anchor.user_message_id,'111');assert.equal(remote.message_id,'222')
}))

/** Real-world rendering: Doubao strips markdown syntax from user bubbles, prefixes
 *  「生成图片：」, and may emit an attachment-only empty user message. Binding must key
 *  on a unique content fingerprint and never on arrival order, so fast or slow
 *  neighbours cannot hijack the correspondence. */
test('submission binds by content fingerprint across markdown rendering and labels',()=>fixture(`<span>Seedream 4.5</span><textarea></textarea><script>window.sends=0;document.querySelector('textarea').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();window.sends++;history.pushState({},'','/chat/777');document.body.insertAdjacentHTML('beforeend','<div class="justify-end" data-message-id="501"></div><div class="justify-end" data-message-id="502">生成图片：## 图片内容说明\\n图1: 妈妈\\n生成内容\\n高优先级指令</div><div data-message-id="503">generated</div>')}};</script>`,async page=>{
 await page.goto('https://www.doubao.com/chat/')
 await page.getByRole('textbox').fill('## 图片内容说明\n图1: 妈妈\n\n## 生成内容\n高优先级指令')
 let anchor
 const remote=await doubaoImageAdapter(page,[],'unused.png').submit({prompt:'## 图片内容说明\n图1: 妈妈\n\n## 生成内容\n高优先级指令'},async value=>anchor=value)
 assert.equal(await page.evaluate(()=>window.sends),1)
 assert.equal(anchor.user_message_id,'502');assert.equal(remote.message_id,'503')
}))

/** Two identical fresh submissions are ambiguous by definition: stop, never guess. */
test('submission refuses duplicate identical submissions instead of guessing',()=>fixture(`<span>Seedream 4.5</span><textarea></textarea><script>document.querySelector('textarea').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();history.pushState({},'','/chat/888');document.body.insertAdjacentHTML('beforeend','<div class="justify-end" data-message-id="601">重复的提示词内容</div><div class="justify-end" data-message-id="602">重复的提示词内容</div>')}};</script>`,async page=>{
 await page.goto('https://www.doubao.com/chat/')
 await page.getByRole('textbox').fill('重复的提示词内容')
 await assert.rejects(doubaoImageAdapter(page,[],'unused.png').submit({prompt:'重复的提示词内容'},async()=>{}),/串用/)
}))

/** Unrelated fresh input (manual interference) must never be adopted as ours. */
test('submission refuses unrelated new messages instead of binding by order',()=>fixture(`<span>Seedream 4.5</span><textarea></textarea><script>document.querySelector('textarea').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();history.pushState({},'','/chat/999');document.body.insertAdjacentHTML('beforeend','<div class="justify-end" data-message-id="701">人工输入的其他内容</div><div data-message-id="702">reply</div>')}};</script>`,async page=>{
 await page.goto('https://www.doubao.com/chat/')
 await page.getByRole('textbox').fill('业务提示词内容')
 await assert.rejects(doubaoImageAdapter(page,[],'unused.png').submit({prompt:'业务提示词内容'},async()=>{}),/张冠李戴/)
}))

/** Recovery matches a markdown-rendered bubble (## stripped by the site) uniquely. */
test('recovery matches markdown-rendered prompts and stays unique',()=>fixture('<div class="justify-end" data-message-id="801">生成内容</div><div data-message-id="802">result</div>',async page=>{
 const adapter=doubaoImageAdapter(page,[],'unused.png');let saved
 const remote=await adapter.reconcile({conversation_url:'https://www.doubao.com/chat/12345'},{prompt:'## 生成内容'},async value=>saved=value)
 assert.equal(remote.message_id,'802');assert.equal(saved.user_message_id,'801')
 assert.equal(await adapter.reconcile({conversation_url:'https://www.doubao.com/chat/12345'},{prompt:'## 别的内容'}),null)
}))

/** Asset prompts survive official punctuation normalization and URL-only receipt recovery, without sending. */
test('asset URL-only recovery matches display punctuation and refuses another input',()=>fixture('<div class="justify-end" data-message-id="111">生成图片：服装・蓝色：正面</div><div data-message-id="222">done</div>',async page=>{
 const adapter=doubaoImageAdapter(page,[],'unused.png');let saved
 const remote=await adapter.reconcile({conversation_url:'https://www.doubao.com/chat/12345'},{prompt:'服装·蓝色:正面'},async value=>saved=value)
 assert.equal(remote.message_id,'222');assert.equal(saved.user_message_id,'111')
 assert.equal(await adapter.reconcile({conversation_url:'https://www.doubao.com/chat/12345'},{prompt:'服装·红色:正面'}),null)
}))

/** Regression: Doubao's image composer is a contenteditable rich-text editor, not a
 * <textarea>. Playwright's inputValue() throws on contenteditable, which previously
 * made the prompt read back empty and forced a false prepare failure that was then
 * masked by the collectFailures ReferenceError. fillPrompt must fill and verify through
 * evaluate (composerText), never inputValue. */
test('contenteditable composer is filled and verified without inputValue', async()=>{
 await fixture(`<div contenteditable="true" role="textbox" data-placeholder="描述你想要的图片">旧草稿</div>`, async page=>{
  // The fixture only loads once the page navigates; the route fulfills every request
  // with the composer markup. Without this the page stays at about:blank and the
  // composer is never present — which is exactly the empty-box trap the fix avoids.
  await page.goto('https://www.doubao.com/chat/')
  const box=page.getByRole('textbox')
  await fillPrompt(page,'contenteditable 提示词验证')
  // After fill the prompt must actually be present in the composer, proving the
  // verification path no longer reports an empty box on a rich-text editor.
  const value=(await box.innerText()).replace(/\s+/g,'').trim()
  assert.equal(value,'contenteditable提示词验证')
 })
})

/** anchor.user_message_id 有效且节点存在时，reconcile 直接 DOM 定位，不依赖 prompt 匹配。
 *  既不调 matchingPromptIds，也不要求页面包含与 prompt 完全相符的用户消息。 */
test('reconcile uses user_message_id anchor directly when DOM hit succeeds',()=>fixture('<div class="justify-end" data-message-id="901">完全不相关的历史内容</div><div data-message-id="902">result</div>',async page=>{
 const adapter=doubaoImageAdapter(page,[],'unused.png')
 const remote=await adapter.reconcile({conversation_url:'https://www.doubao.com/chat/12345',user_message_id:'901'},{prompt:'绝不匹配的业务prompt'})
 assert.equal(remote.message_id,'902')
 assert.equal(remote.user_message_id,'901')
}))

/** anchor.user_message_id 是数字但 DOM 已无该节点（豆包 UI 改版导致 id 重生）：
 *  fall through 到原 prompt 兜底路径，与 id 缺失走同一条路径。 */
test('reconcile falls through to prompt matching when user_message_id is no longer in DOM',()=>fixture('<div class="justify-end" data-message-id="911">原提示词内容</div><div data-message-id="912">result</div>',async page=>{
 const adapter=doubaoImageAdapter(page,[],'unused.png')
 const remote=await adapter.reconcile({conversation_url:'https://www.doubao.com/chat/12345',user_message_id:'99999999'},{prompt:'原提示词内容'})
 assert.equal(remote.message_id,'912')
 assert.equal(remote.user_message_id,'911')
}))

/** anchor.user_message_id 不是数字字符串时仍走原 prompt 兜底路径——零回归。 */
test('reconcile uses prompt matching when user_message_id is missing',()=>fixture('<div class="justify-end" data-message-id="921">业务提示词内容</div><div data-message-id="922">result</div>',async page=>{
 const adapter=doubaoImageAdapter(page,[],'unused.png')
 const remote=await adapter.reconcile({conversation_url:'https://www.doubao.com/chat/12345'},{prompt:'业务提示词内容'})
 assert.equal(remote.message_id,'922')
 assert.equal(remote.user_message_id,'921')
}))

/** V2 identity is independent of presentation text and refuses a foreign task receipt. */
test('v2 restores by exact task and user IDs despite rewritten prompt',()=>fixture('<div data-message-id="201" class="justify-end">rendered attachment label</div><div data-message-id="202">result</div>',async page=>{
 const adapter=doubaoImageAdapter(page,[],null)
 const anchor={binding_version:2,local_task_id:'task-a',exclusive_empty:true,conversation_url:'https://www.doubao.com/chat/101',user_message_id:'201'}
 const result=await adapter.reconcile(anchor,{local_task_id:'task-a',prompt:'unrelated display text'})
 assert.equal(result.message_id,'202')
 await assert.rejects(adapter.reconcile(anchor,{local_task_id:'task-b',prompt:'unrelated display text'}),/编号不一致/)
 await assert.rejects(adapter.reconcile({...anchor,user_message_id:'999'},{local_task_id:'task-a',prompt:'rendered attachment label'}),/消息编号缺失/)
}))
/** All locally fulfilled media belong to the exact original user thread, including a later reply. */
test('image waits past acknowledgement and collects a stable multi-reply set',()=>fixture('<div data-message-id="201" class="justify-end">prompt</div><div data-message-id="202">accepted</div><div data-message-id="203"><img alt="image"></div><div data-message-id="204"><img alt="image"></div>',async page=>{
 const {waitImageResults}=await import('./doubao-images.mjs')
 await page.goto('https://www.doubao.com/chat/101')
 await page.locator('img').evaluateAll(nodes=>nodes.forEach((img,i)=>{Object.defineProperty(img,'complete',{value:true});Object.defineProperty(img,'naturalWidth',{value:32});Object.defineProperty(img,'currentSrc',{value:'https://fixture.invalid/'+i})}))
 const remote={binding_version:2,conversation_url:page.url(),user_message_id:'201',message_id:'202'}
 assert.deepEqual((await waitImageResults(page,remote)).map(n=>n.id),['203','204'])
 await page.evaluate(()=>{const n=document.createElement('div');n.dataset.messageId='205';n.className='justify-end';n.textContent='another input';document.body.append(n)})
 await assert.rejects(waitImageResults(page,remote),/其他输入/)
 await assert.rejects(waitImageResults(page,remote,async()=>{throw Error('cancelled')}),/cancelled/)
}))
