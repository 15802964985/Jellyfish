/** Inspect only the dedicated Doubao profile; no prompts or generation submitted. */
import { chromium } from './browser-runner/node_modules/playwright/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../local-browser/', import.meta.url)
await mkdir(root,{recursive:true})
const context=await chromium.launchPersistentContext(fileURLToPath(new URL('doubao-default/',root)),{channel:'msedge',headless:false,viewport:{width:1400,height:950}})
try {
const page=context.pages()[0]||await context.newPage()
await page.goto('https://www.doubao.com/chat/',{waitUntil:'domcontentloaded',timeout:60000})
await page.waitForTimeout(5000)
if(process.argv.includes('--image')) {await page.getByText('图像生成',{exact:true}).first().click();await page.waitForTimeout(2500)}
await writeFile(new URL('page.txt',root),await page.locator('body').innerText(),'utf8')
await writeFile(new URL('dom.json',root),JSON.stringify(await page.locator('input,textarea,button,[contenteditable],[data-testid]').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,type:n.getAttribute('type'),role:n.getAttribute('role'),testid:n.getAttribute('data-testid'),placeholder:n.getAttribute('placeholder'),aria:n.getAttribute('aria-label'),text:n.innerText?.slice(0,100)}))),null,2),'utf8')
await page.screenshot({path:fileURLToPath(new URL('image-page.png',root))}); console.log(await page.getByRole('textbox').evaluate(n=>n.parentElement.parentElement.outerHTML))
} finally {await context.close()}
