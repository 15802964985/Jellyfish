/** Read-only production navigation: every write and every external website request is blocked. */
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const base=process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:7788'
const browser=await chromium.launch({channel:'msedge',chromiumSandbox:true,headless:true})
const page=await browser.newPage({viewport:{width:1440,height:950}})
const errors=[],writes=[]
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/*',route=>{
 const req=route.request(),url=new URL(req.url())
 if(!['GET','OPTIONS'].includes(req.method())){writes.push(url.pathname);return route.abort()}
 if(url.origin!==base&&!(['http://127.0.0.1:8000','http://localhost:8000'].includes(url.origin)&&url.pathname.startsWith('/api/')))return route.abort()
 return route.continue()
})
try{
 await page.goto(base+'/settings/web-models',{waitUntil:'domcontentloaded'})
 await page.getByRole('row').filter({hasText:'Seedream 4.5'}).waitFor()
 await page.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'模型目录用途',exact:true})}).click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText('生成视频',{exact:true}).click()
 await page.getByRole('row').filter({hasText:'Seedance 2.0 Fast'}).waitFor()
 await page.getByRole('row').filter({hasText:'Seedance 2.0 Mini'}).waitFor()
 await page.getByRole('link',{name:'网页平台账号',exact:true}).click()
 await page.getByText('执行器已核实模型',{exact:true}).waitFor()
 // Verify production distinguishes stale login evidence from a connected but paused worker.
 const accounts=await (await fetch('http://127.0.0.1:8000/api/v1/studio/web-generation/accounts')).json()
 for(const account of accounts){
  const row=page.locator(`tr[data-row-key="${account.id}"]`)
  if(!account.online)await row.getByText('登录状态待连接后核验',{exact:true}).waitFor()
  else {
   assert.equal(await row.getByRole('button',{name:'打开官网登录',exact:true}).isDisabled(),true)
   if(account.platform==='jimeng'){assert.equal(account.session_state,'signed_in');await row.getByText('官网已登录 · 自动生成待适配',{exact:true}).waitFor()}
   if(account.session_state==='offline')await row.getByText('自动执行暂停 / 待恢复',{exact:true}).waitFor()
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 console.log('PASS production model directory, image/video evidence isolation, account link; zero writes/external calls')
}catch(error){console.log('ERRORS',errors);console.log('PAGE',(await page.locator('body').innerText()).slice(0,2000));throw error}finally{await browser.close()}
