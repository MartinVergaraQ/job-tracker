import { NextRequest, NextResponse } from 'next/server'
import { enrichDuolaboralJobs } from '@/app/features/jobs/adapters/duolaboral/enrich-duolaboral-jobs'

export const maxDuration = 60

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

    try {
        const result = await enrichDuolaboralJobs(20)

        return NextResponse.json({
            ok: true,
            result,
        })
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