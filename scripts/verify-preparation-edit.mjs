/** All API calls are fixtures; no real database writes or model generation. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1050,height:950}})
const calls=[],errors=[]
page.on('pageerror',e=>errors.push(e.message))
const models=[{model_id:'wan',revision_id:'r1',provider:'aliyun_bailian',provider_name:'阿里百炼',model_name:'wan2.7-videoedit',available:true,resolutions:['720P','1080P'],default_resolution:'720P',durations:[],max_images:4,instructions:'原片2–10秒',image_label:'第{n}张参考图'},
{model_id:'h3',revision_id:'r2',provider:'minimax',provider_name:'MiniMax',model_name:'MiniMax-H3',available:true,resolutions:['768P','2K'],default_resolution:'768P',durations:[4,5,6],default_seconds:5,max_images:9,instructions:'H3',image_label:'图片{n}'}]
try {
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());calls.push({path:url.pathname,method:req.method(),body:req.postDataJSON()})
  let data={}
  if(url.pathname==='/api/photo')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="green"/></svg>'})
  if(url.pathname.includes('/entities/'))data=req.method()==='POST'?{id:'new-scene'}:{items:[{id:'mother',name:'妈妈',project_id:'p',thumbnail:'/api/photo'}],pagination:{total:1,page:1,page_size:100}}
  if(url.pathname.endsWith('/preparation-link'))data={state:{shot:{id:'s'}}}
  if(url.pathname.endsWith('/video-edit-models'))data={models,candidates:[]}
  if(url.pathname.includes('/task-links'))data={items:[],pagination:{total:0}}
  if(url.pathname.endsWith('/video-edit-preflight')){const b=req.postDataJSON();data={revision_id:b.expected_revision_id,seconds:5,width:1280,height:720,has_audio:false,options:b.options,estimate:{amount:b.options.resolution==='1080P'?'10':'6',currency:'CNY',note:'fixture',source:'https://example.com'},warnings:[]}}
  return route.fulfill({json:{code:200,message:'success',data}})
 })
 await page.goto((process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:5174')+'/preparation-acceptance.html')
 await page.getByRole('button',{name:'新建场景',exact:true}).click()
 await page.getByLabel('新建资产名称').fill('未提取场景')
 await page.getByRole('button',{name:'保存并关联当前镜头'}).click()
 await page.getByText('已关联当前镜头',{exact:true}).waitFor()
 assert.ok(calls.some(c=>c.path.endsWith('/preparation-link')&&c.body.linked_entity_id==='new-scene'))
 await page.getByText('选择 / 新建',{exact:true}).click()
 await page.getByRole('button',{name:'选择并关联'}).click()
 await page.getByRole('dialog').waitFor({state:'hidden'})
 assert.ok(calls.some(c=>c.path.endsWith('/preparation-link')&&c.body.candidate_id===1))
 await page.getByRole('button',{name:'文字编辑视频'}).click()
 await page.locator('.ant-select[aria-label="编辑模型"] .ant-select-selector').click()
 await page.locator('.ant-select-dropdown:visible').getByText('阿里百炼 / wan2.7-videoedit',{exact:true}).click()
 await page.getByText('费用估算：6 CNY',{exact:true}).waitFor()
 await page.locator('.ant-select[aria-label="编辑分辨率"] .ant-select-selector').click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText('1080P',{exact:true}).click()
 await page.getByText('费用估算：10 CNY',{exact:true}).waitFor()
 await page.locator('.ant-select[aria-label="编辑模型"] .ant-select-selector').click()
 await page.locator('.ant-select-dropdown:visible').getByText('MiniMax / MiniMax-H3',{exact:true}).click()
 assert.equal(await page.getByRole('combobox',{name:'编辑输出时长'}).count(),1)
 assert.ok(!calls.some(c=>c.path.endsWith('/video-edits')))
 assert.deepEqual(errors,[])
 console.log('PASS: no-extraction creation, automatic association, explicit candidate ID, live picture, dynamic model tiers/cost; paid requests 0.')
} finally {await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
