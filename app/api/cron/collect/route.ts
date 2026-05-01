import { NextRequest, NextResponse } from 'next/server'
import { runCollectJob } from '@/lib/jobs/run-collect-job'

export const maxDuration = 300

function getExpectedSecret() {
    return process.env.CRON_SECRET ?? process.env.INTERNAL_API_SECRET ?? null
}

function validateCronAuth(request: NextRequest): NextResponse | null {
    const authHeader = request.headers.get('authorization')
    const expectedSecret = getExpectedSecret()

    if (!expectedSecret) {
        return NextResponse.json(
            {
                ok: false,
                error: 'Missing CRON_SECRET or INTERNAL_API_SECRET',
            },
            { status: 500 }
        )
    }

    if (authHeader !== `Bearer ${expectedSecret}`) {
        return NextResponse.json(
            {
                ok: false,
                error: 'Unauthorized',
            },
            { status: 401 }
        )
    }

    return null
}

async function handleCollect(request: NextRequest): Promise<Response> {
    const authError = validateCronAuth(request)

    if (authError) {
        return authError
    }

    const result = await runCollectJob()

    return NextResponse.json(result, {
        status: result.ok ? 200 : 500,
    })
}

export async function GET(request: NextRequest): Promise<Response> {
    return handleCollect(request)
}

export async function POST(request: NextRequest): Promise<Response> {
    return handleCollect(request)
}