import { load, type Cheerio } from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { JobModality, JobSeniority } from '../../types/job'

export type ParsedLaborumJob = {
    external_id: string
    title: string
    company: string
    location: string | null
    modality: JobModality
    seniority: JobSeniority
    url: string
    source_name: 'laborum'
    published_at: string | null
    salary_text: string | null
    description: string | null
    tech_tags: string[]
}

function normalizeWhitespace(value: string | null | undefined) {
    return (value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function absolutizeUrl(url: string) {
    try {
        return new URL(url, 'https://www.laborum.cl').toString()
    } catch {
        return url
    }
}

function buildExternalId(url: string) {
    try {
        const parsed = new URL(url)
        const parts = parsed.pathname.split('/').filter(Boolean)
        const lastPart = parts[parts.length - 1]

        if (lastPart) return `laborum:${lastPart}`
        return `laborum:${url}`
    } catch {
        return `laborum:${url}`
    }
}

function looksLikeJobUrl(url: string) {
    try {
        const parsed = new URL(url)
        return /^\/empleos\/.+\.html$/i.test(parsed.pathname)
    } catch {
        return false
    }
}

function slugToTitle(url: string) {
    try {
        const parsed = new URL(url)
        const lastPart = parsed.pathname.split('/').filter(Boolean).pop() ?? ''

        const clean = lastPart
            .replace(/\.html$/i, '')
            .replace(/-\d+$/i, '')
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

        if (!clean) return 'Sin título'

        return clean
            .split(' ')
            .map((word) => {
                if (!word) return word
                return word.charAt(0).toUpperCase() + word.slice(1)
            })
            .join(' ')
    } catch {
        return 'Sin título'
    }
}

function inferModality(text: string): JobModality {
    const value = text.toLowerCase()

    if (
        value.includes('remoto') ||
        value.includes('remote') ||
        value.includes('teletrabajo')
    ) {
        return 'remote'
    }

    if (
        value.includes('híbrido') ||
        value.includes('hibrido') ||
        value.includes('hybrid')
    ) {
        return 'hybrid'
    }

    if (value.includes('presencial')) {
        return 'onsite'
    }

    return 'unknown'
}

function inferSeniority(text: string): JobSeniority {
    const value = text.toLowerCase()

    if (
        value.includes('práctica') ||
        value.includes('practica') ||
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
        'backend',
        'frontend',
        'full stack',
        'fullstack',
        'sap',
        'ventas',
        'administrativo',
        'atencion al cliente',
    ]

    return knownTags.filter((tag) => haystack.includes(tag))
}

function getCardText(anchor: Cheerio<AnyNode>) {
    const card = anchor.closest('article, li, [class*="card"], [class*="Card"], div')
    const text = normalizeWhitespace(card.text())
    if (text) return text
    return normalizeWhitespace(anchor.text())
}

function extractCompany(text: string, title: string) {
    const cleaned = normalizeWhitespace(text)

    if (cleaned.includes('Confidencial')) {
        return 'Confidencial'
    }

    const lowerTitle = title.toLowerCase()
    const lowerText = cleaned.toLowerCase()

    const titleIndex = lowerText.indexOf(lowerTitle)
    if (titleIndex >= 0) {
        const afterTitle = cleaned.slice(titleIndex + title.length).trim()

        const companyCandidate = normalizeWhitespace(
            afterTitle
                .split(/Alta revisión de perfiles|Postulación rápida|Múltiples vacantes|Apto discapacidad|📍|✅|💼|🎯|Beneficios|Requisitos/i)[0]
                ?.slice(0, 80)
        )

        if (
            companyCandidate &&
            !companyCandidate.toLowerCase().includes('publicado') &&
            !companyCandidate.toLowerCase().includes('actualizado')
        ) {
            return companyCandidate
        }
    }

    return 'Empresa no identificada'
}

function extractLocation(text: string) {
    const normalized = normalizeWhitespace(text)

    const match = normalized.match(
        /([A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s()./-]+,\s*Región\s*[A-Za-zÁÉÍÓÚÑáéíóúñIVX0-9]+)(Remoto|Presencial|Híbrido|Hibrido)?/i
    )

    if (!match) return null

    const location = normalizeWhitespace(
        [match[1], match[2]].filter(Boolean).join(' ')
    )

    return location || null
}

export function parseLaborumHtml(html: string): ParsedLaborumJob[] {
    const $ = load(html)
    const jobs: ParsedLaborumJob[] = []
    const seen = new Set<string>()

    $('a[href]').each((_, element) => {
        const anchor = $(element)
        const href = normalizeWhitespace(anchor.attr('href'))
        const ariaLabel = normalizeWhitespace(anchor.attr('aria-label'))

        if (!href || href === '#') return
        if (ariaLabel.toLowerCase().startsWith('ir a la página')) return

        const url = absolutizeUrl(href)
        if (!looksLikeJobUrl(url)) return

        const externalId = buildExternalId(url)
        if (seen.has(externalId)) return

        const text = normalizeWhitespace(anchor.text())
        const cardText = getCardText(anchor)
        const combinedText = normalizeWhitespace(`${text} ${cardText}`)

        const title = slugToTitle(url)
        if (!title || title === 'Sin título') return

        const company = extractCompany(combinedText, title)
        const location = extractLocation(combinedText)
        const modality = inferModality(combinedText)
        const seniority = inferSeniority(combinedText)
        const techTags = inferTags(combinedText)

        jobs.push({
            external_id: externalId,
            title,
            company,
            location,
            modality,
            seniority,
            url,
            source_name: 'laborum',
            published_at: null,
            salary_text: null,
            description: combinedText || null,
            tech_tags: techTags,
        })

        seen.add(externalId)
    })

    return jobs
}