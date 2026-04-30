import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

function getBaseUrl(request: NextRequest) {
    return new URL(request.url).origin
}

async function parseResponse(response: Response) {
    const contentType = response.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
        return response.json().catch(() => null)
    }

    return {
        ok: false,
        status: response.status,
        text: await response.text().catch(() => ''),
    }
}

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET
    const internalSecret = process.env.INTERNAL_API_SECRET
    const authHeader = request.headers.get('authorization')

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 }
        )
    }

    if (!internalSecret) {
        return NextResponse.json(
            { ok: false, error: 'Missing INTERNAL_API_SECRET' },
            { status: 500 }
        )
    }

    const baseUrl = getBaseUrl(request)

    const headers = {
        Authorization: `Bearer ${internalSecret}`,
        'Content-Type': 'application/json',
    }

    const startedAt = Date.now()

    const collectResponse = await fetch(`${baseUrl}/api/jobs/collect`, {
        method: 'POST',
        headers,
        cache: 'no-store',
    })
    const collectJson = await parseResponse(collectResponse)

    const enrichResponse = await fetch(`${baseUrl}/api/jobs/enrich`, {
        method: 'POST',
        headers,
        cache: 'no-store',
    })
    const enrichJson = await parseResponse(enrichResponse)

    const rescoreResponse = await fetch(`${baseUrl}/api/jobs/rescore`, {
        method: 'POST',
        headers,
        cache: 'no-store',
    })
    const rescoreJson = await parseResponse(rescoreResponse)

    const notifyResponse = await fetch(`${baseUrl}/api/notifications/process`, {
        method: 'POST',
        headers,
        cache: 'no-store',
    })
    const notifyJson = await parseResponse(notifyResponse)

    return NextResponse.json({
        ok:
            collectResponse.ok &&
            enrichResponse.ok &&
            rescoreResponse.ok &&
            notifyResponse.ok,
        duration_ms: Date.now() - startedAt,
        base_url: baseUrl,
        collect: collectJson,
        enrich: enrichJson,
        rescore: rescoreJson,
        notify: notifyJson,
    })
}