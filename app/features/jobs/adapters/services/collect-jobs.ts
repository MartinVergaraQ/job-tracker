import { createAdminClient } from '@/lib/supabase/admin'
import { createFingerprint } from '../core/create-fingerprint'
import { scoreJob } from '../core/score-job'
import { getGetOnBoardJobs } from '../getonbrd.adapter'
import { getChileTrabajosJobs } from '../chiletrabajos.adapter'
import type { NormalizedJob, SearchProfile } from '../../types/job'

type SourceResult = {
    source_name: string
    ok: boolean
    jobs_found: number
    error?: string
}

type CollectJobsResult = {
    jobs_found: number
    jobs_processed: number
    matches_created: number
    sources: SourceResult[]
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

async function upsertJob(job: NormalizedJob) {
    const supabase = createAdminClient()
    const fingerprint = createFingerprint(job)

    const payload = {
        source_name: job.source_name,
        source_type: job.source_type,
        external_id: job.external_id,
        fingerprint,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        modality: job.modality,
        seniority: job.seniority,
        salary_text: job.salary_text,
        description: job.description,
        tech_tags: job.tech_tags,
        published_at: job.published_at,
        scraped_at: job.scraped_at,
        last_seen_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
        .from('jobs')
        .upsert(payload, {
            onConflict: 'fingerprint',
            ignoreDuplicates: false,
        })
        .select('id')

    if (error) throw new Error(error.message)

    return data?.[0]?.id as string | undefined
}

async function createMatches(
    jobId: string,
    job: NormalizedJob,
    profiles: SearchProfile[]
) {
    const supabase = createAdminClient()
    let created = 0

    for (const profile of profiles) {
        const result = scoreJob(job, profile)

        const { error } = await supabase
            .from('job_matches')
            .upsert(
                {
                    job_id: jobId,
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

        if (error) throw new Error(error.message)
        created += 1
    }

    return created
}

async function collectSource(
    sourceName: string,
    runner: () => Promise<NormalizedJob[]>
): Promise<{ jobs: NormalizedJob[]; result: SourceResult }> {
    try {
        const jobs = await runner()

        return {
            jobs,
            result: {
                source_name: sourceName,
                ok: true,
                jobs_found: jobs.length,
            },
        }
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Unknown source error'

        console.error(`[collectJobs] source failed: ${sourceName}`, error)

        return {
            jobs: [],
            result: {
                source_name: sourceName,
                ok: false,
                jobs_found: 0,
                error: message,
            },
        }
    }
}

export async function collectJobs(): Promise<CollectJobsResult> {
    const profiles = await getActiveProfiles()

    const sourceCollections = await Promise.all([
        collectSource('getonboard', getGetOnBoardJobs),
        collectSource('chiletrabajos', getChileTrabajosJobs),
    ])

    const sources = sourceCollections.map((item) => item.result)

    const jobs = dedupeJobsBySourceAndUrl(
        sourceCollections.flatMap((item) => item.jobs)
    )

    let inserted = 0
    let matchesCreated = 0

    for (const job of jobs) {
        const jobId = await upsertJob(job)
        if (!jobId) continue

        inserted += 1
        matchesCreated += await createMatches(jobId, job, profiles)
    }

    return {
        jobs_found: jobs.length,
        jobs_processed: inserted,
        matches_created: matchesCreated,
        sources,
    }
}

function dedupeJobsBySourceAndUrl<T extends { source_name: string; url: string }>(jobs: T[]) {
    const seen = new Set<string>()
    const result: T[] = []

    for (const job of jobs) {
        const key = `${job.source_name}|${job.url}`

        if (seen.has(key)) continue

        seen.add(key)
        result.push(job)
    }

    return result
}