/** Native Jimeng controls: website model names and disabled states never come from API identifiers. */
const ENTRY='https://jimeng.jianying.com/ai-tool/image/generate?need_login=true'
/** Read the visible option title separately from promotional text and membership notices. */
export function modelOption(text,className='',ariaDisabled=null){
 const name=text.split('\n')[0].trim()
 return {name,disabled:ariaDisabled==='true'||/option-wrapper-disabled/.test(className),membership_notice:/\bVIP\b|会员专属/.test(text),description:text.split('\n').slice(1).filter((v,i,a)=>a.indexOf(v)===i).join('；')}
}
/** Enter a fresh native composer and explicitly choose media type; persisted preferences can override the URL. */
export async function openJimengNative(page,modality){
 if(!['image','video'].includes(modality))throw Error('Unsupported native media type')
 await page.goto(ENTRY,{waitUntil:'domcontentloaded'})
 const mode=page.getByRole('combobox').filter({hasText:/图片生成|视频生成/})
 await mode.waitFor({timeout:30000})
 const wanted=modality==='image'?'图片生成':'视频生成'
 if((await mode.innerText()).trim()!==wanted){await mode.click();await page.getByRole('option',{name:wanted,exact:true}).click()}
 if(new URL(page.url()).searchParams.has('workspace'))throw Error('拒绝使用已有会话准备新任务')
 const model=page.getByRole('combobox').filter({hasText:modality==='image'?/^图片 \d/:/Seedance|视频 \d|MiniMax|HappyHorse|Wan /})
 await model.waitFor({timeout:15000})
 return model
}
/** Observe real model options without choosing one, generating, or claiming they are free. */
export async function observeJimengNative(page,modality){
 const model=await openJimengNative(page,modality),selected=(await model.innerText()).trim()
 await model.click()
 const rows=await page.getByRole('option').evaluateAll(ns=>ns.map(n=>({text:n.innerText,cls:n.className,disabled:n.getAttribute('aria-disabled')})))
 const models=rows.map(r=>modelOption(r.text,r.cls,r.disabled))
 await page.keyboard.press('Escape')
 return {modality,selected,models,observed_at:new Date().toISOString(),automatic_supported:false}
}
/** Select only the requested native model; fail closed on disabled or unconfirmed membership-only entries. */
export async function selectJimengModel(page,modality,name,{membershipConfirmed=false}={}){
 const model=await openJimengNative(page,modality)
 await model.click()
 // Playwright hasText uses textContent: visible line breaks must be read from innerText instead.
 const options=page.getByRole('option')
 await options.first().waitFor()
 const titles=await options.evaluateAll(ns=>ns.map(n=>n.innerText.split('\n')[0].trim()))
 const matches=titles.flatMap((title,index)=>title===name?[index]:[])
 if(matches.length!==1)throw Error('官网模型名称不存在或不唯一')
 const option=options.nth(matches[0])
 const evidence=modelOption(await option.innerText(),await option.getAttribute('class')||'',await option.getAttribute('aria-disabled'))
 if(evidence.disabled)throw Error('官网当前已禁用该模型')
 if(evidence.membership_notice&&!membershipConfirmed)throw Error('该模型要求会员权益，未确认前不自动选择')
 await option.click()
 if((await model.innerText()).trim()!==name)throw Error('官网实际选中型号与任务不一致')
 return evidence
}
/** Prepare a text-only native image draft. Submission is intentionally a separate future verified adapter stage. */
export async function prepareJimengImageDraft(page,request){
 if(request.reference_file_ids?.length)throw Error('参考图上传及映射尚待独立验证')
 await selectJimengModel(page,'image',request.requested_model)
 const editor=page.locator('[contenteditable=true][role=textbox]:visible').first()
 await editor.fill(request.prompt)
 if((await editor.innerText()).trim()!==request.prompt.trim())throw Error('提示词准备不完整')
 return {model:request.requested_model,prompt:request.prompt,submitted:false}
}
