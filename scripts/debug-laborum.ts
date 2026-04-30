import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const LABORUM_URL =
    process.env.LABORUM_JOBS_URL ??
    'https://www.laborum.cl/empleos.html'

async function ensureDir(filePath: string) {
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
}

async function main() {
    const htmlPath = path.resolve(process.cwd(), 'tmp/laborum-debug.html')
    const screenshotPath = path.resolve(process.cwd(), 'tmp/laborum-debug.png')

    await ensureDir(htmlPath)
    await ensureDir(screenshotPath)

    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()

    await page.goto(LABORUM_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
    })

    await page.waitForLoadState('networkidle').catch(() => null)
    await page.waitForTimeout(5000)

    const pageUrl = page.url()
    const pageTitle = await page.title()
    const html = await page.content()

    const anchors = await page.locator('a[href]').count()

    const possibleJobLinks = await page
        .locator('a[href*="empleo"], a[href*="trabajo"], a[href*="job"]')
        .count()

    await fs.writeFile(htmlPath, html, 'utf8')
    await page.screenshot({ path: screenshotPath, fullPage: true })

    console.log('URL final:', pageUrl)
    console.log('Título:', pageTitle)
    console.log('Total anchors:', anchors)
    console.log('Possible job links:', possibleJobLinks)
    console.log('HTML guardado en:', htmlPath)
    console.log('Screenshot guardado en:', screenshotPath)

    await browser.close()
}

main().catch((error) => {
    console.error('debug-laborum error:', error)
    process.exit(1)
})