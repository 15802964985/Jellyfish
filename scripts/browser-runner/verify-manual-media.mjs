/** All writes fulfilled locally: upload, adoption, conflict and identity-switch regression. */
import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true}),base='http://127.0.0.1:18792';const errors=[],posts=[],results=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNkYPjPwMDAxAAGAAsfAQMU4wsAAAAAAElFTkSuQmCC','base64');
try{for(const kind of ['actor','character','scene','prop','costume','frame','shot']){
 const video=kind==='shot',noun=video?'视频':'图片';let version=4,current=null,fail=false;
 const page=await browser.newPage({viewport:{width:540,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/src/components/__fixtures__/ManualMediaCheck.tsx"></script>'});
 if(url.pathname.startsWith('/api/')){
 let data={};const file={id:'library',type:video?'video':'image',name:'测试素材',original_name:video?'test.mp4':'test.png'};
 if(url.pathname.endsWith('/manual-selection')){
 if(req.method()==='GET')data={version,file_id:current,slot_id:video?null:7};else{const body=req.postDataJSON();posts.push(body);assert.equal(body.target_type,kind);assert.equal(body.entity_id,'a');assert.equal(body.expected_version,version);if(fail)return route.fulfill({status:409,json:{detail:'当前图片或视频已变化，请重新打开并确认后采用'}});version++;current=body.file_id;data={version,file_id:current,slot_id:video?null:7};}
 }else if(url.pathname.endsWith('/files/upload')){assert.equal(req.method(),'POST');data={...file,id:'uploaded',name:'上传素材'};}
 else if(url.pathname.endsWith('/files')){assert.equal(url.searchParams.get('file_type'),video?'video':'image');data={items:[file],pagination:{total:1,page:1,page_size:8}};}
 else if(url.pathname.includes('/files/'))return route.fulfill({contentType:'image/png',body:png});
 else throw Error('Unexpected '+url.pathname);
 return route.fulfill({json:{data}});
 }if(url.origin===base)return route.continue();return route.abort();});
 await page.goto(base+'/fixture?kind='+kind);await page.getByRole('button',{name:'修改'+noun,exact:true}).click();
 await page.getByRole('button',{name:'从文件管理选择',exact:true}).click();await page.getByRole('button',{name:'选择此'+noun,exact:true}).click();assert.equal(posts.length,results.length*2);
 const bounds=await page.getByRole('dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=540);
 await page.getByRole('button',{name:'确认采用'+noun,exact:true}).click();await page.getByText('刷新次数：1').waitFor();
 await page.getByRole('button',{name:'修改'+noun,exact:true}).click();await page.getByRole('button',{name:'上传素材',exact:true}).waitFor();
 await page.getByLabel('上传'+noun,{exact:true}).setInputFiles({name:video?'upload.mp4':'upload.png',mimeType:video?'video/mp4':'image/png',buffer:png});
 await page.getByRole('button',{name:'确认采用'+noun,exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('确认采用')&&!b.disabled));fail=true;
 await page.getByRole('button',{name:'确认采用'+noun,exact:true}).click();await page.getByText('当前图片或视频已变化，请重新打开并确认后采用',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'确认采用'+noun,exact:true}).isDisabled());
 // Switching business identity must destroy the old confirmation and never adopt its file.
 await page.locator('.ant-modal-footer button').first().click();await page.getByRole('button',{name:'切换对象',exact:true}).click();await page.getByRole('button',{name:'修改'+noun,exact:true}).click();assert.ok(await page.getByRole('button',{name:'确认采用'+noun,exact:true}).isDisabled());
 results.push({kind,library:true,upload_preview:true,conflict:true,identity_switch:true,mobile:true});await page.close();}
 assert.deepEqual(errors,[]);fs.writeFileSync('local-reports/manual-media-20260923/component-ui.json',JSON.stringify({results,errors,real_writes:0},null,2));console.log('MANUAL_MEDIA_UI_OK '+results.length);
}finally{await browser.close()}
