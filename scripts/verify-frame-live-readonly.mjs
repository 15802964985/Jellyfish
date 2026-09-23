/** 正式环境只读核对三种帧的免费草稿、渲染和模型目录；阻止业务写入/收费。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1700,height:1050}})
const errors=[],blocked=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('response',async r=>{if(r.url().includes('/api/')&&r.status()>=400)console.log('HTTP',r.status(),r.url(),await r.text())})
await page.route('**/api/**',route=>{
 const r=route.request(),p=new URL(r.url()).pathname
 if(['GET','OPTIONS'].includes(r.method())||p.endsWith('/frame-review-check')||/\/frames\/(first|key|last)\/render$/.test(p))return route.continue()
 blocked.push(p);return route.abort()
})
try{
 await page.goto('http://127.0.0.1:7788/projects/aca3f2bd-f274-4ca6-b530-892a5a57b441/chapters/643f01c6-b6a4-5327-ae11-1d142be61cc3/studio?shotId=2056143f-48ac-4eef-9f8e-86cec575e7af')
 await page.getByText('清晨林荫道侧跟拍小女孩背大书包蹲看蚂蚁并回头确认妈妈',{exact:true}).first().click()
 await page.waitForTimeout(1500)
 const expand=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');if(await expand.isVisible())await expand.click()
 await page.getByRole('tab',{name:'关键帧与参考图',exact:true}).click()
 for(const [i,label] of ['首帧','关键帧','尾帧'].entries()){
  await page.getByRole('button',{name:/^生\s*成$/}).nth(i).click()
  const dialog=page.getByRole('dialog').filter({has:page.getByText('参考图与参数 → 提示词 → 生成 → 查看并采用图片',{exact:true})})
  const input=dialog.getByPlaceholder('请输入基础提示词，例如人物动作、场景氛围、镜头视角等…')
  await input.waitFor();assert.ok((await input.inputValue()).length>30)
  await dialog.getByText('最终提示词已准备',{exact:false}).waitFor()
  if(i===0){
   for(const width of [1700,900,540]){
    await page.setViewportSize({width,height:900})
    const button=dialog.getByRole('button',{name:/^生\s*成$/})
    const box=await button.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=900,'footer visible '+width)
    await page.screenshot({path:`local-reports/frame-live-${width}.png`,fullPage:true})
   }
   await page.setViewportSize({width:1700,height:1050})
  }
  await dialog.getByRole('button',{name:/^取\s*消$/}).click()
  console.log(label+' free initial/render OK')
 }
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({ok:true,blockedWrites:blocked.length,paidCalls:0}))
}catch(e){console.log((await page.locator('body').innerText()).slice(-14000));await page.screenshot({path:'local-reports/frame-live-failure.png',fullPage:true});throw e}finally{await browser.close()}
