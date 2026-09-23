/** 浏览器验证图片细节预览、选择隔离和弹窗层级；不调用付费生成或写业务数据。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:960}})
page.on('pageerror',error=>console.error(error.message))
const base=process.env.JELLYFISH_TEST_URL || 'http://127.0.0.1:5174'
try {
 if (process.env.PREVIEW_FIXTURE === '1') {
  await page.route('**/preview-test',route=>route.fulfill({contentType:'text/html',body:`<meta charset="UTF-8"><div id="root"></div><script type="module">
   import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
   import React from '/node_modules/.vite/deps/react.js';
   import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
   const {PreviewImage}=await import('/src/components/PreviewImage.tsx');
   import {Modal} from '/node_modules/.vite/deps/antd.js';
   window.selected=0;
   const url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><rect width="1800" height="1200" fill="teal"/><text x="200" y="400" font-size="100">IMAGE DETAILS</text></svg>');
   ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Modal,{open:true,title:'选择素材',footer:null},React.createElement('button',{onClick:()=>window.selected++},React.createElement(PreviewImage,{src:url,alt:'生成图片',style:{width:200,height:150}}),React.createElement('span',null,'选择此图片'))));
  </script>`}))
  await page.goto(base+'/preview-test')
 } else {
  await page.route('**/api/**',route=>['GET','OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort())
  await page.goto(base+(process.env.JELLYFISH_IMAGE_PATH || '/assets'))
 }
 const trigger=page.locator('img[aria-label^="放大预览："]:visible').first()
 await trigger.waitFor({timeout:30000})
 await trigger.click()
 const preview=page.locator('.ant-image-preview-wrap:visible')
 await preview.waitFor()
 const img=preview.locator('.ant-image-preview-img')
 await img.waitFor()
 const before=await img.getAttribute('style')
 await page.locator('.ant-image-preview-operations-operation-zoomIn:visible').click()
 await page.waitForTimeout(300)
 assert.notEqual(await img.getAttribute('style'),before)
 await page.locator('.ant-image-preview-operations-operation-rotateRight:visible').click()
 await page.locator('.ant-image-preview-close:visible').click()
 await preview.waitFor({state:'hidden'})
 if(process.env.PREVIEW_FIXTURE === '1') {
  assert.equal(await page.evaluate(()=>window.selected),0)
  assert.equal(await page.getByText('选择素材',{exact:true}).isVisible(),true)
  await trigger.focus();await page.keyboard.press('Enter');await preview.waitFor()
  await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(()=>window.selected),0)
  await page.getByText('选择此图片',{exact:true}).click()
  assert.equal(await page.evaluate(()=>window.selected),1)
 }
 console.log('PASS: image click opens preview; zoom/rotation/close work; preview does not select image; keyboard and nested modal checked in fixture; no business writes')
} finally {await browser.close()}
