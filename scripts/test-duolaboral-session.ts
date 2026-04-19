import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const STORAGE_STATE_PATH =
    process.env.DUOLABORAL_STORAGE_STATE_PATH ??
    path.resolve(process.cwd(), 'storage/duolaboral.json')

const LIST_URL =
    process.env.DUOLABORAL_LIST_URL ??
    'https://duoclaboral.cl/trabajo/trabajos-en-chile'

const OUTPUT_HTML =
    process.env.DUOLABORAL_OUTPUT_HTML ??
    path.resolve(process.cwd(), 'tmp/duolaboral-list.html')

const OUTPUT_SCREENSHOT =
    process.env.DUOLABORAL_OUTPUT_SCREENSHOT ??
    path.resolve(process.cwd(), 'tmp/duolaboral-list.png')

async function ensureDir(filePath: string) {
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
}

async function main() {
    await ensureDir(OUTPUT_HTML)
    await ensureDir(OUTPUT_SCREENSHOT)

    const browser = await chromium.launch({
        headless: false,
    })

    const context = await browser.newContext({
        storageState: STORAGE_STATE_PATH,
    })

    const page = await context.newPage()

    await page.goto(LIST_URL, { waitUntil: 'networkidle' })

    const currentUrl = page.url()
    const title = await page.title()
    const html = await page.content()

    await fs.writeFile(OUTPUT_HTML, html, 'utf8')
    await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true })

    console.log('URL final:', currentUrl)
    console.log('Título:', title)
    console.log('HTML guardado en:', OUTPUT_HTML)
    console.log('Screenshot guardado en:', OUTPUT_SCREENSHOT)

    if (currentUrl.includes('/login')) {
        console.error('La sesión no funcionó: te redirigió otra vez al login.')
        process.exitCode = 1
    }

    await browser.close()
}

main().catch((error) => {
    console.error('test-duolaboral-session error:', error)
    process.exit(1)
})