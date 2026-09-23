/** 三视图槽位和参考锁定的浏览器验证；全部接口响应模拟，禁止真实生成。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1360,height:1000}})
let images=[{id:1,view_angle:'FRONT',file_id:'anchor-file'}], renders=0, paid=0
await page.route('**/api/**',async route=>{
 const req=route.request(), path=new URL(req.url()).pathname
 if(path.endsWith('/entities/character/fixture'))return route.fulfill({json:{data:{id:'fixture',name:'测试角色',description:'同一个人物',tags:[],visual_style:'现实'}}})
 if(path.endsWith('/entities/character/fixture/images')){
  if(req.method()==='POST'){images.push({id:images.length+1,...req.postDataJSON()});return route.fulfill({json:{data:images.at(-1)}})}
  return route.fulfill({json:{data:{items:images,pagination:{total:images.length,page:1,page_size:100}}}})
 }
 if(path.endsWith('/render')){renders++;return route.fulfill({json:{data:{execution_prompt:'人物全身像',recommended_media:{references:[{file_id:'unwanted',media_kind:'image',ordinal:0}]}}}})}
 if(req.method()!=='GET'){paid++;return route.abort()}
 return route.fulfill({json:{data:{items:[],pagination:{total:0,page:1,page_size:10}}}})
})
try{
 await page.goto((process.env.JELLYFISH_WEB_URL||'http://127.0.0.1:5174')+'/projects/project/roles/fixture/edit')
 await page.getByRole('button',{name:'建立三视图槽位'}).click()
 await page.getByText('照片角度：背面',{exact:true}).waitFor()
 assert.deepEqual(images.map(i=>i.view_angle),['FRONT','LEFT','BACK'])
 await page.reload();await page.getByText('照片角度：背面',{exact:true}).waitFor()
 const back=page.locator('.ant-card').filter({has:page.getByText('照片角度：背面',{exact:true})}).last()
 await back.getByRole('button',{name:/生\s*成/,exact:true}).click()
 await page.getByText('请先选择并确认主形象', {exact:false}).waitFor();assert.equal(renders,0)
 await page.getByRole('combobox',{name:'主形象参考'}).click();await page.getByText('正面 · 图片 1',{exact:true}).click()
 await page.getByRole('button',{name:'确认主形象'}).click()
 await back.getByRole('button',{name:/生\s*成/,exact:true}).click()
 await page.getByText('已确认主形象（本次生成的唯一图片参考）').waitFor()
 const modal=page.locator('.ant-modal-content').last()
 assert.ok((await modal.locator('textarea').inputValue()).includes('背面全身视图'))
 assert.equal(await modal.locator('img[src*="anchor-file"]').count(),1)
 assert.equal(await modal.locator('img[src*="unwanted"]').count(),0)
 assert.equal(await modal.getByRole('button',{name:'全部不使用'}).isDisabled(),true)
 assert.equal(paid,0)
 await page.screenshot({path:'local-reports/three-view-flow.png',fullPage:true})
 console.log('PASS: persisted FRONT/LEFT/BACK slots, explicit anchor, exact single-reference preview, zero paid submissions')
}finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
