import * as cheerio from 'cheerio'
import type { JobModality, JobSeniority } from '../../types/job'

export type ParsedTrabajandoJob = {
    external_id: string
    url: string
    title: string
    company: string
    location: string
    modality: JobModality
    seniority: JobSeniority
    salary_text?: string | null
    description: string
    tech_tags?: string[]
    published_at?: string | null
}

function cleanText(value: string | undefined | null) {
    return (value ?? '').replace(/\s+/g, ' ').trim()
}

function absoluteUrl(href: string | undefined | null, baseUrl: string) {
    if (!href) return ''
    try {
        return new URL(href, baseUrl).toString()
    } catch {
        return ''
    }
}

function inferTechTags(text: string) {
    const lowered = text.toLowerCase()
    const candidates = [
        'react',
        'next.js',
        'angular',
        'typescript',
        'javascript',
        'node.js',
        'node',
        'python',
        'django',
        'php',
        'sql',
        'postgresql',
        'mysql',
        'mongodb',
        'supabase',
        'aws',
        'docker',
        'git',
        'java',
        'go',
    ]

    return candidates.filter((tag) => lowered.includes(tag))
}

function inferModality(text: string): JobModality {
    const lowered = text.toLowerCase()

    if (lowered.includes('remoto') || lowered.includes('remote')) return 'remote'
    if (
        lowered.includes('híbrido') ||
        lowered.includes('hibrido') ||
        lowered.includes('hybrid')
    ) {
        return 'hybrid'
    }
    if (lowered.includes('presencial') || lowered.includes('onsite')) {
        return 'onsite'
    }

    return 'unknown'
}

function inferSeniority(text: string): JobSeniority {
    const lowered = text.toLowerCase()

    if (lowered.includes('trainee')) return 'trainee'

    if (
        lowered.includes('junior') ||
        lowered.includes(' jr ') ||
        lowered.startsWith('jr ') ||
        lowered.endsWith(' jr') ||
        lowered.includes('práctica') ||
        lowered.includes('practica') ||
        lowered.includes('practicante')
    ) {
        return 'junior'
    }

    if (
        lowered.includes('semi senior') ||
        lowered.includes('semisenior') ||
        lowered.includes('semi-senior')
    ) {
        return 'semi-senior'
    }

    if (
        lowered.includes('senior') ||
        lowered.includes(' sr ') ||
        lowered.startsWith('sr ') ||
        lowered.endsWith(' sr')
    ) {
        return 'senior'
    }

    return 'unknown'
}

export function parseTrabajandoHtml(
    html: string,
    baseUrl: string
): ParsedTrabajandoJob[] {
    const $ = cheerio.load(html)
    const jobs: ParsedTrabajandoJob[] = []

    const cards = $('[data-testid="job-card"], article, .job-item, .js-job-item')

    cards.each((_, element) => {
        const root = $(element)

        const anchor = root
            .find('a[href*="/trabajo/"], a[href*="/empleo/"], a')
            .first()

        const url = absoluteUrl(anchor.attr('href'), baseUrl)
        const title = cleanText(
            root.find('h2, h3, [data-testid="job-title"]').first().text()
        )

        const company = cleanText(
            root
                .find('[data-testid="company-name"], .company, .empresa')
                .first()
                .text()
        )

        const location = cleanText(
            root
                .find('[data-testid="job-location"], .location, .ubicacion')
                .first()
                .text()
        )

        const metaText = cleanText(root.text())
        const description = cleanText(
            root.find('p, .description, .job-description').first().text()
        )

        const external_id =
            root.attr('data-job-id') || url || `${title}::${company}::${location}`

        if (!title || !url) return

        jobs.push({
            external_id,
            url,
            title,
            company: company || 'Empresa no informada',
            location: location || 'Ubicación no informada',
            modality: inferModality(metaText),
            seniority: inferSeniority(metaText),
            salary_text: null,
            description: description || metaText,
            tech_tags: inferTechTags(`${title} ${description} ${metaText}`),
            published_at: null,
        })
    })

    const deduped = new Map<string, ParsedTrabajandoJob>()

    for (const job of jobs) {
        deduped.set(job.external_id, job)
    }

    return Array.from(deduped.values())
}