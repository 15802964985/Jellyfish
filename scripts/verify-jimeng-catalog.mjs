/** Verify the deployed Jimeng service catalogue and category switching without saving any configuration. */
import assert from 'node:assert/strict'
import { chromium } from 'file:///C:/Users/Lenovo/AppData/Local/Temp/jellyfish-browser-check/node_modules/playwright/index.mjs'
const browser = await chromium.launch({channel:'msedge',headless:true})
const page = await browser.newPage({viewport:{width:1440,height:1000}})
let writes=0
try {
  await page.route('**/api/**', async route => {
    if (!['GET','OPTIONS'].includes(route.request().method())) { writes++; return route.abort() }
    return route.continue()
  })
  await page.goto('http://127.0.0.1:7788/models')
  await page.getByRole('tab',{name:'模型',exact:true}).click()
  await page.locator('button').filter({hasText:'添加模型'}).click()
  const dialog=page.getByRole('dialog')
  await dialog.locator('#provider_id').click()
  await page.locator('.ant-select-dropdown:not(.ant-slide-up-leave):visible .ant-select-item-option').filter({hasText:'即梦'}).click()
  await dialog.locator('.ant-select').filter({has:page.locator('#category')}).locator('.ant-select-selector').click()
  await page.locator('.ant-select-dropdown:not(.ant-slide-up-leave):visible').getByText('图片生成',{exact:true}).click()
  await dialog.locator('#names').click()
  await page.locator('.ant-select-dropdown:not(.ant-slide-up-leave):visible .ant-select-item-option-content').filter({hasText:/^即梦AI-图片生成3.0/}).waitFor()
  const text=await page.locator('.ant-select-dropdown:not(.ant-slide-up-leave):visible').innerText()
  assert.ok(text.includes('即梦AI-图片生成4.0'))
  assert.ok(!text.includes('t2i_v40_jimeng') && !text.includes('即梦AI-视频生成3.0'))
  await page.locator('.ant-select-dropdown:not(.ant-slide-up-leave):visible .ant-select-item-option-content').filter({hasText:/^即梦AI-图片生成3.0/}).click()
  await dialog.getByText('先选择已开通的服务版本',{exact:true}).click()
  await dialog.locator('.ant-select').filter({has:page.locator('#category')}).locator('.ant-select-selector').click()
  await page.locator('.ant-select-dropdown:not(.ant-slide-up-leave):visible').getByText('视频生成',{exact:true}).click()
  assert.equal(await dialog.locator('.ant-select-selection-item').filter({hasText:'即梦AI-图片生成3.0'}).count(),0)
  await dialog.locator('#names').click()
  await page.locator('.ant-select-dropdown:not(.ant-slide-up-leave):visible .ant-select-item-option-content').filter({hasText:/^即梦AI-视频生成3.0/}).waitFor()
  assert.ok(!(await page.locator('.ant-select-dropdown:not(.ant-slide-up-leave):visible').innerText()).includes('即梦AI-图片生成3.0'))
  assert.equal(writes,0)
  console.log('PASS: production catalogue, image/video family filtering, stale selection cleared, no saved configuration or paid calls')
} finally { await browser.close() }
