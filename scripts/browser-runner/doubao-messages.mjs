/** Normalize observed presentation markup without deleting substantive punctuation or negation.
 *  Doubao's chat bubble preserves user-typed markdown verbatim ("生成图片: ## 标题"),
 *  so heading hashes must be stripped everywhere they appear, not only at line starts. */
export function normalizePrompt(value) {
 return String(value).normalize('NFKC').replace(/・/g,'·')
  .replace(/[ \t]*#{1,6}[ \t]+/g,'').replace(/^\s*>\s?/gm,'')
  .replace(/\*\*([^\n]+?)\*\*/g,'$1').replace(/__([^\n]+?)__/g,'$1')
  .replace(/`([^`\n]+)`/g,'$1').replace(/\s+/g,'').trim()
}

/** Strip trailing parameter suffixes the user often appends after a prompt
 *  ("，16:9，4s" / "，Seedance 2.0 Mini"). Aspect / duration / model are still
 *  independently verified by confirmationMatches when reconciling a finished
 *  session, so this loosening is safe against 张冠李戴. */
function stripParameterSuffixes(text){
 let result=text
 for(let i=0;i<3;i++){
  const prev=result
  result=result
   .replace(/[，,]\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*$/,'')
   .replace(/[，,]\s*\d+(?:\.\d+)?\s*[秒s]\s*$/,'')
   .replace(/[，,]\s*[Ss]eedance[^，,]*$/,'')
  if(result===prev)break
 }
 return result
}
/** Only a known leading platform label may surround a matching prompt; arbitrary substrings are unsafe.
 *  Accepts the user-typed message when, after stripping the "生成图片/视频:" platform label,
 *  the wanted prompt sits at the start and is followed by a separator (， , . ; : or end).
 *  This admits legitimate "，16:9，4s" suffixes the user types manually while still rejecting
 *  content drift like "不要..." or "但加滤镜" mid-sentence. */
export function promptMatches(actual, expected) {
 const wanted=normalizePrompt(expected)
 if(!wanted)return false
 const fullActual=normalizePrompt(actual)
 if(fullActual===wanted)return true
 const withoutLabel=fullActual.replace(/^\s*生成(?:图片|视频)\s*[:：]\s*/,'')
 if(withoutLabel===wanted)return true
 // wanted 必须是 withoutLabel 的严格前缀（idx===0），且后接分隔符或末尾
 const after=withoutLabel.slice(wanted.length)
 if(after&&!/^[，,、。；;：:]/.test(after))return false
 // Legacy recovery requires complete content after known parameter suffix removal; arbitrary suffixes are not identity.
 if(withoutLabel.startsWith(wanted)&&stripParameterSuffixes(withoutLabel)===wanted)return true
 // 兜底：完整剥离参数尾缀后再比对（用户参数说明嵌在文本中间或末尾）
 return stripParameterSuffixes(withoutLabel)===wanted
}

/** Keep the original message IDs, requiring the caller to reject ambiguous matches. */
export async function matchingPromptIds(page,prompt) {
 const nodes=await page.locator('[data-message-id].justify-end').evaluateAll(elements=>elements.map(n=>({id:n.getAttribute('data-message-id'),text:n.innerText})))
 return nodes.filter(n=>promptMatches(n.text,prompt)).map(n=>n.id)
}
