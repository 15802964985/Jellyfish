/** Resume the one authorized image test by immutable remote identity; no submission. */
import {chromium} from './browser-runner/node_modules/playwright/index.mjs'
import {downloadOriginal} from './browser-runner/doubao-images.mjs'
import {readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
const root=new URL('../local-browser/',import.meta.url)
const receipt=JSON.parse(await readFile(new URL('image-test-retry-intent.json',root),'utf8'))
const context=await chromium.launchPersistentContext(fileURLToPath(new URL('doubao-default',root)),{channel:'msedge',headless:false,viewport:{width:1400,height:950},acceptDownloads:true})
try {
 const result=await downloadOriginal(context.pages()[0],receipt,fileURLToPath(new URL('doubao-building-original.png',root)))
 await writeFile(new URL('image-test-original.json',root),JSON.stringify({stage:'original_downloaded',conversation_url:receipt.conversation_url,message_id:receipt.message_id,attempt:receipt.attempt,business_return_verified:false,...result},null,2))
 console.log(JSON.stringify(result))
}finally{await context.close()}
