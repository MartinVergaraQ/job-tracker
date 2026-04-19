import { createAdminClient } from '@/lib/supabase/admin'
import { scoreJob } from '../core/score-job'
import type { NormalizedJob, SearchProfile } from '../../types/job'

import type { JobModality, JobSeniority } from '../../types/job'

type JobRow = {
    id: string
    source_name: string
    source_type: string
    external_id: string
    url: string
    title: string
    company: string
    location: string | null
    modality: string | null
    seniority: string | null
    salary_text: string | null
    description: string | null
    tech_tags: string[] | null
    published_at: string | null
    scraped_at: string | null
}

type RescoreResult = {
    scanned: number
    rescored: number
    matches_upserted: number
}

async function getActiveProfiles() {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('search_profiles')
        .select('*')
        .eq('is_active', true)

    if (error) throw new Error(error.message)

    return (data ?? []) as SearchProfile[]
}

function toNormalizedJob(job: JobRow): NormalizedJob {
    const VALID_SOURCE_TYPES = ['mock', 'api', 'rss', 'html', 'browser'] as const
    const VALID_MODALITIES: JobModality[] = ['remote', 'hybrid', 'onsite', 'unknown']
    const VALID_SENIORITIES: JobSeniority[] = ['junior', 'semi-senior', 'senior', 'trainee', 'unknown']

    const sourceType = VALID_SOURCE_TYPES.includes(job.source_type as typeof VALID_SOURCE_TYPES[number])
        ? (job.source_type as typeof VALID_SOURCE_TYPES[number])
        : 'html'

    const modality: JobModality = job.modality && VALID_MODALITIES.includes(job.modality as JobModality)
        ? (job.modality as JobModality)
        : 'unknown'

    const seniority: JobSeniority = job.seniority && VALID_SENIORITIES.includes(job.seniority as JobSeniority)
        ? (job.seniority as JobSeniority)
        : 'unknown'

    return {
        source_name: job.source_name,
        source_type: sourceType,
        external_id: job.external_id,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        modality,
        seniority,
        salary_text: job.salary_text,
        description: job.description,
        tech_tags: job.tech_tags ?? [],
        published_at: job.published_at,
        scraped_at: job.scraped_at ?? new Date().toISOString(),
    }
}

export async function rescoreDuolaboralJobs(limit = 30): Promise<RescoreResult> {
    const supabase = createAdminClient()
    const profiles = await getActiveProfiles()

    const { data: jobs, error } = await supabase
        .from('jobs')
        .select(`
            id,
            source_name,
            source_type,
            external_id,
            url,
            title,
            company,
            location,
            modality,
            seniority,
            salary_text,
            description,
            tech_tags,
            published_at,
            scraped_at
        `)
        .eq('source_name', 'duolaboral')
        .not('description', 'is', null)
        .order('published_at', { ascending: false })
        .limit(limit)

    if (error) {
        throw new Error(error.message)
    }

    let rescored = 0
    let matchesUpserted = 0

    for (const rawJob of (jobs ?? []) as JobRow[]) {
        const job = toNormalizedJob(rawJob)

        for (const profile of profiles) {
            const result = scoreJob(job, profile)

            const { error: upsertError } = await supabase
                .from('job_matches')
                .upsert(
                    {
                        job_id: rawJob.id,
                        profile_id: profile.id,
                        score: result.score,
                        is_match: result.is_match,
                        reasons: result.reasons,
                    },
                    {
                        onConflict: 'job_id,profile_id',
                        ignoreDuplicates: false,
                    }
                )

            if (upsertError) {
                throw new Error(upsertError.message)
            }

            matchesUpserted += 1
        }

        rescored += 1
    }

    return {
        scanned: jobs?.length ?? 0,
        rescored,
        matches_upserted: matchesUpserted,
    }
}