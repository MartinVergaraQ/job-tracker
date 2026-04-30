import { load } from 'cheerio'
import type { JobModality, JobSeniority } from '../../types/job'

export type ParsedIndeedEmailJob = {
    external_id: string
    title: string
    company: string
    location: string | null
    modality: JobModality
    seniority: JobSeniority
    url: string
    source_name: 'indeed_email_alerts'
    published_at: string | null
    description: string | null
    tech_tags: string[]
}

function normalizeWhitespace(value: string | null | undefined) {
    return (value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function inferModality(text: string): JobModality {
    const value = text.toLowerCase()

    if (
        value.includes('remote') ||
        value.includes('remoto') ||
        value.includes('remota') ||
        value.includes('teletrabajo')
    ) {
        return 'remote'
    }

    if (
        value.includes('hybrid') ||
        value.includes('híbrido') ||
        value.includes('hibrido')
    ) {
        return 'hybrid'
    }

    if (
        value.includes('onsite') ||
        value.includes('presencial')
    ) {
        return 'onsite'
    }

    return 'unknown'
}

function inferSeniority(text: string): JobSeniority {
    const value = text.toLowerCase()

    if (
        value.includes('práctica') ||
        value.includes('practica') ||
        value.includes('intern') ||
        value.includes('trainee')
    ) {
        return 'trainee'
    }

    if (value.includes('junior') || /\bjr\b/.test(value)) {
        return 'junior'
    }

    if (value.includes('semi senior') || value.includes('semi-senior')) {
        return 'semi-senior'
    }

    if (value.includes('senior') || /\bsr\b/.test(value)) {
        return 'senior'
    }

    return 'unknown'
}

function inferTags(text: string) {
    const haystack = text.toLowerCase()

    const knownTags = [
        'react',
        'next.js',
        'nextjs',
        'typescript',
        'javascript',
        'node.js',
        'node',
        'nestjs',
        'sql',
        'postgresql',
        'mysql',
        'python',
        'django',
        'java',
        'spring',
        'php',
        '.net',
        'c#',
        'aws',
        'docker',
        'kubernetes',
        'android',
        'kotlin',
        'ios',
        'swift',
        'backend',
        'frontend',
        'full stack',
        'fullstack',
        'sap',
        'ventas',
        'administrativo',
        'atencion al cliente',
        'customer service',
    ]

    return knownTags.filter((tag) => haystack.includes(tag))
}

function looksLikeIndeedJobLink(url: string) {
    const value = url.toLowerCase()

    return (
        value.includes('indeed.com') ||
        value.includes('indeed.cl') ||
        value.includes('/viewjob') ||
        value.includes('/rc/clk') ||
        value.includes('jk=')
    )
}

function decodeIndeedRedirect(url: string) {
    try {
        const parsed = new URL(url, 'https://cl.indeed.com')

        const redirected =
            parsed.searchParams.get('dest') ||
            parsed.searchParams.get('url') ||
            parsed.searchParams.get('dest_url')

        if (redirected) {
            return decodeURIComponent(redirected)
        }

        return parsed.toString()
    } catch {
        return url
    }
}

function normalizeIndeedJobUrl(rawUrl: string) {
    const decoded = decodeIndeedRedirect(rawUrl)

    try {
        const parsed = new URL(decoded, 'https://cl.indeed.com')

        const jk = parsed.searchParams.get('jk')
        if (jk) {
            return `https://cl.indeed.com/viewjob?jk=${jk}`
        }

        if (/\/viewjob/i.test(parsed.pathname)) {
            return `https://cl.indeed.com${parsed.pathname}${parsed.searchParams.get('jk') ? `?jk=${parsed.searchParams.get('jk')}` : parsed.search}`
        }

        return parsed.toString()
    } catch {
        return decoded
    }
}

function buildExternalId(url: string) {
    try {
        const parsed = new URL(url)
        const jk = parsed.searchParams.get('jk')

        if (jk) return `indeed-email:${jk}`

        return `indeed-email:${parsed.pathname}${parsed.search}`
    } catch {
        return `indeed-email:${url}`
    }
}

function extractCompanyAndLocation(blockText: string, title: string) {
    const cleaned = normalizeWhitespace(blockText.replace(title, ''))

    const parts = cleaned
        .split(/[\n|•·]/)
        .map((part) => normalizeWhitespace(part))
        .filter(Boolean)

    let company = 'Empresa no identificada'
    let location: string | null = null

    for (const part of parts) {
        const lower = part.toLowerCase()

        const looksLikeLocation =
            lower.includes('chile') ||
            lower.includes('santiago') ||
            lower.includes('metropolitana') ||
            lower.includes('remote') ||
            lower.includes('remoto') ||
            lower.includes('presencial') ||
            lower.includes('hybrid') ||
            lower.includes('híbrido') ||
            lower.includes('hibrido')

        const looksLikeNoise =
            lower.includes('postular') ||
            lower.includes('apply') ||
            lower.includes('ver empleo') ||
            lower.includes('job alert') ||
            lower.includes('indeed')

        if (!looksLikeLocation && !looksLikeNoise && company === 'Empresa no identificada') {
            company = part
            continue
        }

        if (looksLikeLocation && !location) {
            location = part
        }
    }

    return { company, location }
}

function extractJobsFromHtml(html: string, publishedAt: string | null) {
    const $ = load(html)
    const jobs: ParsedIndeedEmailJob[] = []
    const seen = new Set<string>()

    $('a[href]').each((_, element) => {
        const anchor = $(element)
        const href = normalizeWhitespace(anchor.attr('href'))
        const title = normalizeWhitespace(anchor.text())

        if (!href || !title) return
        if (title.length < 4) return
        if (!looksLikeIndeedJobLink(href)) return
        if (/apply|postular|ver empleo|unsubscribe|cancel alert/i.test(title)) return

        const url = normalizeIndeedJobUrl(href)
        const externalId = buildExternalId(url)

        if (seen.has(externalId)) return

        const container = anchor.closest('tr, td, table, div, li')
        const blockText = normalizeWhitespace(container.text())
        const { company, location } = extractCompanyAndLocation(blockText, title)

        const inferenceText = `${title} ${company} ${location ?? ''} ${blockText}`
        const modality = inferModality(inferenceText)
        const seniority = inferSeniority(inferenceText)
        const techTags = inferTags(inferenceText)

        jobs.push({
            external_id: externalId,
            title,
            company,
            location,
            modality,
            seniority,
            url,
            source_name: 'indeed_email_alerts',
            published_at: publishedAt,
            description: blockText || null,
            tech_tags: techTags,
        })

        seen.add(externalId)
    })

    return jobs
}

function extractJobsFromText(text: string, publishedAt: string | null) {
    const jobs: ParsedIndeedEmailJob[] = []
    const seen = new Set<string>()
    const urls = text.match(/https?:\/\/[^\s]+/g) ?? []

    for (const rawUrl of urls) {
        if (!looksLikeIndeedJobLink(rawUrl)) continue

        const url = normalizeIndeedJobUrl(rawUrl)
        const externalId = buildExternalId(url)

        if (seen.has(externalId)) continue

        jobs.push({
            external_id: externalId,
            title: 'Indeed Job Alert',
            company: 'Empresa no identificada',
            location: null,
            modality: 'unknown',
            seniority: 'unknown',
            url,
            source_name: 'indeed_email_alerts',
            published_at: publishedAt,
            description: null,
            tech_tags: [],
        })

        seen.add(externalId)
    }

    return jobs
}

export function parseIndeedAlertEmail(params: {
    html?: string | null
    text?: string | null
    publishedAt?: string | null
}) {
    const htmlJobs = params.html
        ? extractJobsFromHtml(params.html, params.publishedAt ?? null)
        : []

    if (htmlJobs.length > 0) {
        return htmlJobs
    }

    return params.text
        ? extractJobsFromText(params.text, params.publishedAt ?? null)
        : []
}