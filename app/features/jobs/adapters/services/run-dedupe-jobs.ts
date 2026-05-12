import { createAdminClient } from '@/lib/supabase/admin'

export type RunDedupeJobsResult = {
    ok: boolean
    scanned: number
    canonical_jobs: number
    duplicates_marked: number
    error?: string
}

type JobRow = {
    id: string
    fingerprint: string | null
}

export async function runDedupeJobs(): Promise<RunDedupeJobsResult> {
    try {
        const supabase = createAdminClient()

        const { data, error } = await supabase
            .from('jobs')
            .select('id, fingerprint')
            .not('fingerprint', 'is', null)

        if (error) {
            throw new Error(error.message)
        }

        const jobs = (data ?? []) as JobRow[]

        const groups = new Map<string, JobRow[]>()

        for (const job of jobs) {
            if (!job.fingerprint) continue

            const current = groups.get(job.fingerprint) ?? []
            current.push(job)
            groups.set(job.fingerprint, current)
        }

        let canonicalJobs = 0
        let duplicatesMarked = 0

        for (const [, group] of groups) {
            if (group.length === 0) continue

            canonicalJobs += 1

            if (group.length > 1) {
                duplicatesMarked += group.length - 1
            }
        }

        return {
            ok: true,
            scanned: jobs.length,
            canonical_jobs: canonicalJobs,
            duplicates_marked: duplicatesMarked,
        }
    } catch (error) {
        return {
            ok: false,
            scanned: 0,
            canonical_jobs: 0,
            duplicates_marked: 0,
            error: error instanceof Error ? error.message : 'Unknown dedupe error',
        }
    }
}