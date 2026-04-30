import { createAdminClient } from '@/lib/supabase/admin'

type JobRow = {
    id: string
    title: string
    company: string | null
    location: string | null
    source_name: string | null
    description: string | null
    published_at: string | null
    dedupe_key: string | null
}

const SOURCE_PRIORITY: Record<string, number> = {
    duolaboral: 4,
    getonboard: 3,
    linkedin_email_alerts: 2,
    chiletrabajos: 1,
}

function getSourcePriority(sourceName: string | null) {
    if (!sourceName) return 0
    return SOURCE_PRIORITY[sourceName] ?? 0
}

function getPublishedAtTime(value: string | null) {
    if (!value) return 0
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? 0 : time
}

function getDescriptionScore(value: string | null) {
    return (value ?? '').trim().length
}

function chooseCanonicalJob(jobs: JobRow[]) {
    return [...jobs].sort((a, b) => {
        const descriptionDiff = getDescriptionScore(b.description) - getDescriptionScore(a.description)
        if (descriptionDiff !== 0) return descriptionDiff

        const sourceDiff = getSourcePriority(b.source_name) - getSourcePriority(a.source_name)
        if (sourceDiff !== 0) return sourceDiff

        return getPublishedAtTime(b.published_at) - getPublishedAtTime(a.published_at)
    })[0]
}

export async function markDuplicateJobs() {
    const supabase = createAdminClient()

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
        .from('jobs')
        .select(`
            id,
            title,
            company,
            location,
            source_name,
            description,
            published_at,
            dedupe_key
        `)
        .gte('published_at', since)
        .not('dedupe_key', 'is', null)
        .order('published_at', { ascending: false })
        .limit(2000)

    if (error) {
        throw new Error(error.message)
    }

    const jobs = (data ?? []) as JobRow[]
    const grouped = new Map<string, JobRow[]>()

    for (const job of jobs) {
        if (!job.dedupe_key) continue

        const list = grouped.get(job.dedupe_key) ?? []
        list.push(job)
        grouped.set(job.dedupe_key, list)
    }

    let canonicalCount = 0
    let duplicateCount = 0

    for (const [, group] of grouped) {
        if (group.length === 1) {
            const only = group[0]

            const { error: updateError } = await supabase
                .from('jobs')
                .update({
                    is_canonical: true,
                    canonical_job_id: null,
                })
                .eq('id', only.id)

            if (updateError) {
                throw new Error(updateError.message)
            }

            canonicalCount += 1
            continue
        }

        const canonical = chooseCanonicalJob(group)
        const duplicateIds = group
            .filter((job) => job.id !== canonical.id)
            .map((job) => job.id)

        const { error: canonicalError } = await supabase
            .from('jobs')
            .update({
                is_canonical: true,
                canonical_job_id: null,
            })
            .eq('id', canonical.id)

        if (canonicalError) {
            throw new Error(canonicalError.message)
        }

        canonicalCount += 1

        if (duplicateIds.length > 0) {
            const { error: duplicateError } = await supabase
                .from('jobs')
                .update({
                    is_canonical: false,
                    canonical_job_id: canonical.id,
                })
                .in('id', duplicateIds)

            if (duplicateError) {
                throw new Error(duplicateError.message)
            }

            duplicateCount += duplicateIds.length
        }
    }

    return {
        scanned: jobs.length,
        canonical_jobs: canonicalCount,
        duplicates_marked: duplicateCount,
    }
}