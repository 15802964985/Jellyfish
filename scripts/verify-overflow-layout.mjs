/** Read-only studio layout and globally delegated overflow-hint browser regression. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
try {
  await page.route('**/api/**', async route => {
    if (!['GET', 'OPTIONS'].includes(route.request().method()) && !route.request().url().endsWith('/entities/existence-check')) return route.abort()
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: 'http://127.0.0.1:8000' + url.pathname + url.search })
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } })
  })
  await page.goto((process.env.JELLYFISH_TEST_URL || 'http://127.0.0.1:5174') + process.env.JELLYFISH_STUDIO_PATH)
  await page.getByText('分镜生成面板', { exact: true }).waitFor()
  await page.locator('.cs-inspector-tabs').waitFor()
  assert.ok(await page.locator('.cs-inspector-tabs.ant-tabs-top').count())
  // Add transient DOM-only samples to exercise delegation after asynchronous rendering.
  await page.evaluate(() => {
    const host = document.createElement('section')
    host.id = 'overflow-regression'
    host.style.cssText = 'position:fixed;top:100px;left:250px;z-index:9999;background:white;width:200px'
    const long = '这是一段需要完整显示的非常长的名称和描述'.repeat(5)
    host.innerHTML = `<div id="single" style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${long}</div>
      <div id="multi" style="width:120px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${long}</div>
      <div id="short" style="width:120px;overflow:hidden;text-overflow:ellipsis">短名称</div>
      <div id="explicit" title="已有说明" style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${long}</div>
      <input id="secret" type="password" value="private" />`
    document.body.append(host)
  })
  for (const id of ['single', 'multi']) {
    const node = page.locator('#' + id)
    await node.hover()
    assert.equal(await node.getAttribute('title'), await node.innerText())
  }
  await page.locator('#short').hover()
  assert.equal(await page.locator('#short').getAttribute('title'), null)
  assert.equal(await page.locator('#multi').getAttribute('title'), null)
  await page.locator('#explicit').hover()
  assert.equal(await page.locator('#explicit').getAttribute('title'), '已有说明')
  await page.locator('#secret').hover()
  assert.equal(await page.locator('#secret').getAttribute('title'), null)
  await page.evaluate(() => document.querySelector('#overflow-regression').remove())
  // Exercise the real diagnosis cards and long status labels at a narrow inspector width.
  for (const width of [320, 420]) {
    await page.locator('.cs-inspector').evaluate((node, width) => { node.style.width = width + 'px' }, width)
    await page.getByRole('tab', { name: '确认诊断', exact: true }).click()
    await page.locator('.cs-readiness-item').first().waitFor()
    const holder = page.locator('.cs-inspector-tabs > .ant-tabs-content-holder')
    const nav = page.locator('.cs-inspector-tabs > .ant-tabs-nav')
    const before = await nav.boundingBox()
    await holder.evaluate(node => { node.scrollTop = node.scrollHeight })
    assert.equal((await nav.boundingBox()).y, before.y)
    assert.ok(await holder.evaluate(node => node.scrollWidth <= node.clientWidth + 1))
    await page.getByRole('tab', { name: '视频生成', exact: true }).click()
    await page.getByRole('tab', { name: '关键帧与参考图', exact: true }).click()
  }
  await page.getByRole('tab', { name: '确认诊断', exact: true }).click()
  await page.locator('.cs-inspector-tabs > .ant-tabs-content-holder').evaluate(node => { node.scrollTop = 350 })
  await page.screenshot({ path: process.env.TEMP + '/jellyfish-studio-layout.png' })
  console.log('PASS: top inspector navigation; global single/multiline overflow, dynamic DOM, existing title, short text, password and cleanup; no writes forwarded')
} finally {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await browser.close()
}
