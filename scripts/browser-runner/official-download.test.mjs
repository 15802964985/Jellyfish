/** Local-only download regression: reused Edge profile, revoked blob, exact bytes and restored hooks. */
import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,unlink} from 'node:fs/promises';import {join} from 'node:path';
import {chromium} from 'playwright';import {captureOfficialDownload} from './official-download.mjs';
const root=await mkdtemp(join(import.meta.dirname,'../../local-browser/download-regression-'));
const html=`<button id="download">下载</button><script>window.originalCreate=URL.createObjectURL;window.originalClick=HTMLAnchorElement.prototype.click;download.onclick=()=>{const blob=new Blob(['original-video-bytes'],{type:'video/mp4'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.download='原视频.mp4';a.href=url;a.click();URL.revokeObjectURL(url)}</script>`;
/** Exercise two clean launches of one isolated account-free profile without external requests. */
test('reused Edge profile preserves revoked official blob downloads without native saveAs',async()=>{
 for(let round=0;round<2;round++){
  const context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'msedge',headless:true,chromiumSandbox:true,acceptDownloads:true});
  try{const page=context.pages()[0];await page.route('**/*',r=>r.request().url()==='https://www.doubao.com/download-fixture'?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto('https://www.doubao.com/download-fixture');
   const output=join(root,`original-${round}.mp4`);await captureOfficialDownload(page,()=>page.locator('#download').click(),output);
   assert.equal(await readFile(output,'utf8'),'original-video-bytes');assert.equal(page.isClosed(),false);
   assert.equal(await page.evaluate(()=>URL.createObjectURL===window.originalCreate&&HTMLAnchorElement.prototype.click===window.originalClick),true);await unlink(output);
   await page.evaluate(()=>{download.onclick=()=>{const a=document.createElement('a');a.download='wrong.mp4';a.href='https://www.doubao.com/not-an-original';a.click()}});
   await assert.rejects(captureOfficialDownload(page,()=>page.locator('#download').click(),output),/Unsupported original download/);
   assert.equal(page.isClosed(),false);
   await page.evaluate(()=>{download.onclick=()=>{const a=document.createElement('a');a.download='large.mp4';a.href=URL.createObjectURL(new Blob([new Uint8Array(10*1024*1024+17).fill(7)],{type:'video/mp4'}));a.click();URL.revokeObjectURL(a.href)}});
   const large=await captureOfficialDownload(page,()=>page.locator('#download').click(),output);
   const bytes=await readFile(output);assert.equal(bytes.length,10*1024*1024+17);
   assert.equal(large.sha256,createHash('sha256').update(Buffer.alloc(bytes.length,7)).digest('hex'));
   assert.equal(await page.evaluate(()=>Object.keys(window).filter(k=>k.startsWith('__jellyfish_')).length),0);await unlink(output);
  }finally{await context.close();}
 }
 console.log('ISOLATED_PROFILE',root);
});
