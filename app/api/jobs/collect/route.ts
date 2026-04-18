import { NextRequest, NextResponse } from 'next/server'
import { collectJobs } from '@/app/features/jobs/adapters/services/collect-jobs'

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

    try {
        const result = await collectJobs()
        return NextResponse.json({ ok: true, result })
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}