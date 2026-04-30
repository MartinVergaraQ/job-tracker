import type { NormalizedJob } from '../types/job'
import { scrapeLaborumJobs } from './laborum/scrape-laborum-jobs'

export async function getLaborumJobs(): Promise<NormalizedJob[]> {
    const scrapedJobs = await scrapeLaborumJobs()
    const scrapedAt = new Date().toISOString()

    return scrapedJobs.map((job): NormalizedJob => ({
        source_name: 'laborum',
        source_type: 'html',
        external_id: job.external_id,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        modality: job.modality ?? 'unknown',
        seniority: job.seniority ?? 'unknown',
        salary_text: job.salary_text,
        description: job.description,
        tech_tags: job.tech_tags ?? [],
        published_at: job.published_at,
        scraped_at: scrapedAt,
    }))
}