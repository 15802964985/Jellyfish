/** 全API模拟：离开不中断、跨会话并行、刷新恢复、断网保留、原会话结果与全局完成提醒。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL((process.env.PLAYWRIGHT_MODULE || 'C:/Users/Lenovo/AppData/Local/Temp/jellyfish-browser-check/node_modules/playwright/index.mjs')).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1400,height:1000}})
const messages={a:[],b:[]},tasks=[],writes=[],errors=[]
let offline=false, rawStatus='running', rawStarted=false
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/api/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname
 if(path.includes('/creative-directions/') && path.endsWith('/preview')) return route.fulfill({json:{data:{prompt:req.postDataJSON().prompt,direction:{}}}})
 if(req.method()!=='GET')writes.push(path)
 if(path.endsWith('/chapters/chapter-a'))return route.fulfill({json:{data:{id:'chapter-a',raw_text:'章节原文',condensed_text:''}}})
 if(path.endsWith('/task-links'))return route.fulfill({json:{data:{items:rawStarted&&new URL(req.url()).searchParams.get('relation_type')==='script_simplification'?[{task_id:'raw-task'}]:[]}}})
 if(path.includes('/raw-task/'))return route.fulfill({json:{data:{task_id:'raw-task',status:rawStatus,progress:0,result:rawStatus==='succeeded'?{simplified_script_text:'后台精简建议，等待采用'}:null}}})
 if(path.endsWith('/simplify-script-async')){rawStarted=true;return route.fulfill({json:{data:{task_id:'raw-task',status:'running'}}})}
 if(/\/task-[ab]\/status$/.test(path))return route.fulfill({json:{data:tasks.find(t=>path.includes(t.task_id))}})
 if(path.endsWith('/llm/models'))return route.fulfill({json:{data:{items:[{id:'m',name:'测试文本模型'}]}}})
 if(path.endsWith('/film/tasks')){if(offline)return route.abort();return route.fulfill({json:{data:{items:tasks,pagination:{max_page:1,total:tasks.length}}}})}
 const history=path.match(/experiment-sessions\/(a|b)\/messages$/)
 if(history)return route.fulfill({json:{data:messages[history[1]]}})
 const submit=path.match(/labs\/text\/sessions\/(a|b)\/tasks$/)
 if(submit){
  const sid=submit[1],id='task-'+sid
  messages[sid]=[{id:'u-'+sid,session_id:sid,sequence:1,role:'user',content:req.postDataJSON().content},{id:'t-'+sid,session_id:sid,sequence:2,role:'task',task_id:id,status:'running'}]
  tasks.push({task_id:id,status:'running',task_kind:'text_generation',progress:0})
  return route.fulfill({json:{data:{task_id:id,messages:messages[sid]}}})
 }
 throw new Error('Unexpected request '+path)
})
/** 向当前会话提交一个长时间不完成的后台任务。 */
async function submit(text){
 await page.locator('button').filter({hasText:'选择模型'}).click()
 await page.locator('button').filter({hasText:'测试文本模型'}).waitFor()
 await page.locator('button').filter({hasText:'测试文本模型'}).click()
 await page.getByRole('textbox').fill(text)
 await page.locator('button').filter({hasText:'发送'}).click()
 await page.getByText('任务在后台执行，可以关闭此窗口并继续其他工作。关闭不会取消任务。',{exact:true}).waitFor()
 assert.equal(await page.getByTestId('blocked').textContent(),'false')
}
try{
 await page.goto('http://127.0.0.1:5174/background-task-acceptance.html')
 await submit('会话A输入')
 await page.getByRole('button',{name:'切换其他页面',exact:true}).click()
 await page.getByText('其他页面可以正常工作').waitFor()
 await page.getByRole('button',{name:'切换会话',exact:true}).click()
 await submit('会话B输入')
 assert.equal(tasks.length,2)
 await page.reload()
 await page.getByText('任务在后台执行，可以关闭此窗口并继续其他工作。关闭不会取消任务。',{exact:true}).waitFor()
 assert.ok(await page.locator('button').filter({hasText:'发送'}).isDisabled())
 offline=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await page.waitForTimeout(400)
 assert.equal(await page.getByTestId('tasks').textContent(),'2')
 offline=false;tasks[0].status='succeeded';messages.a[1].status='succeeded';messages.a.push({id:'answer-a',session_id:'a',sequence:3,role:'assistant',content:'仅属于A的完成结果'})
 await page.getByRole('button',{name:'切换其他页面',exact:true}).click()
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await page.getByText(/已完成/).first().waitFor()
 await page.getByRole('button',{name:'切换其他页面',exact:true}).click()
 await page.getByText('仅属于A的完成结果',{exact:true}).waitFor()
 await page.getByRole('button',{name:'切换会话',exact:true}).click()
 await page.getByText('会话B输入',{exact:true}).waitFor()
 assert.equal(await page.getByText('仅属于A的完成结果',{exact:true}).count(),0)
 await page.getByRole('button',{name:'打开章节编辑',exact:true}).click()
 await page.getByPlaceholder('编辑章节原文…').waitFor()
 await page.locator('button').filter({hasText:'智能精简'}).click()
 await page.getByRole('dialog').getByText('任务在后台执行，可以关闭此窗口并继续其他工作。关闭不会取消任务。',{exact:true}).waitFor()
 await page.getByRole('dialog').locator('.ant-modal-close').click()
 await page.getByRole('dialog').waitFor({state:'hidden'})
 rawStatus='succeeded'
 await page.getByRole('button',{name:'打开章节编辑',exact:true}).click()
 await page.getByRole('textbox',{name:'待采用的章节处理结果'}).waitFor()
 assert.equal(await page.getByPlaceholder('编辑章节原文…').inputValue(),'章节原文')
 assert.equal(await page.getByRole('textbox',{name:'待采用的章节处理结果'}).inputValue(),'后台精简建议，等待采用')
 await page.getByRole('button',{name:'采用到编辑区（仍需保存）',exact:true}).click()
 assert.equal(await page.getByPlaceholder('编辑精简内容…').inputValue(),'后台精简建议，等待采用')
 assert.deepEqual(writes,['/api/v1/studio/labs/text/sessions/a/tasks','/api/v1/studio/labs/text/sessions/b/tasks','/api/v1/script-processing/simplify-script-async'])
 assert.deepEqual(errors,[])
 await page.screenshot({path:'local-reports/background-tasks.png',fullPage:true})
 console.log(JSON.stringify({ok:true,mockedTasks:3,cancelRequests:0,checks:['nonblocking','parallel-sessions','reload','network-error','completion-notification','isolated-results','chapter-close-and-recover','explicit-adoption']}))
}catch(e){console.log((await page.locator('body').innerText()).slice(-6000));throw e}finally{await browser.close()}
