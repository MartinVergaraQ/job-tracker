import { scrapeDuolaboralJobs } from './duolaboral/scrape-duolaboral-jobs'
import type { NormalizedJob } from '../types/job'

const FALLBACK_MODALITY: NormalizedJob['modality'] = 'unknown'
const FALLBACK_SENIORITY: NormalizedJob['seniority'] = 'unknown'

function toJobModality(value: string | null): NormalizedJob['modality'] {
    if (value === 'remote') return 'remote'
    if (value === 'hybrid') return 'hybrid'
    if (value === 'onsite') return 'onsite'

    return FALLBACK_MODALITY
}

function toJobSeniority(value: string | null): NormalizedJob['seniority'] {
    if (value === 'junior') return 'junior'
    if (value === 'semi-senior') return 'semi-senior'
    if (value === 'senior') return 'senior'
    if (value === 'trainee') return 'trainee'

    return FALLBACK_SENIORITY
}

export async function getDuolaboralJobs(): Promise<NormalizedJob[]> {
    const scrapedJobs = await scrapeDuolaboralJobs()
    const scrapedAt = new Date().toISOString()

    return scrapedJobs.map((job) => ({
        source_name: 'duolaboral',
        source_type: 'browser' as const,
        external_id: job.external_id,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        modality: toJobModality(job.modality),
        seniority: toJobSeniority(job.seniority),
        salary_text: null,
        description: null,
        tech_tags: [],
        published_at: job.published_at,
        scraped_at: scrapedAt,
    }))
}