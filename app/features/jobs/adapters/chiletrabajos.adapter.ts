import { load, type CheerioAPI } from 'cheerio'
import type { NormalizedJob } from '../types/job'

const BASE_URL = 'https://www.chiletrabajos.cl'
const DEFAULT_TERMS = [
    'backend',
    'full stack',
    'react',
    'node',
    'typescript',
    'ventas',
    'administrativo',
    'atencion al cliente',
]

const KNOWN_TAGS = [
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
    'spring boot',
    'php',
    '.net',
    'c#',
    'go',
    'golang',
    'aws',
    'docker',
    'kubernetes',
    'ventas',
    'retail',
    'atencion al cliente',
    'administrativo',
    'recepcionista',
    'secretaria',
    'cajera',
    'reposicion',
]

function normalizeText(value?: string | null) {
    return (value ?? '').replace(/\s+/g, ' ').trim()
}

function unique<T>(items: T[]) {
    return Array.from(new Set(items))
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

function extractBetween(text: string, start: string, end: string) {
    const regex = new RegExp(`${start}\\s+([\\s\\S]*?)\\s+${end}`, 'i')
    const match = text.match(regex)
    return normalizeText(match?.[1] ?? null)
}

function inferModality(text: string): 'remote' | 'hybrid' | 'onsite' | 'unknown' {
    const t = text.toLowerCase()

    if (
        t.includes('híbrido') ||
        t.includes('hibrido') ||
        t.includes('hybrid')
    ) {
        return 'hybrid'
    }

    if (
        t.includes('remoto') ||
        t.includes('remote') ||
        t.includes('desde casa')
    ) {
        return 'remote'
    }

    if (
        t.includes('presencial') ||
        t.includes('on-site') ||
        t.includes('onsite') ||
        t.includes('in-office')
    ) {
        return 'onsite'
    }

    return 'unknown'
}

function inferSeniority(text: string): 'junior' | 'semi-senior' | 'senior' | 'trainee' | 'unknown' {
    const t = text.toLowerCase()

    if (/\btrainee\b|\bintern\b|\bpráctica\b|\bpractica\b/.test(t)) return 'trainee'
    if (/\bsemi\s*senior\b|\bsemi-senior\b|\bsemi senior\b/.test(t)) return 'semi-senior'
    if (/\bsenior\b|\bsr\b/.test(t)) return 'senior'
    if (/\bjunior\b|\bjr\b|\bsin experiencia\b/.test(t)) return 'junior'

    return 'unknown'
}

function inferTags(text: string) {
    const t = text.toLowerCase()
    return KNOWN_TAGS.filter((tag) => t.includes(tag))
}

function parsePublishedAt(bodyText: string) {
    const isoMatch = bodyText.match(
        /Fecha\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}:[0-9]{2})/i
    )

    if (isoMatch?.[1]) {
        return isoMatch[1].replace(' ', 'T')
    }

    return null
}

function buildSearchUrls() {
    const termsRaw = process.env.CHILETRABAJOS_TERMS
    const terms = (termsRaw
        ? termsRaw.split('|').map((t) => t.trim()).filter(Boolean)
        : DEFAULT_TERMS)

    return terms.map((term) => ({
        term,
        url: `${BASE_URL}/encuentra-un-empleo/?2=${encodeURIComponent(term)}&filterSearch=Buscar`,
    }))
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
        throw new Error(`ChileTrabajos fetch failed: ${response.status} ${response.statusText}`)
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

        if (/^https:\/\/www\.chiletrabajos\.cl\/trabajo\/.+/i.test(absolute)) {
            links.add(absolute)
        }
    })

    return Array.from(links)
}

async function parseJobDetail(url: string): Promise<NormalizedJob | null> {
    const html = await fetchHtml(url)
    const $ = load(html)

    const title =
        firstText($, ['h1']) ||
        firstAttr($, ['meta[property="og:title"]'], 'content') ||
        null

    const metaDescription =
        firstAttr(
            $,
            ['meta[name="description"]', 'meta[property="og:description"]'],
            'content'
        ) || null

    const bodyText = normalizeText($('body').text())

    const company =
        extractBetween(bodyText, 'Buscado', 'Fecha') ||
        extractBetween(bodyText, 'Buscado', 'Expira') ||
        'Empresa no identificada'

    const location =
        extractBetween(bodyText, 'Ubicación', 'Categoría') ||
        extractBetween(bodyText, 'Ubicación', 'Salario') ||
        null

    const salaryText =
        extractBetween(bodyText, 'Salario', 'Duración') ||
        null

    const description = metaDescription || bodyText.slice(0, 4000) || null
    const publishedAt = parsePublishedAt(bodyText)
    const modality = inferModality(`${title ?? ''} ${description ?? ''} ${bodyText}`)
    const seniority = inferSeniority(`${title ?? ''} ${description ?? ''}`)
    const techTags = unique(inferTags(`${title ?? ''} ${description ?? ''}`))

    if (!title) return null

    return {
        source_name: 'chiletrabajos',
        source_type: 'html',
        external_id: url,
        url,
        title,
        company,
        location,
        modality,
        seniority,
        salary_text: salaryText,
        description,
        tech_tags: techTags,
        published_at: publishedAt,
        scraped_at: new Date().toISOString(),
    }
}

export async function getChileTrabajosJobs(): Promise<NormalizedJob[]> {
    const maxJobsPerSearch = Number(process.env.CHILETRABAJOS_MAX_JOBS_PER_SEARCH || 10)
    const searchUrls = buildSearchUrls()

    const listPages = await Promise.all(
        searchUrls.map(async ({ url }) => fetchHtml(url))
    )

    const allLinks = unique(
        listPages.flatMap((html) => extractJobLinks(html))
    ).slice(0, Number(process.env.CHILETRABAJOS_MAX_TOTAL_JOBS || 30))

    const jobs = await Promise.all(
        allLinks.slice(0, maxJobsPerSearch * searchUrls.length).map((url) => parseJobDetail(url))
    )

    return jobs.filter(Boolean) as NormalizedJob[]
}