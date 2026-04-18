import { load, type CheerioAPI } from 'cheerio'
import type { NormalizedJob } from '../types/job'

const BASE_URL = 'https://www.getonbrd.com'
const DEFAULT_LIST_URL = 'https://www.getonbrd.com/jobs/programming'

const KNOWN_TECHS = [
    'react',
    'next.js',
    'nextjs',
    'angular',
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
    'drf',
    'java',
    '.net',
    'c#',
    'golang',
    'go',
    'aws',
    'gcp',
    'azure',
    'docker',
    'kubernetes',
    'graphql',
    'rest',
]

function normalizeText(value?: string | null) {
    return (value ?? '').replace(/\s+/g, ' ').trim()
}

function unique<T>(arr: T[]) {
    return Array.from(new Set(arr))
}

function inferModality(text: string): 'remote' | 'hybrid' | 'onsite' | 'unknown' {
    const t = text.toLowerCase()

    if (
        t.includes('remote') ||
        t.includes('remoto') ||
        t.includes('work from home')
    ) {
        if (
            t.includes('hybrid') ||
            t.includes('híbrido') ||
            t.includes('partly from home') ||
            t.includes('partly at the office')
        ) {
            return 'hybrid'
        }

        return 'remote'
    }

    if (
        t.includes('hybrid') ||
        t.includes('híbrido') ||
        t.includes('partly from home') ||
        t.includes('partly at the office')
    ) {
        return 'hybrid'
    }

    if (
        t.includes('in-office') ||
        t.includes('on-site') ||
        t.includes('onsite') ||
        t.includes('presencial')
    ) {
        return 'onsite'
    }

    return 'unknown'
}

function inferSeniority(text: string): 'junior' | 'semi-senior' | 'senior' | 'trainee' | 'unknown' {
    const t = text.toLowerCase()

    if (/\btrainee\b|\bintern\b|\bpráctica\b/.test(t)) return 'trainee'
    if (/\bsemi\s*senior\b|\bsemi-senior\b|\bsemi senior\b/.test(t)) return 'semi-senior'
    if (/\bsenior\b|\bsr\b/.test(t)) return 'senior'
    if (/\bjunior\b|\bjr\b/.test(t)) return 'junior'

    return 'unknown'
}

function inferTechTags(text: string) {
    const t = text.toLowerCase()
    return KNOWN_TECHS.filter((tag) => t.includes(tag))
}

function firstAttr($: CheerioAPI, selectors: string[], attr: string) {
    for (const selector of selectors) {
        const value = $(selector).first().attr(attr)
        if (value) return normalizeText(value)
    }
    return null
}

function firstText($: CheerioAPI, selectors: string[]) {
    for (const selector of selectors) {
        const value = normalizeText($(selector).first().text())
        if (value) return value
    }
    return null
}

function parseCompanyFromOgTitle(ogTitle: string | null) {
    if (!ogTitle) return null

    const match = ogTitle.match(/ at (.+?)(?: -|$)/i)
    if (match?.[1]) return normalizeText(match[1])

    return null
}

function inferLocation(text: string): string | null {
    const compact = normalizeText(text)

    const patterns = [
        /performed entirely in:\s*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9(),.\- ]+)/i,
        /partly from home and partly at the office in:\s*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9(),.\- ]+)/i,
        /Remote\s*\(([^)]+)\)/i,
        /Remoto\s*\(([^)]+)\)/i,
    ]

    for (const pattern of patterns) {
        const match = compact.match(pattern)
        if (match?.[1]) {
            return normalizeText(match[1])
        }
    }

    if (/remote|remoto/i.test(compact)) return 'Remote'
    return null
}

async function fetchHtml(url: string) {
    const response = await fetch(url, {
        headers: {
            'user-agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
            'accept-language': 'es-CL,es;q=0.9,en;q=0.8',
        },
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(`GetOnBoard fetch failed: ${response.status} ${response.statusText}`)
    }

    return response.text()
}

function extractJobLinks(html: string) {
    const $ = load(html)
    const links = new Set<string>()

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        const absolute = new URL(href, BASE_URL).toString()

        if (/^https:\/\/www\.getonbrd\.com\/jobs\/programming\/.+/i.test(absolute)) {
            links.add(absolute)
        }
    })

    return Array.from(links)
}

async function parseJobDetail(url: string): Promise<NormalizedJob | null> {
    const html = await fetchHtml(url)
    const $ = load(html)

    const ogTitle = firstAttr($, ['meta[property="og:title"]'], 'content')
    const metaDescription = firstAttr(
        $,
        ['meta[name="description"]', 'meta[property="og:description"]'],
        'content'
    )

    const title =
        firstText($, ['h1']) ||
        ogTitle?.split(' at ')[0]?.trim() ||
        null

    const company =
        firstText($, ['a[href*="/companies/"]']) ||
        parseCompanyFromOgTitle(ogTitle) ||
        'Unknown company'

    const publishedAt =
        firstAttr($, ['time[datetime]'], 'datetime') ||
        null

    const bodyText = normalizeText($('body').text())
    const description = metaDescription || bodyText.slice(0, 4000) || null
    const modality = inferModality(bodyText)
    const seniority = inferSeniority(`${title ?? ''} ${description ?? ''}`)
    const location = inferLocation(bodyText)
    const techTags = unique(inferTechTags(`${title ?? ''} ${description ?? ''}`))

    if (!title) return null

    return {
        source_name: 'getonbrd',
        source_type: 'html',
        external_id: url,
        url,
        title,
        company,
        location,
        modality,
        seniority,
        salary_text: null,
        description,
        tech_tags: techTags,
        published_at: publishedAt,
        scraped_at: new Date().toISOString(),
    }
}

export async function getGetOnBoardJobs(): Promise<NormalizedJob[]> {
    const listUrl = process.env.GETONBRD_LIST_URL || DEFAULT_LIST_URL
    const maxJobs = Number(process.env.GETONBRD_MAX_JOBS || 20)

    const html = await fetchHtml(listUrl)
    const jobLinks = extractJobLinks(html).slice(0, maxJobs)

    const jobs = await Promise.all(jobLinks.map((url) => parseJobDetail(url)))

    return jobs.filter(Boolean) as NormalizedJob[]
}