import { NextRequest, NextResponse } from 'next/server'
import { collectJobs } from '@/app/features/jobs/adapters/services/collect-jobs'
import {
    logScrapeRun,
    type CollectResult,
} from '@/lib/monitoring/log-scrape-run'
import { notifyRunHealthChange } from '@/lib/monitoring/notify-run-health-change'
import { getRunHealthFromCollectResult } from '@/lib/monitoring/run-health'
import { markDuplicateJobs } from '@/lib/jobs/mark-duplicate-jobs'

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const internalSecret = process.env.INTERNAL_API_SECRET

    if (!internalSecret) {
        return NextResponse.json(
            { error: 'Missing INTERNAL_API_SECRET' },
            { status: 500 }
        )
    }

    if (authHeader !== `Bearer ${internalSecret}`) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        )
    }

    const startedAt = new Date()

    try {
        const result: CollectResult = await collectJobs()

        let dedupe:
            | {
                scanned: number
                canonical_jobs: number
                duplicates_marked: number
            }
            | null = null

        let dedupeError: string | null = null

        try {
            dedupe = await markDuplicateJobs()
        } catch (error) {
            dedupeError =
                error instanceof Error ? error.message : 'Unknown dedupe error'
            console.error('markDuplicateJobs error:', error)
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
        } catch (logError) {
            console.error('logScrapeRun success error:', logError)
        }

        if (runId) {
            try {
                await notifyRunHealthChange({
                    currentRunId: runId,
                    currentHealth: getRunHealthFromCollectResult(result),
                    result,
                })
            } catch (notifyError) {
                console.error('notifyRunHealthChange success error:', notifyError)
            }
        }

        return NextResponse.json({
            ok: true,
            result,
            dedupe,
            dedupe_error: dedupeError,
        })
    } catch (error) {
        const finishedAt = new Date()
        const message =
            error instanceof Error ? error.message : 'Unknown error'

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
            console.error('logScrapeRun error path failed:', logError)
        }

        if (runId) {
            try {
                await notifyRunHealthChange({
                    currentRunId: runId,
                    currentHealth: 'error',
                    errorMessage: message,
                })
            } catch (notifyError) {
                console.error('notifyRunHealthChange error path failed:', notifyError)
            }
        }

        return NextResponse.json(
            {
                ok: false,
                error: message,
            },
            { status: 500 }
        )
    }
}