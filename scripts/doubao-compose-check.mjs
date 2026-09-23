import {chromium} from './browser-runner/node_modules/playwright/index.mjs'
import {resolve} from 'node:path'
const context=await chromium.launchPersistentContext(resolve('local-browser/doubao-default'),{channel:'msedge',headless:false})
try{const page=await context.newPage();await page.goto('https://www.doubao.com/chat/');await page.getByRole('textbox').waitFor();await page.waitForTimeout(2000)
console.log('Before',await page.locator('img[alt="image"]').count());await page.getByText('新对话',{exact:true}).click();await page.waitForTimeout(2000);console.log('After new chat',await page.locator('img[alt="image"]').count())
console.log(await page.locator('img[alt="image"]').first().evaluate(n=>n.parentElement.parentElement.parentElement.outerHTML).catch(()=>''))
console.log(await page.getByText('图像生成',{exact:true}).count());await page.getByText('图像生成',{exact:true}).first().click();await page.waitForTimeout(3000);console.log('Model',await page.getByText('Seedream 4.5',{exact:true}).count())
}finally{await context.close()}