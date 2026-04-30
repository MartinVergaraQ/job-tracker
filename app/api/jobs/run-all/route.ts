import { NextRequest, NextResponse } from 'next/server'

type StepName = 'collect' | 'enrich' | 'rescore' | 'notify'

type StepResult = {
    name: StepName
    ok: boolean
    status: number
    duration_ms: number
    result: unknown
    error?: string
}

const STEPS: Array<{
    name: StepName
    path: string
    method: 'POST'
}> = [
        {
            name: 'collect',
            path: '/api/jobs/collect',
            method: 'POST',
        },
        {
            name: 'enrich',
            path: '/api/jobs/enrich',
            method: 'POST',
        },
        {
            name: 'rescore',
            path: '/api/jobs/rescore',
            method: 'POST',
        },
        {
            name: 'notify',
            path: '/api/jobs/notify',
            method: 'POST',
        },
    ]

function getAuthSecret() {
    const internalSecret = process.env.INTERNAL_API_SECRET

    if (!internalSecret) {
        throw new Error('Missing INTERNAL_API_SECRET')
    }

    return internalSecret
}

function isAuthorized(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const internalSecret = process.env.INTERNAL_API_SECRET
    const cronSecret = process.env.CRON_SECRET

    if (!internalSecret) return false

    if (authHeader === `Bearer ${internalSecret}`) {
        return true
    }

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        return true
    }

    return false
}

function getBaseUrl(request: NextRequest) {
    return process.env.INTERNAL_BASE_URL ?? request.nextUrl.origin
}

async function readResponseBody(response: Response) {
    const text = await response.text()

    if (!text.trim()) {
        return null
    }

    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

async function runStep(params: {
    baseUrl: string
    internalSecret: string
    name: StepName
    path: string
    method: 'POST'
}): Promise<StepResult> {
    const startedAt = Date.now()

    try {
        const response = await fetch(`${params.baseUrl}${params.path}`, {
            method: params.method,
            headers: {
                authorization: `Bearer ${params.internalSecret}`,
                'content-type': 'application/json',
            },
            cache: 'no-store',
        })

        const body = await readResponseBody(response)
        const durationMs = Date.now() - startedAt

        if (!response.ok) {
            return {
                name: params.name,
                ok: false,
                status: response.status,
                duration_ms: durationMs,
                result: body,
                error:
                    typeof body === 'object' &&
                        body !== null &&
                        'error' in body &&
                        typeof body.error === 'string'
                        ? body.error
                        : `Step ${params.name} failed with status ${response.status}`,
            }
        }

        return {
            name: params.name,
            ok: true,
            status: response.status,
            duration_ms: durationMs,
            result: body,
        }
    } catch (error) {
        return {
            name: params.name,
            ok: false,
            status: 500,
            duration_ms: Date.now() - startedAt,
            result: null,
            error: error instanceof Error ? error.message : 'Unknown step error',
        }
    }
}

async function handler(request: NextRequest) {
    const startedAt = Date.now()

    if (!isAuthorized(request)) {
        return NextResponse.json(
            {
                ok: false,
                error: 'Unauthorized',
            },
            { status: 401 }
        )
    }

    let internalSecret: string

    try {
        internalSecret = getAuthSecret()
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Missing config',
            },
            { status: 500 }
        )
    }

    const baseUrl = getBaseUrl(request)
    const steps: StepResult[] = []

    for (const step of STEPS) {
        const result = await runStep({
            baseUrl,
            internalSecret,
            name: step.name,
            path: step.path,
            method: step.method,
        })

        steps.push(result)

        if (!result.ok) {
            return NextResponse.json(
                {
                    ok: false,
                    failed_step: result.name,
                    duration_ms: Date.now() - startedAt,
                    base_url: baseUrl,
                    steps,
                },
                { status: 500 }
            )
        }
    }

    const collect = steps.find((step) => step.name === 'collect')?.result
    const enrich = steps.find((step) => step.name === 'enrich')?.result
    const rescore = steps.find((step) => step.name === 'rescore')?.result
    const notify = steps.find((step) => step.name === 'notify')?.result

    return NextResponse.json({
        ok: true,
        duration_ms: Date.now() - startedAt,
        base_url: baseUrl,
        collect,
        enrich,
        rescore,
        notify,
        steps,
    })
}

export async function GET(request: NextRequest) {
    return handler(request)
}

export async function POST(request: NextRequest) {
    return handler(request)
}