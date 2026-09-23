/** Verify actual studio panels against read-only production APIs; all mutations are blocked. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium }=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1600,height:1050}})
let mutations=0
try{
 await page.route('**/api/**',async route=>{
  if(!['GET','OPTIONS'].includes(route.request().method())){mutations++;return route.abort()}
  const url=new URL(route.request().url())
  const response=await route.fetch({url:'http://127.0.0.1:8000'+url.pathname+url.search})
  return route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}})
 })
 await page.goto((process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:5174')+process.env.JELLYFISH_STUDIO_PATH)
 await page.getByText('分镜生成面板', { exact: true }).waitFor()
 await page.getByRole('tab',{name:'关键帧与参考图',exact:true}).click()
 const image=page.getByRole('region',{name:'图片参数与费用',exact:true})
 const imageSpec=(await (await fetch('http://127.0.0.1:8000/api/v1/llm/generation-specification?category=image&ratio=16:9')).json()).data
 await image.getByText(imageSpec.model_name,{exact:false}).waitFor()
 assert.match(await image.innerText(),/按量原价参考/)
 await image.locator('.ant-select-selector').click()
 await page.keyboard.press('Escape')
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 const video=page.getByRole('region',{name:'视频参数与费用',exact:true})
 const videoSpec=(await (await fetch('http://127.0.0.1:8000/api/v1/llm/generation-specification?category=video&ratio=16:9')).json()).data
 await video.getByText(videoSpec.model_name,{exact:false}).waitFor()
 const target=videoSpec.options.at(-1)
 await video.locator('.ant-select-selector').click()
 await page.locator('.ant-select-dropdown:visible').getByText(target.label,{exact:true}).click()
 assert.ok((await video.innerText()).includes(target.label))
 // Page autosave attempts, if any, were aborted by the route guard.
 console.log('PASS: actual studio image/video panels visible, dynamic options and price references; video tier selectable; writes forwarded 0; blocked attempts '+mutations)
}catch(error){await page.screenshot({path:process.env.TEMP+'/jellyfish-panel-ui.png'});console.log((await page.locator('body').innerText()).slice(-5000));throw error}
finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
