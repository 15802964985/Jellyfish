/** 正式手动分镜回归：只读访问，拦截所有写请求和收费调用。 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({channel:'msedge',headless:true})
const page = await browser.newPage({viewport:{width:1500,height:1000}})
const errors=[], failures=[], writes=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failures.push({url:r.url(),status:r.status()})})
await page.route('**/api/**',async route=>{
  if(!['GET','OPTIONS'].includes(route.request().method())){writes.push(route.request().url());return route.abort()}
  return route.continue()
})
const project='aca3f2bd-f274-4ca6-b530-892a5a57b441',chapter='643f01c6-b6a4-5327-ae11-1d142be61cc3',shot='19dad913-ced4-4cd8-bbd4-de1d5bc0a606'
const base=process.env.JELLYFISH_WEB_URL||'http://127.0.0.1:7788'
try {
 await page.goto(`${base}/projects/${project}/chapters/${chapter}/shots/${shot}/edit`)
 await page.getByText('分镜准备',{exact:true}).first().waitFor()
 await page.getByText('测试新增分镜',{exact:false}).first().waitFor()
 assert.ok(page.url().includes(`/shots/${shot}/edit`))
 await page.screenshot({path:'local-reports/manual-shot-edit.png',fullPage:true})
 await page.goto(`${base}/projects/${project}/chapters/${chapter}/studio?shotId=${shot}`)
 await page.getByRole('tab',{name:'视频生成',exact:true}).waitFor()
 await page.getByText('测试新增分镜',{exact:false}).first().waitFor()
 await page.getByRole('tab',{name:'生成参数',exact:true}).click()
 await page.getByRole('textbox',{name:'镜头视频时长'}).waitFor()
 assert.equal(await page.getByRole('textbox',{name:'镜头视频时长'}).inputValue(),'4')
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 await page.screenshot({path:'local-reports/manual-shot-studio.png',fullPage:true})
 assert.deepEqual(errors,[])
 assert.deepEqual(failures,[])
 console.log(JSON.stringify({ok:true,errors,failures,blockedWrites:writes.length}))
} finally {await browser.close()}
