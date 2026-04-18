import { NextRequest } from 'next/server'
import { collectJobs } from '@/app/features/jobs/adapters/services/collect-jobs'

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const expected = `Bearer ${process.env.COLLECTOR_SECRET}`

    if (!process.env.COLLECTOR_SECRET) {
        return Response.json(
            { error: 'Missing COLLECTOR_SECRET' },
            { status: 500 }
        )
    }

    if (authHeader !== expected) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const result = await collectJobs()
        return Response.json({ ok: true, result })
    } catch (error) {
        return Response.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}