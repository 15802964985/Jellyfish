/** Real application routes and read-only production data; every write remains intercepted. */
import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true}),base=process.env.MANUAL_MEDIA_URL||'http://127.0.0.1:18792';const errors=[],scopes=[],blocked=[],checks=[];
try{const page=await browser.newPage({viewport:{width:1550,height:1000}});page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('jellyfish_chapter_studio_layout_v1',JSON.stringify({inspectorOpen:true,inspectorMode:'push',rightWidth:460})));
await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(req.method()!=='GET'){blocked.push(url.pathname);return route.abort();}
if(url.pathname.endsWith('/manual-selection')){scopes.push(Object.fromEntries(url.searchParams));if(!process.env.MANUAL_MEDIA_LIVE)return route.fulfill({json:{data:{file_id:null,version:4,slot_id:Number(url.searchParams.get('slot_id'))||null}}});}
const response=await route.fetch({url:'http://127.0.0.1:8000'+url.pathname+url.search});
if(/\/shot-links\/(prop|costume)$/.test(url.pathname)){const json=await response.json();if(!json.data?.items?.length){const kind=url.pathname.split('/').at(-1),assets=await(await fetch('http://127.0.0.1:8000/api/v1/studio/entities/'+kind+'?page_size=1')).json();const asset=assets.data?.items?.[0];if(asset){json.data={items:[{id:-901,[kind+'_id']:asset.id,project_id:url.searchParams.get('project_id')}],pagination:{page:1,page_size:10,total:1,total_pages:1}};checks.push('隔离补充空项目'+kind+'关系')}}return route.fulfill({json});}
return route.fulfill({response});});
/** Verify this route exposes both independent local source actions without a model request. */
async function check(name,noun='图片'){
 await page.getByRole('button',{name:'修改'+noun,exact:true}).first().click();await page.getByRole('button',{name:'从文件管理选择',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('上传素材')&&!b.disabled));assert.ok(await page.getByRole('button',{name:'上传素材',exact:true}).isEnabled());
 await page.getByRole('button',{name:'从文件管理选择',exact:true}).click();await page.getByRole('dialog').filter({hasText:'从文件管理选择'+noun}).waitFor();await page.getByRole('dialog').filter({hasText:'从文件管理选择'+noun}).locator('.ant-modal-close').click();await page.locator('.ant-modal:visible .ant-modal-footer button').first().click();checks.push(name);
}
await page.goto(base+'/assets');await check('资产管理');
await page.goto(base+'/assets/props/asset_1789567384208/edit');await page.getByText('多镜头图片',{exact:true}).click();await check('资产详情角度槽位');
const project='/projects/d2b997cc-7522-4a0f-9520-6cf4d609d0fb';
for(const [tab,label] of [['roles','角色'],['actors','演员'],['scenes','场景'],['props','道具'],['costumes','服装']]){
 await page.goto(base+project+'?tab='+tab);await check('项目工作台'+label);
}
await page.goto(base+project+'/chapters/32c0cd76-10e5-454f-b795-a8dfb0068a05/studio');await page.waitForTimeout(1600);await page.getByRole('tab',{name:'关键帧与参考图',exact:true}).click();await check('分镜工作室帧图');await page.getByRole('tab',{name:'视频生成',exact:true}).click();await check('分镜工作室视频','视频');
assert.deepEqual(errors,[]);assert.ok(scopes.some(s=>s.target_type==='frame'));assert.ok(scopes.some(s=>s.target_type==='shot'));fs.writeFileSync('local-reports/manual-media-20260923/pages'+(process.env.MANUAL_MEDIA_LIVE?'-live':'')+'.json',JSON.stringify({checks,scopes,errors,blocked,real_writes:0},null,2));console.log('MANUAL_MEDIA_PAGES_OK '+checks.length);
}catch(error){for(const c of browser.contexts())for(const p of c.pages())console.log((await p.locator('body').innerText()).slice(-3500));throw error}finally{for(const c of browser.contexts())for(const p of c.pages())await p.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
