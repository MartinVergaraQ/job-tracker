import { load, type Cheerio } from 'cheerio'
import type { Element } from 'domhandler'

type DuolaboralJobPosting = {
    title?: string
    datePosted?: string
    url?: string
    hiringOrganization?: {
        name?: string
    }
    jobLocation?: {
        address?: string
    }
}

type ParsedDuolaboralJob = {
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

function normalizeWhitespace(value: string | null | undefined) {
    return value?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
}

function absolutizeUrl(url: string) {
    try {
        return new URL(url, 'https://duoclaboral.cl').toString()
    } catch {
        return url
    }
}

function extractJsonLdBlocks(html: string): string[] {
    const matches = html.matchAll(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )

    return Array.from(matches)
        .map((match) => match[1]?.trim())
        .filter((value): value is string => Boolean(value))
}

function inferModality(text: string | null): string | null {
    if (!text) return null

    const value = text.toLowerCase()

    if (value.includes('remota') || value.includes('remoto') || value.includes('remote')) {
        return 'remote'
    }

    if (value.includes('híbrida') || value.includes('hibrida') || value.includes('hybrid')) {
        return 'hybrid'
    }

    if (value.includes('presencial') || value.includes('onsite')) {
        return 'onsite'
    }

    return null
}

function inferSeniority(text: string | null): string | null {
    if (!text) return null

    const value = text.toLowerCase()

    if (value.includes('junior') || value.includes('junior (')) return 'junior'
    if (value.includes('senior') || value.includes('senior (')) return 'senior'
    if (value.includes('semi senior') || value.includes('semi-senior')) return 'semi-senior'
    if (value.includes('práctica') || value.includes('practica') || value.includes('trainee')) {
        return 'trainee'
    }

    return null
}

function buildExternalId(url: string) {
    try {
        const parsed = new URL(url)
        const parts = parsed.pathname.split('/').filter(Boolean)
        const lastPart = parts[parts.length - 1]

        if (lastPart) return `duolaboral:${lastPart}`
        return `duolaboral:${url}`
    } catch {
        return `duolaboral:${url}`
    }
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

function extractJobPostingsFromJsonLd(parsed: unknown): DuolaboralJobPosting[] {
    const results: DuolaboralJobPosting[] = []

    const visit = (node: unknown) => {
        if (!node || typeof node !== 'object') return

        const current = node as Record<string, unknown>

        if (current['@type'] === 'JobPosting') {
            results.push(current as unknown as DuolaboralJobPosting)
        }

        if (current['@type'] === 'WebPage') {
            const mainEntity = current.mainEntity as Record<string, unknown> | undefined
            const itemListElement = toArray(mainEntity?.itemListElement)

            for (const item of itemListElement) {
                if (item && typeof item === 'object') {
                    const listItem = item as Record<string, unknown>
                    const job = listItem.item

                    if (job && typeof job === 'object') {
                        visit(job)
                    }
                }
            }
        }

        for (const value of Object.values(current)) {
            if (Array.isArray(value)) {
                for (const item of value) visit(item)
            } else if (value && typeof value === 'object') {
                visit(value)
            }
        }
    }

    visit(parsed)

    return results
}

function parseSpanishDate(value: string | null): string | null {
    if (!value) return null

    const cleaned = value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()

    const match = cleaned.match(/(\d{1,2})\s+de\s+([a-z]+),\s+(\d{4})/)
    if (!match) return null

    const day = Number(match[1])
    const monthName = match[2]
    const year = Number(match[3])

    const monthMap: Record<string, number> = {
        ene: 0,
        enero: 0,
        feb: 1,
        febrero: 1,
        mar: 2,
        marzo: 2,
        abr: 3,
        abril: 3,
        may: 4,
        mayo: 4,
        jun: 5,
        junio: 5,
        jul: 6,
        julio: 6,
        ago: 7,
        agosto: 7,
        sep: 8,
        septiembre: 8,
        oct: 9,
        octubre: 9,
        nov: 10,
        noviembre: 10,
        dic: 11,
        diciembre: 11,
    }

    const month = monthMap[monthName]
    if (month === undefined) return null

    return new Date(Date.UTC(year, month, day, 12, 0, 0)).toISOString()
}

function findCardRoot(anchor: Cheerio<Element>, $: ReturnType<typeof load>) {
    const parents = anchor.parents().toArray()

    for (const node of parents) {
        const card = $(node)
        const text = normalizeWhitespace(card.text())

        if (!text) continue

        const looksLikeCard =
            /postular|ya postulaste|\d+\s+postulaciones|de\s+[a-záéíóú]+,\s+\d{4}/i.test(text)

        if (looksLikeCard && text.length < 6000) {
            return card
        }
    }

    return anchor.parent()
}

function extractCompany(card: Cheerio<Element>, title: string, url: string, $: ReturnType<typeof load>) {
    const anchors = card.find('a[href]').toArray()

    for (const node of anchors) {
        const anchor = $(node)
        const href = normalizeWhitespace(anchor.attr('href'))
        const text = normalizeWhitespace(anchor.text())

        if (!text) continue
        if (text === title) continue
        if (/postular|ya postulaste/i.test(text)) continue
        if (/facebook|linkedin|whatsapp|x$/i.test(text)) continue

        const absoluteHref = href ? absolutizeUrl(href) : ''

        if (absoluteHref === url) continue
        if (absoluteHref.includes('/jobs/')) continue

        return text
    }

    return 'Empresa no identificada'
}

function extractLocation(cardText: string) {
    const match = cardText.match(
        /\b(Presencial|Híbrida|Hibrida|Remota|Remoto)\s*;\s*([^$]+?Chile)\b/i
    )

    if (!match) return null

    return normalizeWhitespace(`${match[1]}; ${match[2]}`)
}

function extractPublishedAt(cardText: string) {
    const match = cardText.match(/\b(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+,\s+\d{4})\b/)
    return parseSpanishDate(match?.[1] ?? null)
}

function extractFromDom(html: string): ParsedDuolaboralJob[] {
    const $ = load(html)
    const jobs: ParsedDuolaboralJob[] = []
    const seen = new Set<string>()

    $('a[href*="/jobs/"]').each((_, element) => {
        const anchor = $(element)
        const href = normalizeWhitespace(anchor.attr('href'))
        const title = normalizeWhitespace(anchor.text())

        if (!href || !title) return
        if (/postular|ya postulaste/i.test(title)) return

        const url = absolutizeUrl(href)

        if (!url.includes('/jobs/')) return
        if (seen.has(url)) return

        const card = findCardRoot(anchor, $)
        const cardText = normalizeWhitespace(card.text())
        const company = extractCompany(card, title, url, $)
        const location = extractLocation(cardText)
        const publishedAt = extractPublishedAt(cardText)
        const modality = inferModality(cardText)
        const seniority = inferSeniority(cardText)

        jobs.push({
            external_id: buildExternalId(url),
            title,
            company,
            location,
            modality,
            seniority,
            url,
            source_name: 'duolaboral',
            published_at: publishedAt,
        })

        seen.add(url)
    })

    return jobs
}

function extractFromJsonLd(html: string): ParsedDuolaboralJob[] {
    const jsonLdBlocks = extractJsonLdBlocks(html)
    const jobs: ParsedDuolaboralJob[] = []

    for (const block of jsonLdBlocks) {
        try {
            const parsed = JSON.parse(block)
            const jobPostings = extractJobPostingsFromJsonLd(parsed)

            for (const job of jobPostings) {
                const title = normalizeWhitespace(job.title)
                const company = normalizeWhitespace(job.hiringOrganization?.name)
                const location = normalizeWhitespace(job.jobLocation?.address) || null
                const url = absolutizeUrl(normalizeWhitespace(job.url))
                const publishedAt = normalizeWhitespace(job.datePosted) || null

                if (!title || !company || !url) continue

                jobs.push({
                    external_id: buildExternalId(url),
                    title,
                    company,
                    location,
                    modality: inferModality(location),
                    seniority: null,
                    url,
                    source_name: 'duolaboral',
                    published_at: publishedAt ? new Date(publishedAt).toISOString() : null,
                })
            }
        } catch (error) {
            console.warn('Failed to parse DuoLaboral JSON-LD block:', error)
        }
    }

    return jobs
}

export function parseDuolaboralHtml(html: string): ParsedDuolaboralJob[] {
    const domJobs = extractFromDom(html)

    if (domJobs.length > 0) {
        return Array.from(new Map(domJobs.map((job) => [job.external_id, job])).values())
    }

    const jsonLdJobs = extractFromJsonLd(html)

    return Array.from(
        new Map(jsonLdJobs.map((job) => [job.external_id, job])).values()
    )
}