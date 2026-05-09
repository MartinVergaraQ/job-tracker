import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

async function getExecutablePath() {
    if (process.env.VERCEL === '1') {
        return chromium.executablePath()
    }

    if (process.env.CHROME_EXECUTABLE_PATH) {
        return process.env.CHROME_EXECUTABLE_PATH
    }

    const possibleWindowsPaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]

    return possibleWindowsPaths[0]
}

export async function renderHtmlToPdf(html: string) {
    const executablePath = await getExecutablePath()

    const browser = await puppeteer.launch({
        args:
            process.env.VERCEL === '1'
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