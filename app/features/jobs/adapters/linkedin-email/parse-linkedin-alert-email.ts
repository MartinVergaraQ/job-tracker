import { load } from 'cheerio'

type ParsedLinkedInEmailJob = {
    external_id: string
    title: string
    company: string
    location: string | null
    modality: 'remote' | 'hybrid' | 'onsite' | 'unknown' | null
    seniority: 'trainee' | 'junior' | 'semi-senior' | 'senior' | 'unknown' | null
    url: string
    source_name: 'linkedin_email_alerts'
    published_at: string | null
    description: string | null
    tech_tags: string[]
}

function normalizeWhitespace(value: string | null | undefined) {
    return (value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function inferModality(text: string): ParsedLinkedInEmailJob['modality'] {
    const t = text.toLowerCase()

    if (t.includes('remote') || t.includes('remoto') || t.includes('remota')) {
        return 'remote'
    }

    if (t.includes('hybrid') || t.includes('híbrido') || t.includes('hibrido')) {
        return 'hybrid'
    }

    if (t.includes('onsite') || t.includes('presencial')) {
        return 'onsite'
    }

    return 'unknown'
}

function inferSeniority(text: string): ParsedLinkedInEmailJob['seniority'] {
    const t = text.toLowerCase()

    if (t.includes('intern') || t.includes('trainee') || t.includes('práctica') || t.includes('practica')) {
        return 'trainee'
    }

    if (t.includes('junior') || t.includes('jr')) {
        return 'junior'
    }

    if (t.includes('semi senior') || t.includes('semi-senior')) {
        return 'semi-senior'
    }

    if (t.includes('senior') || t.includes('sr')) {
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
        'jetpack compose',
        'ios',
        'swift',
        'backend',
        'frontend',
        'full stack',
        'fullstack',
        'ventas',
        'administrativo',
        'atencion al cliente',
    ]

    return knownTags.filter((tag) => haystack.includes(tag))
}

function decodeRedirect(url: string) {
    try {
        const parsed = new URL(url, 'https://www.linkedin.com')

        const maybeRealUrl =
            parsed.searchParams.get('url') ||
            parsed.searchParams.get('redirect') ||
            parsed.searchParams.get('dest')

        if (maybeRealUrl) {
            return decodeURIComponent(maybeRealUrl)
        }

        if (parsed.searchParams.get('currentJobId')) {
            return `https://www.linkedin.com/jobs/view/${parsed.searchParams.get('currentJobId')}`
        }

        parsed.hash = ''
        parsed.search = ''

        return parsed.toString()
    } catch {
        return url
    }
}

function normalizeLinkedInJobUrl(rawUrl: string) {
    const decoded = decodeRedirect(rawUrl)

    try {
        const parsed = new URL(decoded, 'https://www.linkedin.com')

        const jobIdMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/i)
        if (jobIdMatch?.[1]) {
            return `https://www.linkedin.com/jobs/view/${jobIdMatch[1]}`
        }

        parsed.hash = ''
        parsed.search = ''
        return parsed.toString()
    } catch {
        return decoded
    }
}

function buildExternalId(url: string) {
    const jobIdMatch = url.match(/\/jobs\/view\/(\d+)/i)
    if (jobIdMatch?.[1]) {
        return `linkedin-email:${jobIdMatch[1]}`
    }

    return `linkedin-email:${url}`
}

function looksLikeLinkedInJobLink(url: string) {
    return (
        /linkedin\.com/i.test(url) &&
        (
            /\/jobs\/view\//i.test(url) ||
            /currentJobId=/i.test(url) ||
            /\/comm\/jobs\//i.test(url)
        )
    )
}

function extractCompanyAndLocation(blockText: string, title: string) {
    const cleaned = normalizeWhitespace(blockText)
    const withoutTitle = normalizeWhitespace(
        cleaned.replace(title, '').replace(/^•\s*/, '')
    )

    let company = 'Empresa no identificada'
    let location: string | null = null

    const parts = withoutTitle
        .split(/[\n|•·]/)
        .map((part) => normalizeWhitespace(part))
        .filter(Boolean)

    for (const part of parts) {
        if (part.length < 2) continue

        const lower = part.toLowerCase()

        const looksLikeLocation =
            /chile|santiago|metropolitana|valpara[ií]so|concepci[oó]n|remote|hybrid|remoto|presencial/i.test(lower)

        if (!looksLikeLocation && company === 'Empresa no identificada') {
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
    const jobs: ParsedLinkedInEmailJob[] = []
    const seen = new Set<string>()

    $('a[href]').each((_, element) => {
        const anchor = $(element)
        const href = normalizeWhitespace(anchor.attr('href'))
        const title = normalizeWhitespace(anchor.text())

        if (!href || !title) return
        if (!looksLikeLinkedInJobLink(href)) return
        if (title.length < 4) return
        if (/view job|see more|apply|ver empleo/i.test(title)) return

        const url = normalizeLinkedInJobUrl(href)
        const externalId = buildExternalId(url)

        if (seen.has(externalId)) return

        const container = anchor.closest('tr, td, table, div, li')
        const blockText = normalizeWhitespace(container.text())
        const { company, location } = extractCompanyAndLocation(blockText, title)

        const textForInference = `${title} ${company} ${location ?? ''} ${blockText}`
        const modality = inferModality(textForInference)
        const seniority = inferSeniority(textForInference)
        const techTags = inferTags(textForInference)

        jobs.push({
            external_id: externalId,
            title,
            company,
            location,
            modality,
            seniority,
            url,
            source_name: 'linkedin_email_alerts',
            published_at: publishedAt,
            description: blockText || null,
            tech_tags: techTags,
        })

        seen.add(externalId)
    })

    return jobs
}

function extractJobsFromText(text: string, publishedAt: string | null) {
    const jobs: ParsedLinkedInEmailJob[] = []
    const seen = new Set<string>()

    const urlMatches = text.match(/https?:\/\/[^\s]+/g) ?? []

    for (const rawUrl of urlMatches) {
        if (!looksLikeLinkedInJobLink(rawUrl)) continue

        const url = normalizeLinkedInJobUrl(rawUrl)
        const externalId = buildExternalId(url)

        if (seen.has(externalId)) continue

        jobs.push({
            external_id: externalId,
            title: 'LinkedIn Job Alert',
            company: 'Empresa no identificada',
            location: null,
            modality: 'unknown',
            seniority: 'unknown',
            url,
            source_name: 'linkedin_email_alerts',
            published_at: publishedAt,
            description: null,
            tech_tags: [],
        })

        seen.add(externalId)
    }

    return jobs
}

export function parseLinkedInAlertEmail(params: {
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

    const textJobs = params.text
        ? extractJobsFromText(params.text, params.publishedAt ?? null)
        : []

    return textJobs
}