/** Development probe restricted to the user's isolated Doubao browser, never an API emulator. */
import { chromium } from './browser-runner/node_modules/playwright/index.mjs'
import { mkdir,readFile,writeFile,unlink } from 'node:fs/promises'
const dir=new URL('../local-browser/',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')
await mkdir(dir,{recursive:true})
const context=await chromium.launchPersistentContext(`${dir}/doubao-default`,{channel:'msedge',headless:false,viewport:{width:1400,height:950},acceptDownloads:true})
const page=context.pages()[0]
const initial=process.env.DOUBAO_INSPECT_URL || 'https://www.doubao.com/chat/'
if(!/^https:\/\/www\.doubao\.com\/chat\/(\d+)?$/.test(initial)) throw new Error('Invalid Doubao conversation URL')
await page.goto(initial,{waitUntil:'domcontentloaded'})
page.on('requestfailed',r=>console.log('NETWORK_FAILURE',new URL(r.url()).hostname,r.failure()?.errorText));
console.log('READY')
while(!page.isClosed()) {
 await new Promise(r=>setTimeout(r,500))
 let cmd
 try {cmd=JSON.parse(await readFile(`${dir}/command.json`,'utf8'));await unlink(`${dir}/command.json`)}catch(e){if(e.code==='ENOENT')continue;throw e}
 try {
 if(cmd.action==='open-result') await page.locator(`[data-message-id="${cmd.message}"] img[alt="image"]`).first().click()
 if(cmd.action==='download') {const download=page.waitForEvent('download',{timeout:30000});await page.getByRole('button',{name:cmd.text,exact:true}).click();const file=await download;await file.saveAs(`${dir}/${cmd.filename}`)}
 if(cmd.action==='image') await page.getByText('图像生成',{exact:true}).first().click()
 if(cmd.action==='upload') await page.locator('input[type=file]').setInputFiles(cmd.path)
 if(cmd.action==='fill') await page.getByRole('textbox').fill(cmd.text)
 if(cmd.action==='submit') await page.getByRole('textbox').press('Enter')
 if(cmd.action==='click') await page.getByText(cmd.text,{exact:true}).last().click()
 if(cmd.action==='close') {await context.close();break}
 await page.waitForTimeout(2000)
 const summary=await page.locator('main').count()?await page.locator('main').innerText():await page.locator('body').innerText()
 await writeFile(`${dir}/probe.txt`,summary)
 await writeFile(`${dir}/probe.html`,await page.content())
 await writeFile(`${dir}/buttons.json`,JSON.stringify(await page.locator('button,[role=button]').evaluateAll(ns=>ns.map(n=>({text:n.innerText,aria:n.getAttribute('aria-label'),title:n.getAttribute('title')}))),null,2))
 await writeFile(`${dir}/media.json`,JSON.stringify(await page.locator('img,video,[data-message-id],[data-msg-id]').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,src:n.currentSrc||n.getAttribute('src'),alt:n.getAttribute('alt'),message:n.getAttribute('data-message-id')||n.getAttribute('data-msg-id'),width:n.naturalWidth,height:n.naturalHeight}))),null,2))
 await page.screenshot({path:`${dir}/probe.png`})
 await writeFile(`${dir}/result.json`,JSON.stringify({id:cmd.id,ok:true,url:page.url()}))
 console.log('DONE',cmd.id)
 }catch(e){await writeFile(`${dir}/result.json`,JSON.stringify({id:cmd.id,ok:false,error:e.message}));console.log('ERROR',cmd.id)}
}
