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
    return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function extractJsonLdBlocks(html: string): string[] {
    const matches = html.matchAll(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )

    return Array.from(matches)
        .map((match) => match[1]?.trim())
        .filter((value): value is string => Boolean(value))
}

function inferModality(location: string | null): string | null {
    if (!location) return null

    const text = location.toLowerCase()

    if (text.includes('remota') || text.includes('remote')) return 'remote'
    if (text.includes('híbrida') || text.includes('hibrida') || text.includes('hybrid')) return 'hybrid'
    if (text.includes('presencial') || text.includes('onsite')) return 'onsite'

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

export function parseDuolaboralHtml(html: string): ParsedDuolaboralJob[] {
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
                const url = normalizeWhitespace(job.url)
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

    const deduped = new Map<string, ParsedDuolaboralJob>()

    for (const job of jobs) {
        deduped.set(job.external_id, job)
    }

    return Array.from(deduped.values())
}