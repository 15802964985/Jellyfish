/** Bind one exclusive submission, including separately rendered reference-image messages. */
export async function readSubmissionGroup(page,request){
 const rows=await page.locator('[data-message-id]').evaluateAll(nodes=>nodes.map(n=>({
  id:n.getAttribute('data-message-id'),user:n.classList.contains('justify-end'),text:(n.innerText||'').trim(),
  attachments:[...n.querySelectorAll('[data-plugin-identifier="block_type:10052"]')].filter(block=>block.closest('[data-message-id]')===n).length
 })))
 return submissionGroup(rows,request.reference_file_ids?.length||0)
}

/** Only the initial contiguous user group can belong to an exclusive empty-chat send.
 * Exact observed attachment-block counts cover both split and combined layouts. Empty
 * unknown nodes remain unresolved; extra text/messages are never selected by prompt match.
 */
export function submissionGroup(rows,referenceCount){
 const end=rows.findIndex(row=>!row.user),prefix=end<0?rows:rows.slice(0,end)
 if(!prefix.length)return null
 const text=prefix.filter(row=>row.text.trim())
 if(text.length>1)throw Error('本次提交存在多个文本消息匹配，停止以防串用结果')
 if(!text.length)return null
 if(prefix.some(row=>!/^\d+$/.test(row.id)))throw Error('提交消息编号无效')
 if(new Set(prefix.map(row=>row.id)).size!==prefix.length)throw Error('提交消息编号重复')
 const count=prefix.reduce((sum,row)=>sum+row.attachments,0)
 if(count>referenceCount)throw Error('提交附件数量超过原任务，停止以防串用')
 if(count!==referenceCount||prefix.some(row=>!row.text.trim()&&!row.attachments))return null
 return {user_message_id:text[0].id,user_message_ids:prefix.map(row=>row.id),attachment_message_ids:prefix.filter(row=>row.attachments).map(row=>row.id),reference_count:referenceCount,message_id:end<0?null:rows[end].id}
}

/** Validate every persisted member in its original contiguous group before collecting replies. */
export function submissionEnd(rows,anchor){
 const index=rows.findIndex(row=>row.user&&row.id===anchor.user_message_id)
 if(index<0)throw Error('原任务用户消息编号缺失，禁止改用提示词匹配')
 if(!anchor.user_message_ids)return index
 const end=rows.findIndex(row=>!row.user),prefix=end<0?rows:rows.slice(0,end)
 if(JSON.stringify(prefix.map(row=>row.id))!==JSON.stringify(anchor.user_message_ids)||!anchor.user_message_ids.includes(anchor.user_message_id))throw Error('原提交消息组已变化，停止避免串用')
 return prefix.length-1
}
