/** Recognize only visible official UI; never infer login from cookies or solve challenges. */
export async function dismissAnnouncements(page) {
 // This exact informational release tour has no authorization, payment or verification semantics.
 const heading=page.getByText('多条消息支持列队发送',{exact:true})
 if(await heading.isVisible().catch(()=>false)) {
  const start=page.getByText('开启体验',{exact:true})
  if(await start.count()===1 && await start.isVisible()) await start.click({timeout:3000})
 }
 // Up-sell / membership / risk banners are informational and must not block generation.
 // They render as non-modal cards without a backdrop; closing them reduces false
 // 'needs_verification' / '请核对原窗口' trips caused by inline text matching.
 await dismissAffordance(page).catch(()=>{})
}

/**
 * Dismiss purely informational up-sell / risk banners that Doubao overlays on the
 * conversation but that do not require a real human action (no captcha, no payment
 * confirmation modal). Each candidate targets a non-modal card: a visible close
 * button (× / 知道了 / 我已知晓) without a modal backdrop. If no such affordance
 * is present, the page is left untouched — never click a confirm/upgrade/pay button.
 *
 * Returns the number of cards dismissed so callers can decide whether to fall back
 * to wait_for_user; zero is a normal "nothing to dismiss" result.
 */
export async function dismissAffordance(page){
 const seen=new Set()
 let dismissed=0
 // Each entry pairs a known informational label with a button that legitimately
 // closes it. All labels are exact-text and benign — never an instant pay / upgrade action.
 const candidates=[
  {label:'升级 Pro 后享受更多生成次数',close:['稍后再说','知道了','我已知晓']},
  {label:'解锁更高画质或更长时长',close:['稍后再说','知道了','我已知晓']},
  {label:'今日免费次数已用完',close:['稍后再说','知道了','我已知晓']},
  {label:'生成内容存在风险，请确认',close:['我已知晓','知道了']},
  {label:'生成内容真实性自负责任',close:['我已知晓','知道了']}
 ]
 for(const candidate of candidates){
  const heading=page.getByText(candidate.label,{exact:true}).first()
  if(!await heading.isVisible().catch(()=>false)) continue
  // Reject anything inside a real modal (has backdrop) — that is a paid confirmation
  // and must be surfaced to the user, not silently dismissed.
  const insideModal=await heading.evaluate(node=>{
   let parent=node
   while(parent){
    const style=getComputedStyle(parent)
    const role=parent.getAttribute('role')
    if(role==='dialog'||role==='alertdialog')return true
    if(style.position==='fixed'&&Number(style.zIndex)>=100&&parent.querySelector('[class*=overlay],[class*=mask],[class*=backdrop]'))return true
    parent=parent.parentElement
   }
   return false
  }).catch(()=>false)
  if(insideModal||seen.has(candidate.label)) continue
  seen.add(candidate.label)
  for(const label of candidate.close){
   const button=page.getByRole('button',{name:label,exact:true}).first()
   if(await button.count()&&await button.isVisible().catch(()=>false)){
    await button.click({timeout:2000}).catch(()=>{})
    dismissed++
    break
   }
  }
  // Try a top-right × icon near the heading as a last resort for non-modal cards.
  const closeIcon=heading.locator('xpath=ancestor::*[1]//*[self::button or self::span][@aria-label="close" or @aria-label="Close"]').first()
  if(await closeIcon.count()&&await closeIcon.isVisible().catch(()=>false)){
   await closeIcon.click({timeout:2000}).catch(()=>{})
   dismissed++
  }
 }
 return dismissed
}

/**
 * Recognize pure-affordance UI (up-sell / membership / risk banners). Returns
 * 'affordance' when a non-modal informational card is present and dismissAffordance
 * has handled it; null otherwise. Designed so callers can keep moving instead of
 * blocking on text like "升级 Pro" or "今日免费次数已用完" that previously tripped
 * the inline-regex safety net.
 */
export async function affordanceUI(page){
 try{
  for(const label of ['升级 Pro 后享受更多生成次数','解锁更高画质或更长时长','今日免费次数已用完','生成内容存在风险，请确认','生成内容真实性自负责任']){
   const heading=page.getByText(label,{exact:true}).first()
   if(!await heading.isVisible().catch(()=>false)) continue
   const insideModal=await heading.evaluate(node=>{
    let parent=node
    while(parent){
     const role=parent.getAttribute('role')
     if(role==='dialog'||role==='alertdialog')return true
     parent=parent.parentElement
    }
    return false
   }).catch(()=>false)
   if(insideModal) return null
   return 'affordance'
  }
 }catch{}
 return null
}
/** Classify real blockers separately from DOM/network faults; do not call every error a captcha. */
export async function sessionBlocker(page) {
 const challenge=page.locator('[id*="captcha"], [class*="captcha-verify"], iframe[src*="captcha"]')
 for(const node of await challenge.all()) if(await node.isVisible().catch(()=>false)) return 'needs_verification'
 // Labels are real only when they sit inside a visible modal/overlay; an inline
 // "安全确认" headline rendered next to the generation button is informational copy,
 // not a verification request — previously this mis-classified as needs_verification
 // and pinned the account to ready devices, forcing a manual wait_for_user later.
 for(const label of ['请完成安全验证','请完成以下验证','拖动滑块完成拼图','安全确认']) {
  const node=page.getByText(label,{exact:true}).first()
  if(!await node.isVisible().catch(()=>false)) continue
  const inModal=await node.evaluate(target=>{
   let parent=target
   while(parent){
    const style=getComputedStyle(parent)
    const role=parent.getAttribute('role')
    if(role==='dialog'||role==='alertdialog')return true
    if(style.position==='fixed'&&Number(style.zIndex)>=100)return true
    parent=parent.parentElement
   }
   return false
  }).catch(()=>false)
  if(inModal) return 'needs_verification'
 }
 for(const label of ['登录后使用豆包','手机号登录','扫码登录']) {
  if(await page.getByText(label,{exact:true}).first().isVisible().catch(()=>false)) return 'needs_login'
 }
 return null
}
/** Retry collection/HTTP safely; only preparation can reach the one-time submit boundary. */
export function recoveryPolicy(stage,status,blocker) {
 if(status===409||status===403||status===401) return 'hold'
 if(blocker) return 'wait_user'
 if(['submitted','downloaded','completed'].includes(stage)) return 'retry_original'
 if(['submitting','submission_unknown'].includes(stage)) return 'reconcile_only'
 return 'retry_prepare'
}

/**
 * Decide whether a failure deserves a temporary wait_for_user state (account kept,
 * no held pause) versus the existing terminal needs_user held pause. The contract:
 *   { handoff: true,  hint } → keep the same worker running, just ask the user to
 *                                intervene in the dedicated account window; once they
 *                                resume the original task, reconcile will continue.
 *   { handoff: false }       → treat the failure with the existing recovery policy
 *                                (the failure is unrelated to a human hand-off).
 * Only errors that the platform itself raises as a real confirmation / captcha /
 * subscription prompt / unsupported specification are classified here; everything
 * else falls through so the original auto-recovery path stays unchanged.
 */
export function classifyHumanHandOff(errorMessage){
 const text=String(errorMessage||'')
 if(/官网需要单独授权或权益确认/.test(text)) return {handoff:true,hint:'官网出现付费/会员确认弹窗，请在原账号窗口确认或关闭后等待自动继续原任务'}
 if(/请先处理官网登录或验证/.test(text)) return {handoff:true,hint:'官网需要您先登录或完成安全验证，请在原账号窗口完成后等待自动继续原任务'}
 if(/请完成安全验证|请完成以下验证|拖动滑块完成拼图|安全确认/.test(text)) return {handoff:true,hint:'官网弹出人机验证，请在原账号窗口完成后等待自动继续原任务'}
 if(/官网当前时长范围为/.test(text)) return {handoff:true,hint:'当前账号的官方视频时长滑块不支持您选择的长度，请在原账号窗口把"网页生成"的时长改为 4 秒（10s 卓像已用尽），改好后点击“恢复原任务”重新执行'}
 return {handoff:false}
}
