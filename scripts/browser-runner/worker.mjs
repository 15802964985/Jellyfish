/** Local outbound-only worker. Runtime credentials, sessions and receipts never enter Git. */
import { chromium } from 'playwright'
import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { ReceiptStore, executeTask, fileDigest } from './receipts.mjs'
import { openAsBlob } from 'node:fs'
import { PLATFORM_ADAPTERS } from './platform-adapters.mjs'
import { recoveryPolicy, classifyHumanHandOff } from './doubao-session.mjs'
const accountId=process.argv[2]
const recoverOnly=process.argv.includes('--recover-only')
const root=resolve(import.meta.dirname,'../../local-browser')
const dir=join(root,'accounts',accountId)
/** Fail before the browser ever opens, but leave a real diagnostic and a clear reason for
 *  the desktop host so the account page never shows a misleading "window occupied" message
 *  for what is actually an unsupported-platform or local-config error. */
async function failEarly(error){
  const name=error?.name||'Error',msg=String(error?.message||error||'执行器启动失败')
  try{await writeFile(join(dir,'diagnostic.json'),JSON.stringify({stage:'launch',policy:'unsupported',error_name:name,error_message:msg.slice(0,400),at:new Date().toISOString()}))}catch{}
  try{process.send?.({state:'failed',reason:msg})}catch{}
  await new Promise(r=>setTimeout(r,120))
  process.exit(2)
}
if(!/^[a-zA-Z0-9_-]{1,64}$/.test(accountId||'')) await failEarly('请提供网页平台账号页面中的账号编号')
await mkdir(dir,{recursive:true})
/** Last-resort evidence: any failure that escapes the managed loop must still write a diagnostic
 *  and report a reason, instead of silently closing the browser and stranding the task with no
 *  trace. Without this, an escape like the earlier undeclared collectFailures left no diagnostic. */
async function recordCrash(where,error){
  const name=error?.name||'Error',msg=String(error?.message||error||'').slice(0,400)
  try{await writeFile(join(dir,'diagnostic.json'),JSON.stringify({stage:'crash',where,error_name:name,error_message:msg,at:new Date().toISOString()}))}catch{}
  try{process.send?.({state:'failed',reason:`执行器异常(${where})：${msg}`})}catch{}
  await new Promise(r=>setTimeout(r,120))
  process.exit(3)
}
process.on('uncaughtException',error=>{void recordCrash('uncaughtException',error)})
process.on('unhandledRejection',error=>{void recordCrash('unhandledRejection',error)})
const config=JSON.parse(await readFile(join(root,'runner-config.json'),'utf8'))
const base=new URL(config.backend_url)
if(!['127.0.0.1','localhost'].includes(base.hostname) || !['http:','https:'].includes(base.protocol)) await failEarly('执行器只能连接本机 Jellyfish')
const accountsResponse=await fetch(new URL('/api/v1/studio/web-generation/accounts',base),{redirect:'error',signal:AbortSignal.timeout(15000)})
if(!accountsResponse.ok) await failEarly('无法核对网页账号平台')
const configuredAccount=(await accountsResponse.json()).find(row=>row.id===accountId)
const platform=PLATFORM_ADAPTERS[configuredAccount?.platform]
if(!platform) await failEarly('当前账号的平台尚未适配自动执行')
const dismissAnnouncements=platform.dismiss,sessionBlocker=platform.blocker
let identity
try {identity=JSON.parse(await readFile(join(dir,'identity.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;identity={profile_key:randomUUID()};await writeFile(join(dir,'identity.json'),JSON.stringify(identity))}
const profile=resolve(root,config.profiles?.[accountId]||`accounts/${accountId}/edge`)
if(!profile.startsWith(root+ '\\') && !profile.startsWith(root+'/')) throw new Error('资料目录必须位于 local-browser 内')
// Resume work by task receipt, not Edge tab restoration; retain sandbox and suppress stale restore UI.
const context=await chromium.launchPersistentContext(profile,{channel:'msedge',chromiumSandbox:true,args:['--hide-crash-restore-bubble'],headless:false,viewport:{width:1400,height:950},acceptDownloads:true})
const page=context.pages()[0]||await context.newPage()
process.on('message',m=>{if(m==='close')void context.close()})
process.on('SIGINT',()=>void context.close())
const store=new ReceiptStore(join(dir,'receipts'))
const currentPath=join(dir,'current.json')
let current=null,state='needs_login',models=[...(configuredAccount?.supported_models||[]),...(configuredAccount?.supported_video_models||[])]
let held=false,prepareFailures=0,collectFailures=0
const pause=ms=>new Promise(r=>setTimeout(r,ms))
try{current=JSON.parse(await readFile(currentPath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
held=Boolean(current?.recovery?.held)
prepareFailures=current?.recovery?.prepareFailures||0
collectFailures=current?.recovery?.collectFailures||0
/** Protected requests use finite timeouts and never follow redirects with credentials. */
async function api(path,method='GET',body=null,token=null,binary=false) {
 const headers={'x-web-modality':'any',authorization:`Bearer ${config.token}`,'x-web-account':accountId}
 if(token) headers['x-task-token']=token
 if(current?.claim_token) headers['x-claim-token']=current.claim_token
 if(body && !(body instanceof FormData)) headers['content-type']='application/json'
 const response=await fetch(new URL(`/api/v1/studio/web-generation${path}`,base),{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(60000)})
 if(!response.ok) {const error=new Error(`Jellyfish 请求失败 ${response.status}`);error.status=response.status;throw error}
 return binary?response:await response.json()
}
/** Keep online status separate from login readiness; busy tasks remain bound to the same profile. */
let lastHeartbeat=0,lastHeartbeatState=''
async function heartbeat(){
 if(!held&&current?.task&&!page.isClosed()){const blocker=await sessionBlocker(page).catch(()=>null);if(blocker)state=blocker;else if(['needs_login','needs_verification'].includes(state))state='ready'}
 const signature=JSON.stringify([state,models]);if(signature===lastHeartbeatState&&Date.now()-lastHeartbeat<10000)return
 await api(`/accounts/${accountId}/heartbeat`,'POST',{...identity,session_state:state,supported_models:models});lastHeartbeat=Date.now();lastHeartbeatState=signature}
/** Write claim capability before requesting assignment, recovering even a lost claim response. */
async function persist(){const temp=currentPath+'.tmp';await writeFile(temp,JSON.stringify(current,null,2),{mode:0o600});await rename(temp,currentPath)}
/** Reconcile local ownership even while held; cancellation must not permanently strand an account. */
async function releaseTerminal(){
 if(!current?.task)return false
 const status=await api(`/tasks/${current.task.task_id}/resume`,'POST',null,current.task.token)
 if(status.status==='running'){
  if((status.recovery_epoch||0)>(current.recovery?.epoch||0)){
   held=false;prepareFailures=0;collectFailures=0
   current.recovery={epoch:status.recovery_epoch,held:false,prepareFailures:0,collectFailures:0};await persist()
  }else if(status.paused){held=true}
 }
 if(!['cancelled','succeeded','failed'].includes(status.status))return false
 // Receipt and downloaded original stay on disk; only the active pointer is cleared.
 current=null;held=false;prepareFailures=0;collectFailures=0;await persist();state='ready';return true
}
/** Hash the runner code on disk (probes and tests excluded) so a stale worker can retire
 *  itself at a task boundary instead of serving tasks with outdated logic. Any read failure
 *  yields null on both sides, which disables the comparison rather than blocking the worker. */
async function codeFingerprint(){
 try{
  const files=(await readdir(import.meta.dirname)).filter(name=>name.endsWith('.mjs')&&!/(^prepare-|^verify-|probe|\.test\.)/.test(name)).sort()
  const hash=createHash('sha256')
  for(const name of files)hash.update(name).update(await readFile(join(import.meta.dirname,name)))
  return hash.digest('hex')
 }catch{return null}
}
const startFingerprint=await codeFingerprint()
const IDLE_EXIT_MS=10*60*1000
let lastActive=Date.now()
const timer=setInterval(()=>void heartbeat().catch(()=>{}),20000)
try {
 if(!current?.task) {
  try {await page.goto(platform.home,{waitUntil:'domcontentloaded'});state=await sessionBlocker(page)||'ready'}catch(error){console.log('入口检查：'+error.message);await page.screenshot({path:join(dir,'entry.png')}).catch(()=>{})}
 } else {state='ready';models=[current.task.request.requested_model];const receipt=await store.read(current.task.task_id);const url=receipt?.remote?.conversation_url||receipt?.anchor?.conversation_url;await page.goto(platform.conversation.test(url||'')?url:platform.home,{waitUntil:'domcontentloaded'})}
 process.send?.({state:'opened'})
 console.log('独立 Edge 已打开。登录或验证需要在此窗口完成；任务不会因页面关闭而重新生成。')
 while(!page.isClosed()) {
  if(current?.task)lastActive=Date.now()
  else if(state==='ready'&&Date.now()-lastActive>IDLE_EXIT_MS){console.log('执行器空闲超过10分钟，自动收尾释放窗口；登录态保留，下次任务自动重新拉起');break}
  try {await heartbeat()} catch {await pause(5000);continue}
  try{if(await releaseTerminal())continue}catch{await pause(5000);continue}
  if(held){
   const receipt=await store.read(current.task.task_id)
   await api(`/tasks/${current.task.task_id}/stage`,'POST',{stage:'needs_user',paused:true,recovery_epoch:current.recovery?.epoch||0,reason:'执行已暂停，原账号保留；请从原业务任务恢复或取消释放',...(receipt?.remote?{conversation_url:receipt.remote.conversation_url,message_id:receipt.remote.message_id}:{})},current.task.token).catch(()=>{})
   await pause(5000);continue
  }
  // Claim before human cooperation: keep the same task while login or captcha is pending.
  if(recoverOnly&&!current?.task){await pause(3000);continue}
  if(!current) {current={claim_token:randomBytes(32).toString('hex')};await persist()}
  if(!current.task) {
   const diskFingerprint=await codeFingerprint()
   if(startFingerprint&&diskFingerprint&&diskFingerprint!==startFingerprint){console.log('执行器代码已更新，空闲退出以加载新版本；有任务时将自动重新拉起');break}
   let task
   try {task=await api('/runner/claim','POST',null)}catch{await pause(5000);continue}
   if(!task){await pause(750);continue}
   current.task=task;lastActive=Date.now();await persist()
  }
  const owned=current.task
  try {
   await dismissAnnouncements(page)
   const blocker=await sessionBlocker(page)
   if(blocker){state=blocker;await api(`/tasks/${owned.task_id}/stage`,'POST',{stage:'awaiting_user',paused:false,recovery_epoch:current.recovery?.epoch||0,reason:'请完成原窗口登录或验证，完成后自动继续'},owned.token).catch(()=>{});await pause(2000);continue}
   const resumed=await api(`/tasks/${owned.task_id}/resume`,'POST',null,owned.token)
   if(resumed.status==='succeeded') {current=null;await persist();state='ready';continue}
   const video='duration_seconds' in owned.request
   const paths=[]
   const localReceipt=await store.read(owned.task_id)
   // Once submitted, collection must not depend on downloading old references again.
   const referenceCount=(!localReceipt||localReceipt.stage==='prepared')?owned.request.reference_file_ids.length:0
   // Three bounded transfers retain reference ordering; join failures before retrying preparation.
   for(let start=0;start<referenceCount;start+=3){
    const batch=await Promise.allSettled(Array.from({length:Math.min(3,referenceCount-start)},async(_,offset)=>{
     const i=start+offset,response=await api(`/tasks/${owned.task_id}/references/${i}`,'GET',null,owned.token,true)
     const bytes=Buffer.from(await response.arrayBuffer())
     if(createHash('sha256').update(bytes).digest('hex')!==response.headers.get('x-content-sha256'))throw new Error('参考图传输校验失败')
     const mime=response.headers.get('content-type')||'',ext=mime.includes('jpeg')?'jpg':mime.includes('webp')?'webp':'png'
     const path=join(dir,`${owned.task_id}-ref-${i}.${ext}`);await writeFile(path,bytes);return path
    }))
    const failure=batch.find(result=>result.status==='rejected');if(failure)throw failure.reason
    paths.push(...batch.map(result=>result.value))
   }
   let lastGuard=0
   /** Check cancellation/pause while a long website generation is still running. */
   const guard=async()=>{
    if(Date.now()-lastGuard<3000)return
    lastGuard=Date.now()
    const state=await api(`/tasks/${owned.task_id}/resume`,'POST',null,owned.token)
    if(state.status!=='running'||state.paused){const error=new Error('原任务已取消、结束或暂停');error.status=409;throw error}
   }
   await executeTask({task:{id:owned.task_id,request:owned.request},store,adapter:video?platform.video(page,paths,join(dir,`${owned.task_id}-original.mp4`),guard):platform.image(page,paths,join(dir,`${owned.task_id}-original.png`),guard),
    onStage:async stage=>{
     // Preparation has verified the actual selected model; cache this evidence only now.
     if(stage==='submitting'&&!models.includes(owned.request.requested_model))models.push(owned.request.requested_model)
     const receipt=await store.read(owned.task_id)
     if(['prepared','completed'].includes(stage))return
     await api(`/tasks/${owned.task_id}/stage`,'POST',{stage:stage==='downloaded'?'downloading':stage,recovery_epoch:current.recovery?.epoch||0,...((receipt.remote||receipt.anchor)&&platform.conversation.test((receipt.remote||receipt.anchor).conversation_url||'')?{conversation_url:(receipt.remote||receipt.anchor).conversation_url,message_id:receipt.remote?.message_id,binding_version:(receipt.remote||receipt.anchor).binding_version||1,user_message_id:(receipt.remote||receipt.anchor).user_message_id}:{})},owned.token)
    },
    finalize:async({output})=>{
     const outputs=output.outputs||[output],form=new FormData()
     for(const item of outputs){
      if((await fileDigest(item.path)).sha256!==item.sha256)throw new Error('下载文件已变化，不允许回填')
      // File-backed Blob streams multipart bytes; Node rejects mutations while reading.
      form.append(outputs.length===1?'file':'files',await openAsBlob(item.path,{type:video?'video/mp4':'image/png'}),video?'result.mp4':'result.png')
     }
     return await api(`/tasks/${owned.task_id}/${outputs.length===1?'result':'results'}`,'POST',form,owned.token)
    }})
   current=null;prepareFailures=0;collectFailures=0;state='ready';await persist();console.log('原文件已归档，已按原任务校验业务回填。')
  } catch(error) {
   try{if(await releaseTerminal())continue}catch{}
   const receipt=await store.read(owned.task_id)
   await page.screenshot({path:join(dir,'task-error.png')}).catch(()=>{})
const blocker=await sessionBlocker(page).catch(()=>null)
 const policy=recoveryPolicy(receipt?.stage,error.status,blocker)
 // Snapshot the live Doubao session before the diagnostic write so future UI drift
 // can be diagnosed from real DOM evidence (id + text of user messages) instead of
 // guesses. Best-effort: never block the catch on a failed probe.
 let session_snapshot=null
 try{
  const match=/^https:\/\/www\.doubao\.com\/chat\/(\d+)$/.exec(page.url()||'')
  if(match){
   const userNodes=await page.locator('[data-message-id].justify-end').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-message-id'),text:(n.innerText||'').slice(0,50)})),{timeout:3000}).catch(()=>[])
   const assistantNodes=await page.locator('[data-message-id]:not(.justify-end)').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-message-id'),text:(n.innerText||'').slice(0,50)})),{timeout:3000}).catch(()=>[])
   session_snapshot={conversation_id:match[1],url:page.url(),user_nodes:userNodes.slice(0,10),assistant_nodes:assistantNodes.slice(0,10)}
  }
 }catch{}
 // Diagnostics FIRST: always capture the real fault before any bookkeeping, so a
 // regression like the undeclared collectFailures ReferenceError can never hide
 // itself again by escaping the catch and skipping the diagnostic write.
 await writeFile(join(dir,'diagnostic.json'),JSON.stringify({task_id:owned.task_id,stage:receipt?.stage,policy,collectFailures,prepareFailures,blocker,status:error.status||null,error_name:error.name,error_message:String(error.message||'').slice(0,400),session_snapshot,at:new Date().toISOString()}))
   // Bound runaway collection retries. A collection failure is normally a permanent
   // selector/DOM drift, not a transient hiccup; after enough attempts stop auto work
   // and surface needs_user. The original account stays leased until explicit cancellation.
   if(blocker && ![401,403,409].includes(error.status)){
    state=blocker;held=false;await persist()
    await api(`/tasks/${owned.task_id}/stage`,'POST',{stage:'awaiting_user',paused:false,recovery_epoch:current.recovery?.epoch||0,reason:'请在原账号窗口完成登录或人机验证，完成后自动继续原任务'},owned.token).catch(()=>{})
    await pause(2000);continue
   }
   const collectionPolicy=['retry_original','reconcile_only'].includes(policy)
   const collectExhausted=collectionPolicy&&error.code!=='WAITING_RESULT'&&++collectFailures>=10
   if(!collectionPolicy)collectFailures=0
   // Keep the receipt and lease while a human completes an official challenge.
   // Check again automatically; only explicit pause or unsafe ownership changes require recovery.
   const handOff=classifyHumanHandOff(error?.message)
   if(handOff.handoff && ![401,403,409].includes(error.status)){
    held=false
    current.recovery={epoch:current.recovery?.epoch||0,held,prepareFailures,collectFailures};await persist()
    state='ready'
    await api(`/tasks/${owned.task_id}/stage`,'POST',{stage:'awaiting_user',paused:false,recovery_epoch:current.recovery?.epoch||0,reason:handOff.hint,...(receipt?.remote?{conversation_url:receipt.remote.conversation_url,message_id:receipt.remote.message_id}:{})},owned.token).catch(()=>{})
    await pause(8000);continue
   }
   if(policy==='hold'||error.code==='NEEDS_USER'||collectExhausted||(policy==='reconcile_only'&&!receipt?.anchor))held=true
   if(policy==='retry_prepare'&&++prepareFailures>=3)held=true
   current.recovery={epoch:current.recovery?.epoch||0,held,prepareFailures,collectFailures};await persist()
   // A live, still-logged-in window must not be pinned to offline by a recoverable fault;
   // only a real blocker (login/verification) or a held retry exhaustion justifies offline.
   state=blocker||(held?'offline':'ready')
   const reason=blocker==='needs_verification'?'请在本账号窗口完成验证，完成后自动继续原任务':blocker==='needs_login'?'请登录本账号，登录后自动继续原任务':collectExhausted?'采集持续失败（可能官网改版），已停止自动操作，请人工核对原窗口':policy==='retry_original'?'正在恢复原结果采集或回填，不会重新生成':policy==='hold'?'任务权限或状态变化，原回执保留，停止自动操作':policy==='reconcile_only'?'尚未取得官网正式受理回执；保留原窗口核对，不会自动重发或换号':'网页入口待恢复，保留原账号和任务'
   await api(`/tasks/${owned.task_id}/stage`,'POST',{stage:held?'needs_user':['submitting','submission_unknown'].includes(receipt?.stage)?'submission_unknown':policy==='retry_original'?'submitted':'needs_user',paused:held,recovery_epoch:current.recovery?.epoch||0,reason:held?`已暂停，原账号仍保留；可恢复原任务或取消释放。${String(error.message||reason).slice(0,300)}`:reason,...(receipt?.remote?{conversation_url:receipt.remote.conversation_url,message_id:receipt.remote.message_id}:{})},owned.token).catch(()=>{})
   await pause(policy==='wait_user'?3000:error.code==='WAITING_RESULT'?1000:Math.min(30000,2000*2**Math.min(4,Math.max(0,collectFailures-1))))

  }
 }
}finally{clearInterval(timer);state='offline';await heartbeat().catch(()=>{});await context.close();if(process.connected)process.disconnect()}
