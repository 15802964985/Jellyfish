/** Verify preparation DOM without submitting a generation. */
import {chromium} from './browser-runner/node_modules/playwright/index.mjs'
import {doubaoImageAdapter} from './browser-runner/doubao-adapter.mjs'
import {writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const context=await chromium.launchPersistentContext(resolve('local-browser/doubao-default'),{channel:'msedge',headless:false})
try{const page=context.pages()[0];await doubaoImageAdapter(page,[resolve('local-browser/building-reference.png')],'unused').prepare({requested_model:'Seedream 4.5',prompt:'楼房参考图准备验证（未提交）'})
await page.waitForTimeout(3000)
await writeFile('local-browser/prepared.html',await page.content())
console.log(await page.locator('body').innerText())
}finally{await context.close()}