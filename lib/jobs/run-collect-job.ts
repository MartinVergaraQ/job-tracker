import { collectJobs } from '@/app/features/jobs/adapters/services/collect-jobs'
import {
    logScrapeRun,
    type CollectResult,
} from '@/lib/monitoring/log-scrape-run'
import { notifyRunHealthChange } from '@/lib/monitoring/notify-run-health-change'
import { getRunHealthFromCollectResult } from '@/lib/monitoring/run-health'
import { markDuplicateJobs } from '@/lib/jobs/mark-duplicate-jobs'

type DedupeResult = {
    scanned: number
    canonical_jobs: number
    duplicates_marked: number
}

type RunCollectJobResult =
    | {
        ok: true
        result: CollectResult
        dedupe: DedupeResult | null
        dedupe_error: string | null
    }
    | {
        ok: false
        error: string
    }

export async function runCollectJob(): Promise<RunCollectJobResult> {
    const startedAt = new Date()

    try {
        const result: CollectResult = await collectJobs()

        let dedupe: DedupeResult | null = null
        let dedupeError: string | null = null

        try {
            dedupe = await markDuplicateJobs()
        } catch (error) {
            dedupeError =
                error instanceof Error ? error.message : 'Unknown dedupe error'

            console.error('[runCollectJob] markDuplicateJobs error:', error)
        }

        const finishedAt = new Date()

        let runId: string | null = null

        try {
            const logResult = await logScrapeRun({
                status: 'success',
                startedAt,
                finishedAt,
                result,
            })

            runId = logResult.runId
        } catch (error) {
            console.error('[runCollectJob] logScrapeRun success error:', error)
        }

        if (runId) {
            try {
                await notifyRunHealthChange({
                    currentRunId: runId,
                    currentHealth: getRunHealthFromCollectResult(result),
                    result,
                })
            } catch (error) {
                console.error(
                    '[runCollectJob] notifyRunHealthChange success error:',
                    error
                )
            }
        }

        return {
            ok: true,
            result,
            dedupe,
            dedupe_error: dedupeError,
        }
    } catch (error) {
        const finishedAt = new Date()
        const message =
            error instanceof Error ? error.message : 'Unknown collect error'

        let runId: string | null = null

        try {
            const logResult = await logScrapeRun({
                status: 'error',
                startedAt,
                finishedAt,
                errorMessage: message,
            })

            runId = logResult.runId
        } catch (logError) {
            console.error('[runCollectJob] logScrapeRun error path failed:', logError)
        }

        if (runId) {
            try {
                await notifyRunHealthChange({
                    currentRunId: runId,
                    currentHealth: 'error',
                    errorMessage: message,
                })
            } catch (notifyError) {
                console.error(
                    '[runCollectJob] notifyRunHealthChange error path failed:',
                    notifyError
                )
            }
        }

        return {
            ok: false,
            error: message,
        }
    }
}