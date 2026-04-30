import { chromium } from 'playwright'

const LABORUM_URL =
    process.env.LABORUM_JOBS_URL ??
    'https://www.laborum.cl/empleos.html'

async function main() {
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()

    await page.goto(LABORUM_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
    })

    await page.waitForLoadState('networkidle').catch(() => null)
    await page.waitForTimeout(5000)

    const data = await page.$$eval('a[href]', (anchors) => {
        return anchors
            .map((anchor) => {
                const href = anchor.getAttribute('href') ?? ''
                const text = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim()
                const title = (anchor.getAttribute('title') ?? '').trim()
                const ariaLabel = (anchor.getAttribute('aria-label') ?? '').trim()

                const card =
                    anchor.closest('article') ??
                    anchor.closest('li') ??
                    anchor.closest('[class*="card"]') ??
                    anchor.closest('[class*="Card"]') ??
                    anchor.closest('div')

                const cardText = (card?.textContent ?? '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 300)

                return {
                    href,
                    text,
                    title,
                    ariaLabel,
                    cardText,
                }
            })
            .filter((item) => {
                const haystack = `${item.href} ${item.text} ${item.title} ${item.ariaLabel} ${item.cardText}`.toLowerCase()

                return (
                    haystack.includes('empleo') ||
                    haystack.includes('trabajo') ||
                    haystack.includes('job') ||
                    haystack.includes('postular') ||
                    haystack.includes('laborum')
                )
            })
            .slice(0, 40)
    })

    console.log(JSON.stringify(data, null, 2))

    await browser.close()
}

main().catch((error) => {
    console.error('inspect-laborum-links error:', error)
    process.exit(1)
})