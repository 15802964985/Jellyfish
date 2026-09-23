/** Real shared React controls with all backend/platform requests mocked offline. */
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'msedge',headless:true})
const context=await browser.newContext({viewport:{width:540,height:850},serviceWorkers:'block'})
const posts=[],errors=[]
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url())
 if(url.pathname==='/channel-fixture')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/src/components/__fixtures__/WebChannelCheck.tsx"></script>'})
 if(url.pathname.startsWith('/api/')){
  let data={}
  if(url.pathname.endsWith('/platforms'))data=Object.fromEntries(['doubao','jimeng','kling','wanxiang','yuanbao','hailuo','zhipu'].map(id=>[id,{name:id}]))
  else if(url.pathname.endsWith('/accounts'))data=[{id:'jimeng-a',platform:'jimeng',display_name:'即梦账号',enabled:true,supported_models:[]},{id:'doubao-a',platform:'doubao',display_name:'豆包账号',enabled:true,supported_models:['Seedream 4.5']}]
  else if(url.pathname.includes('/models/'))data={models:[{name:url.pathname.includes('/jimeng/')?'图片 3.0':'Seedream 4.5',note:'offline fixture'}]}
  else if(req.method()==='POST'){posts.push(JSON.parse(req.postData()));data={task_id:'fixture-result',status:'running',stage:'handoff_ready'}}
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 }
 if(url.hostname==='127.0.0.1'&&url.port==='5187')return route.continue()
 return route.abort()
})
try{
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:5187/channel-fixture')
 await page.getByText('API fixture',{exact:true}).waitFor()
 assert.equal(posts.length,0)
 await page.getByText('平台网页',{exact:true}).click()
 await page.getByRole('button',{name:'平台网页生成',exact:true}).click()
 const model=page.getByRole('combobox',{name:'官网实际模型'})
 await model.fill('图片 3.0');await model.press('Enter')
 await page.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'交接平台'})}).click()
 await page.locator('.ant-select-item-option-content').getByText('doubao',{exact:true}).click()
 assert.equal(await page.locator('.ant-select-selection-item').filter({hasText:'图片 3.0'}).count(),0)
 await model.fill('Seedream 4.5');await model.press('Enter')
 await page.getByRole('checkbox').check()
 await page.getByRole('button',{name:'创建交接单',exact:true}).click()
 await page.waitForFunction(()=>document.body.innerText.includes('已创建')||!document.body.innerText.includes('创建交接单'))
 assert.equal(posts.length,1)
 assert.equal(posts[0].platform,'doubao');assert.equal(posts[0].requested_model,'Seedream 4.5')
 assert.equal(posts[0].entity_id,'fixture-shot');assert.equal(posts[0].expected_version,3)
 assert.equal(posts[0].execution_mode,'manual');assert.equal(posts[0].account_id,null)
 assert.equal(errors.length,0,errors.join('\n'))
 console.log('PASS shared channel, platform/model reset, frozen target and no implicit API submission')
}catch(error){console.error(errors);throw error}finally{await browser.close()}
