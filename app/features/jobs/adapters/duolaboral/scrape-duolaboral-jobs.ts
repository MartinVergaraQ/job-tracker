import path from 'node:path'
import { chromium } from 'playwright'
import { parseDuolaboralHtml } from './parse-duolaboral-html'

export type ScrapedJob = {
    external_id: string
    title: string
    company: string
    location: string | null
    modality: string | null
    seniority: string | null
    url: string
    source_name: 'duolaboral'
    published_at: string | null
}

function getStorageStatePath() {
    return (
        process.env.DUOLABORAL_STORAGE_STATE_PATH ??
        path.join(process.cwd(), 'playwright/.auth/duolaboral.json')
    )
}

function getBaseUrl() {
    return (
        process.env.DUOLABORAL_JOBS_URL ??
        'https://duoclaboral.cl/trabajo/trabajos-en-chile'
    )
}

function getMaxPages() {
    const value = Number(process.env.DUOLABORAL_MAX_PAGES ?? 5)
    return Number.isFinite(value) && value > 0 ? value : 5
}

function getSinceDays() {
    const value = Number(process.env.DUOLABORAL_SINCE_DAYS ?? 3)
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

function extractLastPageNumber(html: string) {
    const matches = [...html.matchAll(/page=(\d+)/gi)]
    const pageNumbers = matches
        .map((match) => Number(match[1]))
        .filter((value) => Number.isFinite(value) && value > 0)

    if (!pageNumbers.length) return 1
    return Math.max(...pageNumbers)
}

function isRecentEnough(publishedAt: string | null, sinceDate: Date) {
    if (!publishedAt) return true

    const time = new Date(publishedAt).getTime()
    if (Number.isNaN(time)) return true

    return time >= sinceDate.getTime()
}

function dedupeJobs(jobs: ScrapedJob[]) {
    const map = new Map<string, ScrapedJob>()

    for (const job of jobs) {
        map.set(job.external_id, job)
    }

    return Array.from(map.values())
}

export async function scrapeDuolaboralJobs(): Promise<ScrapedJob[]> {
    const browser = await chromium.launch({
        headless: true,
    })

    const allJobs: ScrapedJob[] = []
    const baseUrl = getBaseUrl()
    const maxPages = getMaxPages()
    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - getSinceDays())

    try {
        const context = await browser.newContext({
            storageState: getStorageStatePath(),
        })

        const page = await context.newPage()

        let detectedLastPage = 1

        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
            const url = buildPageUrl(baseUrl, pageNumber)

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 60_000,
            })

            await page.waitForLoadState('networkidle', {
                timeout: 15_000,
            }).catch(() => {
                // algunas páginas nunca quedan totalmente idle
            })

            const html = await page.content()

            if (pageNumber === 1) {
                detectedLastPage = extractLastPageNumber(html)
            }

            const pageJobs = parseDuolaboralHtml(html)

            console.log(
                `[duolaboral] page=${pageNumber}/${Math.min(detectedLastPage, maxPages)} jobs=${pageJobs.length}`
            )

            if (!pageJobs.length) {
                break
            }

            allJobs.push(...pageJobs)

            const hasRecentJobs = pageJobs.some((job) =>
                isRecentEnough(job.published_at, sinceDate)
            )

            if (!hasRecentJobs) {
                console.log(
                    `[duolaboral] stop: page ${pageNumber} already looks older than ${getSinceDays()} day(s)`
                )
                break
            }

            if (pageNumber >= detectedLastPage) {
                break
            }
        }

        return dedupeJobs(allJobs)
    } finally {
        await browser.close()
    }
}