import { fetchLinkedInEmailJobs } from './linkedin-email/fetch-linkedin-email-jobs'
import type { NormalizedJob } from '../types/job'

export async function getLinkedInEmailJobs(): Promise<NormalizedJob[]> {
    const scrapedJobs = await fetchLinkedInEmailJobs()
    const scrapedAt = new Date().toISOString()

    return scrapedJobs.map((job) => ({
        source_name: 'linkedin_email_alerts',
        source_type: 'email',
        external_id: job.external_id,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        modality: job.modality ?? 'unknown',
        seniority: job.seniority ?? 'unknown',
        salary_text: null,
        description: job.description,
        tech_tags: job.tech_tags ?? [],
        published_at: job.published_at,
        scraped_at: scrapedAt,
    }))
}