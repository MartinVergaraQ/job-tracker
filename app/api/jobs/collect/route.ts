import { NextRequest, NextResponse } from 'next/server'
import { runCollectJob } from '@/lib/jobs/run-collect-job'

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const internalSecret = process.env.INTERNAL_API_SECRET

    if (!internalSecret) {
        return NextResponse.json(
            { ok: false, error: 'Missing INTERNAL_API_SECRET' },
            { status: 500 }
        )
    }

    if (authHeader !== `Bearer ${internalSecret}`) {
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