import crypto from 'node:crypto'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import * as cheerio from 'cheerio'
import type { NormalizedJob } from '../types/job'

type ComputrabajoEmailJob = {
    external_id: string
    url: string
    title: string
    company: string
    location: string | null
    description: string | null
    published_at: string | null
}

function requireEnv(name: string) {
    const value = process.env[name]

    if (!value || !value.trim()) {
        throw new Error(`Missing ${name}`)
    }

    return value.trim()
}

function getNumberEnv(name: string, defaultValue: number) {
    const value = Number(process.env[name])

    if (!Number.isFinite(value) || value <= 0) {
        return defaultValue
    }

    return value
}

function getBooleanEnv(name: string, defaultValue: boolean) {
    const value = process.env[name]

    if (value == null) return defaultValue

    return value.toLowerCase() === 'true'
}

function normalizeText(value: string | null | undefined) {
    return (value ?? '').replace(/\s+/g, ' ').trim()
}

function createHash(value: string) {
    return crypto.createHash('sha1').update(value).digest('hex')
}

function isComputrabajoSender(value: string) {
    const text = value.toLowerCase()

    return (
        text.includes('computrabajo') ||
        text.includes('trabajos_cl@computrabajo.com')
    )
}

function cleanComputrabajoUrl(rawUrl: string) {
    try {
        const url = new URL(rawUrl)

        /**
         * Algunos emails vienen con redirecciones/tracking.
         * Si aparece una URL interna como parámetro, intentamos rescatarla.
         */
        const possibleUrlParams = ['url', 'u', 'target', 'redirect', 'link']

        for (const param of possibleUrlParams) {
            const value = url.searchParams.get(param)

            if (value && value.includes('computrabajo')) {
                return decodeURIComponent(value)
            }
        }

        return url.toString()
    } catch {
        return rawUrl
    }
}

function isComputrabajoJobUrl(rawUrl: string) {
    const url = rawUrl.toLowerCase()

    return (
        url.includes('computrabajo') &&
        (
            url.includes('/ofertas-de-trabajo/') ||
            url.includes('/empleos/') ||
            url.includes('/trabajo-de-') ||
            url.includes('/oferta-de-trabajo')
        )
    )
}

function looksLikeJobTitle(value: string) {
    const text = normalizeText(value)
    const lower = text.toLowerCase()

    if (text.length < 6) return false
    if (text.length > 180) return false

    const badLabels = [
        'ver oferta',
        'ver empleo',
        'postular',
        'postúlate',
        'postulate',
        'ver más',
        'ver mas',
        'haz clic',
        'click aquí',
        'click aqui',
        'computrabajo',
        'cancelar suscripción',
        'darse de baja',
        'unsubscribe',
        'privacidad',
        'preferencias',
    ]

    return !badLabels.some((label) => lower.includes(label))
}

function inferLocation(subject: string, text: string): string | null {
    const haystack = `${subject} ${text}`.toLowerCase()

    if (
        haystack.includes('r.metropolitana') ||
        haystack.includes('región metropolitana') ||
        haystack.includes('region metropolitana') ||
        haystack.includes('santiago')
    ) {
        return 'Región Metropolitana, Chile'
    }

    if (haystack.includes('chile')) {
        return 'Chile'
    }

    return null
}

function extractTechTags(value: string) {
    const text = value.toLowerCase()

    const tags = [
        'javascript',
        'typescript',
        'react',
        'next.js',
        'nextjs',
        'node',
        'node.js',
        'php',
        'laravel',
        'sql',
        'postgres',
        'mysql',
        'mongodb',
        'api',
        'backend',
        'frontend',
        'full stack',
        'fullstack',
        'qa',
        'soporte',
        'analista',
        'informática',
        'informatica',
    ]

    return tags.filter((tag) => text.includes(tag))
}

function extractJobsFromHtml(params: {
    html: string
    subject: string
    date: Date | null
}) {
    const $ = cheerio.load(params.html)
    const jobs: ComputrabajoEmailJob[] = []
    const seen = new Set<string>()

    $('a[href]').each((_, element) => {
        const href = normalizeText($(element).attr('href'))
        const text = normalizeText($(element).text())

        if (!href) return

        const url = cleanComputrabajoUrl(href)

        if (!isComputrabajoJobUrl(url)) return
        if (!looksLikeJobTitle(text)) return

        const key = url

        if (seen.has(key)) return
        seen.add(key)

        jobs.push({
            external_id: `computrabajo-email:${createHash(url)}`,
            url,
            title: text,
            company: 'Computrabajo',
            location: inferLocation(params.subject, text),
            description: params.subject,
            published_at: params.date?.toISOString() ?? null,
        })
    })

    return jobs
}

function extractJobsFromText(params: {
    text: string
    subject: string
    date: Date | null
}) {
    const jobs: ComputrabajoEmailJob[] = []
    const seen = new Set<string>()

    const urlMatches = params.text.match(/https?:\/\/[^\s<>"')]+/gi) ?? []

    for (const rawUrl of urlMatches) {
        const url = cleanComputrabajoUrl(rawUrl)

        if (!isComputrabajoJobUrl(url)) continue
        if (seen.has(url)) continue

        seen.add(url)

        jobs.push({
            external_id: `computrabajo-email:${createHash(url)}`,
            url,
            title: normalizeText(params.subject) || 'Oferta Computrabajo',
            company: 'Computrabajo',
            location: inferLocation(params.subject, params.text),
            description: params.subject,
            published_at: params.date?.toISOString() ?? null,
        })
    }

    return jobs
}

async function fetchComputrabajoEmailJobs() {
    const host = requireEnv('GMAIL_IMAP_HOST')
    const port = getNumberEnv('GMAIL_IMAP_PORT', 993)
    const secure = getBooleanEnv('GMAIL_IMAP_SECURE', true)
    const user = requireEnv('GMAIL_IMAP_USER')
    const pass = requireEnv('GMAIL_IMAP_PASSWORD')

    const sinceDays = getNumberEnv('COMPUTRABAJO_EMAIL_SINCE_DAYS', 7)
    const maxMessages = getNumberEnv('COMPUTRABAJO_EMAIL_MAX_MESSAGES', 80)

    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - sinceDays)

    const client = new ImapFlow({
        host,
        port,
        secure,
        auth: {
            user,
            pass,
        },
    })

    const jobs: ComputrabajoEmailJob[] = []

    await client.connect()

    try {
        const lock = await client.getMailboxLock('INBOX')

        try {
            const searchResult = await client.search(
                {
                    since: sinceDate,
                },
                {
                    uid: true,
                }
            )

            const uids = Array.isArray(searchResult) ? searchResult : []
            const recentUids = uids.slice(-maxMessages).reverse()

            for await (const message of client.fetch(
                recentUids,
                {
                    envelope: true,
                    source: true,
                    internalDate: true,
                },
                {
                    uid: true,
                }
            )) {
                const from = normalizeText(
                    message.envelope?.from
                        ?.map((item) => `${item.name ?? ''} ${item.address ?? ''}`)
                        .join(' ')
                )

                const subject = normalizeText(message.envelope?.subject)
                const internalDate =
                    message.internalDate instanceof Date
                        ? message.internalDate
                        : null

                if (!isComputrabajoSender(from) && !subject.toLowerCase().includes('computrabajo')) {
                    continue
                }

                if (!message.source) continue

                const parsed = await simpleParser(message.source)

                const html = typeof parsed.html === 'string' ? parsed.html : ''
                const text = normalizeText(parsed.text)

                const htmlJobs = html
                    ? extractJobsFromHtml({
                        html,
                        subject,
                        date: internalDate,
                    })
                    : []

                const textJobs = text
                    ? extractJobsFromText({
                        text,
                        subject,
                        date: internalDate,
                    })
                    : []

                jobs.push(...htmlJobs, ...textJobs)
            }
        } finally {
            lock.release()
        }
    } finally {
        await client.logout().catch(() => undefined)
    }

    const deduped = new Map<string, ComputrabajoEmailJob>()

    for (const job of jobs) {
        deduped.set(job.external_id, job)
    }

    return Array.from(deduped.values())
}

export async function getComputrabajoEmailJobs(): Promise<NormalizedJob[]> {
    const scrapedJobs = await fetchComputrabajoEmailJobs()
    const scrapedAt = new Date().toISOString()

    return scrapedJobs.map((job) => {
        const textForTags = [
            job.title,
            job.description,
            job.company,
            job.location,
        ]
            .filter(Boolean)
            .join(' ')

        return {
            source_name: 'computrabajo_email_alerts',
            source_type: 'email',
            external_id: job.external_id,
            url: job.url,
            title: job.title,
            company: job.company,
            location: job.location,
            modality: 'unknown',
            seniority: 'unknown',
            salary_text: null,
            description: job.description,
            tech_tags: extractTechTags(textForTags),
            published_at: job.published_at,
            scraped_at: scrapedAt,
        }
    })
}