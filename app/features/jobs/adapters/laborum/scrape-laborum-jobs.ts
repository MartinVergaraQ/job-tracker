import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { parseLaborumHtml, type ParsedLaborumJob } from './parse-laborum-html'

function getBaseUrl() {
    return (
        process.env.LABORUM_JOBS_URL ??
        'https://www.laborum.cl/empleos.html'
    )
}

function getMaxPages() {
    const value = Number(process.env.LABORUM_MAX_PAGES ?? 3)
    return Number.isFinite(value) && value > 0 ? value : 3
}

function buildPageUrl(baseUrl: string, pageNumber: number) {
    const url = new URL(baseUrl)

    if (pageNumber <= 1) {
        url.searchParams.delete('page')
    } else {
        url.searchParams.set('page', String(pageNumber))
    }

    return url.toString()
}

function dedupeJobs(jobs: ParsedLaborumJob[]) {
    const map = new Map<string, ParsedLaborumJob>()

    for (const job of jobs) {
        map.set(job.external_id, job)
    }

    return Array.from(map.values())
}

async function saveDebugArtifacts(params: {
    html: string
    pageUrl: string
    pageTitle: string
    screenshotBuffer: Buffer
    label: string
}) {
    const dir = path.join(process.cwd(), 'tmp')
    await fs.mkdir(dir, { recursive: true })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const baseName = `laborum-${params.label}-${stamp}`

    await fs.writeFile(path.join(dir, `${baseName}.html`), params.html, 'utf8')
    await fs.writeFile(path.join(dir, `${baseName}.png`), params.screenshotBuffer)

    console.log('[laborum][debug]', {
        label: params.label,
        pageUrl: params.pageUrl,
        pageTitle: params.pageTitle,
        savedAs: baseName,
    })
}

export async function scrapeLaborumJobs(): Promise<ParsedLaborumJob[]> {
    const browser = await chromium.launch({
        headless: true,
    })

    const allJobs: ParsedLaborumJob[] = []
    const baseUrl = getBaseUrl()
    const maxPages = getMaxPages()

    try {
        const page = await browser.newPage()

        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
            const url = buildPageUrl(baseUrl, pageNumber)

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 60_000,
            })

            await page.waitForLoadState('networkidle', {
                timeout: 15_000,
            }).catch(() => null)

            await page.waitForTimeout(4000)

            await page
                .waitForSelector('a[href*="/empleos/"]', {
                    timeout: 10000,
                })
                .catch(() => null)

            const html = await page.content()
            const pageUrl = page.url()
            const pageTitle = await page.title()
            const possibleJobLinks = await page
                .locator('a[href*="/empleos/"]')
                .count()

            const blockedByCloudflare =
                pageTitle.toLowerCase().includes('attention required') ||
                pageTitle.toLowerCase().includes('cloudflare')

            if (blockedByCloudflare) {
                const screenshotBuffer = await page.screenshot({ fullPage: true })

                await saveDebugArtifacts({
                    html,
                    pageUrl,
                    pageTitle,
                    screenshotBuffer,
                    label: `cloudflare-page-${pageNumber}`,
                })

                throw new Error('Laborum blocked by Cloudflare')
            }

            const pageJobs = parseLaborumHtml(html)

            console.log('[laborum]', {
                page: pageNumber,
                pageUrl,
                pageTitle,
                possibleJobLinks,
                parsedJobs: pageJobs.length,
            })

            if (!pageJobs.length) {
                const screenshotBuffer = await page.screenshot({ fullPage: true })
                await saveDebugArtifacts({
                    html,
                    pageUrl,
                    pageTitle,
                    screenshotBuffer,
                    label: `zero-results-page-${pageNumber}`,
                })
                break
            }

            allJobs.push(...pageJobs)
        }

        return dedupeJobs(allJobs)
    } finally {
        await browser.close()
    }
}