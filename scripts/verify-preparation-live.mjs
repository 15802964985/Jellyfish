/** Read-only production UI check; only existence-check POST is forwarded, all writes blocked. */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1600,height:1050}})
const errors=[];let writes=0
page.on('pageerror',e=>errors.push(e.message))
try {
 await page.route('**/api/**',route=>{
  if(!['GET','OPTIONS'].includes(route.request().method())&&!route.request().url().includes('/entities/existence-check')){writes++;return route.abort()}
  return route.continue()
 })
 const origin=process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:7788'
 await page.goto(origin+'/assets?tab=scene&create=1&name=只读验收不保存')
 await page.getByRole('dialog').getByText('新建场景',{exact:true}).waitFor()
 assert.equal(new URL(page.url()).port,new URL(origin).port)
 await page.getByRole('dialog').getByRole('button',{name:/取\s*消/}).click()
 await page.goto(origin+process.env.JELLYFISH_PREPARATION_PATH)
 await page.getByRole('tab',{name:/提取确认/}).click()
 for(const name of (process.env.JELLYFISH_EXPECTED_ASSETS||'').split(',').filter(Boolean)){
   const text='匹配资产：'+name+'（待确认关联）'
   await page.getByText(text,{exact:true}).waitFor()
   const card=page.locator('.ant-card').filter({has:page.getByText(text,{exact:true})}).last()
   await card.locator('img').waitFor()
   await page.waitForFunction(text=>{
    const node=[...document.querySelectorAll('.ant-card')].reverse().find(n=>n.textContent.includes(text))
    const img=node?.querySelector('img');return img&&img.complete&&img.naturalWidth>0
   },text)
 }
 await page.getByRole('button',{name:'新建场景',exact:true}).click()
 await page.getByLabel('新建资产名称').fill('仅浏览器未保存')
 await page.getByRole('button',{name:'保存并关联当前镜头'}).waitFor()
 await page.getByRole('dialog').getByRole('button',{name:'Close'}).click()
 assert.deepEqual(errors,[]);assert.equal(writes,0)
 console.log('PASS: /assets deep-link keeps published port, matched asset photos loaded, inline creation opens, no production writes.')
}catch(e){console.log((await page.locator('body').innerText()).slice(-1800));throw e}
finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
