import { NextRequest, NextResponse } from 'next/server'
import { runDedupeJobs } from '@/app/features/jobs/adapters/services/run-dedupe-jobs'

export const maxDuration = 60

function getAllowedSecrets() {
    return [process.env.CRON_SECRET, process.env.INTERNAL_API_SECRET]
        .map((value) => value?.trim())
        .filter(Boolean) as string[]
}

function validateCronAuth(request: NextRequest): NextResponse | null {
    const authHeader = request.headers.get('authorization')
    const allowedSecrets = getAllowedSecrets()

    if (allowedSecrets.length === 0) {
        return NextResponse.json(
            {
                ok: false,
                error: 'Missing CRON_SECRET or INTERNAL_API_SECRET',
            },
            { status: 500 }
        )
    }

    const isAuthorized = allowedSecrets.some(
        (secret) => authHeader === `Bearer ${secret}`
    )

    if (!isAuthorized) {
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

async function handleDedupe(request: NextRequest): Promise<Response> {
    const authError = validateCronAuth(request)

    if (authError) {
        return authError
    }

    const result = await runDedupeJobs()

    return NextResponse.json(result, {
        status: result.ok ? 200 : 500,
    })
}

export async function GET(request: NextRequest): Promise<Response> {
    return handleDedupe(request)
}

export async function POST(request: NextRequest): Promise<Response> {
    return handleDedupe(request)
}