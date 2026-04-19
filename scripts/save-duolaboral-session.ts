import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const STORAGE_STATE_PATH =
    process.env.DUOLABORAL_STORAGE_STATE_PATH ??
    path.resolve(process.cwd(), 'storage/duolaboral.json')

const LOGIN_URL =
    process.env.DUOLABORAL_LOGIN_URL ??
    'https://duoclaboral.cl/login'

async function ensureDir(filePath: string) {
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
}

async function waitForEnter() {
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    await new Promise<void>((resolve) => {
        process.stdin.once('data', () => resolve())
    })
}

async function main() {
    await ensureDir(STORAGE_STATE_PATH)

    const browser = await chromium.launch({
        headless: false,
        slowMo: 50,
    })

    const context = await browser.newContext()
    const page = await context.newPage()

    console.log(`Abriendo login: ${LOGIN_URL}`)
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })

    console.log('')
    console.log('1) Inicia sesión manualmente en DuoLaboral')
    console.log('2) Cuando ya estés adentro y veas ofertas o tu panel')
    console.log('3) Vuelve a la terminal y presiona ENTER')
    console.log('')

    await waitForEnter()

    await context.storageState({ path: STORAGE_STATE_PATH })

    console.log(`Sesión guardada en: ${STORAGE_STATE_PATH}`)

    await browser.close()
}

main().catch((error) => {
    console.error('save-duolaboral-session error:', error)
    process.exit(1)
})