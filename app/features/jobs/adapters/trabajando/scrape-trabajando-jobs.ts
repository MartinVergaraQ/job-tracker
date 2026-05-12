import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import {
    parseTrabajandoHtml,
    type ParsedTrabajandoJob,
} from './parse-trabajando-html'

function getBaseUrl() {
    return process.env.TRABAJANDO_JOBS_URL ?? 'https://www.trabajando.cl'
}

function getSearchPath() {
    return (
        process.env.TRABAJANDO_SEARCH_PATH ??
        '/trabajos/empleos-publicacion?palabra=desarrollador'
    )
}

function getMaxPages() {
    const value = Number(process.env.TRABAJANDO_MAX_PAGES ?? 2)
    return Number.isFinite(value) && value > 0 ? value : 2
}

function buildPageUrl(baseUrl: string, searchPath: string, pageNumber: number) {
    const url = new URL(searchPath, baseUrl)

    if (pageNumber <= 1) {
        url.searchParams.delete('page')
    } else {
        url.searchParams.set('page', String(pageNumber))
    }

    return url.toString()
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
    const baseName = `trabajando-${params.label}-${stamp}`

    await fs.writeFile(path.join(dir, `${baseName}.html`), params.html, 'utf8')
    await fs.writeFile(path.join(dir, `${baseName}.png`), params.screenshotBuffer)

    console.log('[trabajando][debug]', {
        label: params.label,
        pageUrl: params.pageUrl,
        pageTitle: params.pageTitle,
        savedAs: baseName,
    })
}

function dedupeJobs(jobs: ParsedTrabajandoJob[]) {
    const map = new Map<string, ParsedTrabajandoJob>()

    for (const job of jobs) {
        map.set(job.external_id, job)
    }

    return Array.from(map.values())
}

export async function scrapeTrabajandoJobs(): Promise<ParsedTrabajandoJob[]> {
    const browser = await chromium.launch({
        headless: true,
    })

    const allJobs: ParsedTrabajandoJob[] = []
    const baseUrl = getBaseUrl()
    const searchPath = getSearchPath()
    const maxPages = getMaxPages()

    try {
        const page = await browser.newPage({
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 900 },
        })

        let emptyPagesInRow = 0

        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
            const url = buildPageUrl(baseUrl, searchPath, pageNumber)

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 60_000,
            })

            await page.waitForLoadState('networkidle', {
                timeout: 15_000,
            }).catch(() => null)

            await page.waitForTimeout(3000)

            const html = await page.content()
            const pageUrl = page.url()
            const pageTitle = await page.title()

            const blocked =
                pageTitle.toLowerCase().includes('attention required') ||
                pageTitle.toLowerCase().includes('cloudflare') ||
                html.toLowerCase().includes('captcha')

            if (blocked) {
                const screenshotBuffer = await page.screenshot({ fullPage: true })

                await saveDebugArtifacts({
                    html,
                    pageUrl,
                    pageTitle,
                    screenshotBuffer,
                    label: `blocked-page-${pageNumber}`,
                })

                throw new Error('Trabajando blocked by anti-bot/captcha')
            }

            const pageJobs = parseTrabajandoHtml(html, baseUrl)

            console.log('[trabajando]', {
                page: pageNumber,
                pageUrl,
                pageTitle,
                parsedJobs: pageJobs.length,
            })

            if (!pageJobs.length) {
                emptyPagesInRow += 1

                const screenshotBuffer = await page.screenshot({ fullPage: true })

                await saveDebugArtifacts({
                    html,
                    pageUrl,
                    pageTitle,
                    screenshotBuffer,
                    label: `zero-results-page-${pageNumber}`,
                })

                if (emptyPagesInRow >= 2) {
                    break
                }

                continue
            }

            emptyPagesInRow = 0
            allJobs.push(...pageJobs)
        }

        return dedupeJobs(allJobs)
    } finally {
        await browser.close()
    }
}