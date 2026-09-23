/** 角色创建/补选/解除演员的模拟写请求验证，不改业务数据。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
const project='aca3f2bd-f274-4ca6-b530-892a5a57b441', base=process.env.JELLYFISH_WEB_URL||'http://127.0.0.1:5174'
let role={id:'fixture-role',project_id:project,name:'测试未选角',description:'原始角色设定',actor_id:null,visual_style:'现实',tags:[]},created,patches=[],unexpected=[]
await page.route('**/api/**',async route=>{
 const req=route.request(),u=new URL(req.url()),p=u.pathname
 if(p==='/api/v1/studio/entities/character'){
  if(req.method()==='POST'){created=req.postDataJSON();return route.fulfill({json:{data:role}})}
  return route.fulfill({json:{data:{items:created?[role]:[],pagination:{total:created?1:0,page:1,page_size:100}}}})
 }
 if(p.endsWith('/entities/character/fixture-role')){
  if(req.method()==='PATCH'){patches.push(req.postDataJSON());role={...role,...req.postDataJSON()}}
  return route.fulfill({json:{data:role}})
 }
 if(p.endsWith('/entities/character/fixture-role/images'))return route.fulfill({json:{data:{items:[{id:91,view_angle:'FRONT',file_id:null}],pagination:{total:1}}}})
 if(p.endsWith('/shot-links/actor'))return route.fulfill({json:{data:{items:[{id:1,actor_id:'fixture-actor'}],pagination:{total:1}}}})
 if(p.endsWith('/entities/actor/fixture-actor'))return route.fulfill({json:{data:{id:'fixture-actor',name:'测试演员',description:'演员形象'}}})
 if(req.method()!=='GET'){unexpected.push(p);return route.abort()}
 const response=await route.fetch({url:'http://127.0.0.1:8000'+p+u.search});return route.fulfill({response})
})
try{
 await page.goto(base+`/projects/${project}?tab=roles&create=1&name=测试未选角`)
 await page.getByText('关联演员（可选，可稍后在角色编辑页关联）',{exact:true}).waitFor()
 await page.getByRole('dialog').getByRole('button',{name:/创\s*建/,exact:true}).click()
 await page.getByText('角色创建成功',{exact:true}).waitFor();assert.equal(created.actor_id,null)
 await page.goto(base+`/projects/${project}/roles/fixture-role/edit`)
 await page.getByText('当前未关联演员',{exact:true}).waitFor()
 await page.getByRole('combobox',{name:'角色关联演员'}).click();await page.getByText('测试演员',{exact:true}).click()
 await page.getByRole('button',{name:'保存演员关联',exact:true}).click()
 await page.getByText('当前演员：测试演员',{exact:true}).waitFor();assert.deepEqual(patches.at(-1),{actor_id:'fixture-actor'})
 await page.reload();await page.getByText('当前演员：测试演员',{exact:true}).waitFor()
 const select=page.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'角色关联演员'})})
 await select.hover();await select.locator('.ant-select-clear').click()
 await page.getByRole('button',{name:'保存演员关联',exact:true}).click()
 await page.getByRole('button',{name:'确认保存关联',exact:true}).click()
 await page.getByText('当前未关联演员',{exact:true}).waitFor();assert.deepEqual(patches.at(-1),{actor_id:null});assert.equal(role.description,'原始角色设定')
 assert.deepEqual(unexpected,[])
 await page.screenshot({path:'local-reports/optional-role-actor.png',fullPage:true})
 console.log('PASS: create without actor, associate, reload, explicitly unlink; association-only payload; zero real writes')
}finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
