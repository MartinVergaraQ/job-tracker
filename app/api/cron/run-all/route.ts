import { NextRequest, NextResponse } from 'next/server'
import { runCollectJob } from '@/lib/jobs/run-collect-job'

export const maxDuration = 300

type InternalCallResult = {
    ok: boolean
    status: number
    body: unknown
}

function getAllowedSecrets() {
    return [
        process.env.CRON_SECRET,
        process.env.INTERNAL_API_SECRET,
    ]
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

function getBaseUrl(request: NextRequest) {
    const isVercel = process.env.VERCEL === '1'
    const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

    if (isVercel && envUrl) {
        return envUrl.replace(/\/$/, '')
    }

    return request.nextUrl.origin
}

async function callInternalEndpoint(params: {
    baseUrl: string
    path: string
}): Promise<InternalCallResult> {
    const internalSecret = process.env.INTERNAL_API_SECRET?.trim()

    if (!internalSecret) {
        return {
            ok: false,
            status: 500,
            body: {
                ok: false,
                error: 'Missing INTERNAL_API_SECRET',
            },
        }
    }

    try {
        const response = await fetch(`${params.baseUrl}${params.path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${internalSecret}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        })

        const body = await response.json().catch(() => null)

        return {
            ok: response.ok,
            status: response.status,
            body,
        }
    } catch (error) {
        return {
            ok: false,
            status: 500,
            body: {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown internal fetch error',
            },
        }
    }
}

async function handleRunAll(request: NextRequest): Promise<Response> {
    const authError = validateCronAuth(request)

    if (authError) {
        return authError
    }

    const startedAt = Date.now()
    const baseUrl = getBaseUrl(request)

    const collect = await runCollectJob()

    if (!collect.ok) {
        return NextResponse.json(
            {
                ok: false,
                duration_ms: Date.now() - startedAt,
                base_url: baseUrl,
                collect,
                enrich: null,
                rescore: null,
                notify: null,
            },
            { status: 500 }
        )
    }

    const enrich = await callInternalEndpoint({
        baseUrl,
        path: '/api/jobs/enrich',
    })

    const rescore = await callInternalEndpoint({
        baseUrl,
        path: '/api/jobs/rescore',
    })

    const notify = await callInternalEndpoint({
        baseUrl,
        path: '/api/notifications/process',
    })

    const ok = collect.ok && enrich.ok && rescore.ok && notify.ok

    return NextResponse.json(
        {
            ok,
            duration_ms: Date.now() - startedAt,
            base_url: baseUrl,
            collect,
            enrich: enrich.body,
            rescore: rescore.body,
            notify: notify.body,
            internal_statuses: {
                enrich: enrich.status,
                rescore: rescore.status,
                notify: notify.status,
            },
        },
        {
            status: ok ? 200 : 500,
        }
    )
}

export async function GET(request: NextRequest): Promise<Response> {
    return handleRunAll(request)
}

export async function POST(request: NextRequest): Promise<Response> {
    return handleRunAll(request)
}