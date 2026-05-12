import type { NormalizedJob } from '../types/job'
import { scrapeTrabajandoJobs } from './trabajando/scrape-trabajando-jobs'

export async function getTrabajandoJobs(): Promise<NormalizedJob[]> {
    const scrapedJobs = await scrapeTrabajandoJobs()
    const scrapedAt = new Date().toISOString()

    return scrapedJobs.map(
        (job): NormalizedJob => ({
            source_name: 'trabajando',
            source_type: 'html',
            external_id: job.external_id,
            url: job.url,
            title: job.title,
            company: job.company,
            location: job.location || null,
            modality: job.modality,
            seniority: job.seniority,
            salary_text: job.salary_text ?? null,
            description: job.description ?? null,
            tech_tags: job.tech_tags ?? [],
            published_at: job.published_at ?? null,
            scraped_at: scrapedAt,
        })
    )
}