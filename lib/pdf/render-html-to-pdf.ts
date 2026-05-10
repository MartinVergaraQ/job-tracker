import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

async function getExecutablePath() {
    if (process.env.VERCEL === '1') {
        return await chromium.executablePath()
    }

    if (process.env.CHROME_EXECUTABLE_PATH) {
        return process.env.CHROME_EXECUTABLE_PATH
    }

    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
}

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
    const executablePath = await getExecutablePath()
    const isVercel = process.env.VERCEL === '1'

    const browser = await puppeteer.launch({
        args: isVercel
            ? chromium.args
            : ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: {
            width: 1200,
            height: 1600,
        },
        executablePath,
        headless: true,
    })

    try {
        const page = await browser.newPage()

        await page.setContent(html, {
            waitUntil: 'networkidle0',
        })

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '14mm',
                right: '14mm',
                bottom: '14mm',
                left: '14mm',
            },
        })

        return pdf
    } finally {
        await browser.close()
    }
}