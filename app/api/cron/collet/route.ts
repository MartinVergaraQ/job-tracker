import { NextRequest, NextResponse } from 'next/server'
import { runCollectJob } from '@/lib/jobs/run-collect-job'

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
        return NextResponse.json(
            { ok: false, error: 'Missing CRON_SECRET' },
            { status: 500 }
        )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 }
        )
    }

    const result = await runCollectJob()

    return NextResponse.json(result, {
        status: result.ok ? 200 : 500,
    })
}