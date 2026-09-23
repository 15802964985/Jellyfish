/** Read-only browser regression: edit dependencies clear stale names; no configuration is saved. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const modulePath = process.env.PLAYWRIGHT_MODULE
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE to the installed playwright/index.mjs absolute path')
const { chromium } = await import(pathToFileURL(modulePath).href)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
let writes = 0
try {
  await page.route('**/api/**', async route => {
    if (!['GET', 'OPTIONS'].includes(route.request().method())) {
      writes += 1
      return route.abort()
    }
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: 'http://127.0.0.1:8000' + url.pathname + url.search })
    return route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } })
  })
  await page.goto((process.env.JELLYFISH_TEST_URL || 'http://127.0.0.1:7788') + '/models')
  await page.getByRole('tab', { name: '模型', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: 'wan2.7-image-pro' })
  await row.getByRole('button').first().click()
  const dialog = page.getByRole('dialog')
  assert.equal(await dialog.locator('#name').inputValue(), 'wan2.7-image-pro')
  await dialog.locator('.ant-select').filter({ has: page.locator('#category') }).locator('.ant-select-selector').click()
  await page.locator('.ant-select-dropdown:visible').getByText('视频生成', { exact: true }).click()
  assert.equal(await dialog.locator('#name').inputValue(), '')
  await dialog.locator('#name').fill('temporary-unsaved-name')
  await dialog.locator('.ant-select').filter({ has: page.locator('#provider_id') }).locator('.ant-select-selector').click()
  await page.locator('.ant-select-dropdown:visible').getByText('火山引擎', { exact: true }).click()
  assert.equal(await dialog.locator('#name').inputValue(), '')
  assert.equal(await dialog.locator('#category').inputValue(), '')
  await dialog.locator('.ant-select').filter({ has: page.locator('#category') }).locator('.ant-select-selector').click()
  await page.locator('.ant-select-dropdown:visible').getByText('视频生成', { exact: true }).click()
  await dialog.locator('#name').click()
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: /^doubao-seedance-1[.]5-pro$/ }).waitFor({ timeout: 45000 })
  assert.equal(await page.locator('.ant-select-dropdown:visible').getByText('happyhorse-1.1-i2v', { exact: true }).count(), 0)
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: /^doubao-seedance-1[.]5-pro$/ }).click()
  assert.equal(await dialog.locator('#name').inputValue(), 'doubao-seedance-1.5-pro')
  await dialog.getByRole('button', { name: '取 消' }).click()
  assert.equal(writes, 0)
  console.log('PASS: retained initial name; category/provider cleared stale names; catalogue matches provider/category; zero writes.')
} finally {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await browser.close()
}
