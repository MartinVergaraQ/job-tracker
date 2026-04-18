import { NextRequest, NextResponse } from 'next/server'
import { collectJobs } from '@/app/features/jobs/adapters/services/collect-jobs'
import { logScrapeRun } from '@/lib/monitoring/log-scrape-run'

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
        const result = await collectJobs()
        const finishedAt = new Date()

        try {
            await logScrapeRun({
                status: 'success',
                startedAt,
                finishedAt,
                result,
            })
        } catch (logError) {
            console.error('logScrapeRun success error:', logError)
        }

        return NextResponse.json({ ok: true, result })
    } catch (error) {
        const finishedAt = new Date()
        const message =
            error instanceof Error ? error.message : 'Unknown error'

        try {
            await logScrapeRun({
                status: 'error',
                startedAt,
                finishedAt,
                errorMessage: message,
            })
        } catch (logError) {
            console.error('logScrapeRun error path failed:', logError)
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