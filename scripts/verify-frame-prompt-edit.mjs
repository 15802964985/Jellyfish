/** Simulate slow, out-of-order prompt rendering; no generation or business writes are forwarded. */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1600,height:1050}})
let calls=[]
try {
 await page.route('**/api/**', async route=>{
  const r=route.request(),u=new URL(r.url())
  if(u.pathname.includes('/frames/')&&u.pathname.endsWith('/render')){
   const prompt=r.postDataJSON().prompt;calls.push(prompt)
   await new Promise(resolve=>setTimeout(resolve,prompt.includes('旧内容')?2200:100))
   return route.fulfill({json:{code:200,data:{execution_prompt:'FINAL:'+prompt,recommended_media:{references:[]},variables_snapshot:{}}}})
  }
  if(!['GET','OPTIONS'].includes(r.method()))return route.abort()
  const response=await route.fetch({url:'http://127.0.0.1:8000'+u.pathname+u.search})
  if(u.pathname.includes('/shot-details/')){const body=await response.json();if(body.data && 'mood_tags' in body.data){Object.assign(body.data,{first_frame_prompt:'',key_frame_prompt:'',last_frame_prompt:''});return route.fulfill({json:body})}}
  return route.fulfill({response})
 })
 await page.goto((process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:5174')+process.env.JELLYFISH_STUDIO_PATH)
 await page.waitForTimeout(1500)
 const open=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');if(await open.isVisible())await open.click()
 await page.getByRole('tab',{name:'关键帧与参考图',exact:true}).click()
 for(const frame of ['首帧','关键帧','尾帧']){
  const group=page.locator('.cs-group').filter({has:page.getByText(frame+'图片',{exact:true})})
  await group.getByRole('button',{name:/^生\s*成$/}).click()
  const input=page.getByPlaceholder('请输入基础提示词，例如人物动作、场景氛围、镜头视角等…')
  await input.fill(frame+'旧内容')
  await page.waitForTimeout(850)
  assert.equal(await input.isEnabled(),true)
  await input.fill(frame+'新内容  ')
  await page.waitForTimeout(900)
  await page.getByText('FINAL:'+frame+'新内容',{exact:true}).waitFor()
  await page.waitForTimeout(1700)
  assert.equal(await input.inputValue(),frame+'新内容  ')
  assert.equal(await page.getByText('FINAL:'+frame+'旧内容',{exact:true}).count(),0)
  const before=calls.length
  await input.dispatchEvent('compositionstart');await input.fill(frame+'中文输入中')
  await page.waitForTimeout(900);assert.equal(calls.length,before)
  await input.dispatchEvent('compositionend');await page.waitForTimeout(900)
  await page.getByText('FINAL:'+frame+'中文输入中',{exact:true}).waitFor()
  await page.getByRole('dialog').filter({has:input}).getByRole('button',{name:'Close',exact:true}).click()
 }
 console.log('PASS: all three frames editable during requests, newest result wins, whitespace preserved, IME waits; '+calls.length+' simulated renders, no paid calls or business writes')
} catch(error){console.log((await page.locator('body').innerText()).slice(-3000));throw error} finally {await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
