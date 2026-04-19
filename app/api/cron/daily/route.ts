import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

function getBaseUrl(request: NextRequest) {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL
    if (envUrl) return envUrl

    const host = request.headers.get('host')
    const protocol = host?.includes('localhost') ? 'http' : 'https'

    return `${protocol}://${host}`
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

    const collectJson = await collectResponse.json().catch(() => null)

    const enrichResponse = await fetch(`${baseUrl}/api/jobs/enrich`, {
        method: 'POST',
        headers,
        cache: 'no-store',
    })

    const enrichJson = await enrichResponse.json().catch(() => null)

    const rescoreResponse = await fetch(`${baseUrl}/api/jobs/rescore`, {
        method: 'POST',
        headers,
        cache: 'no-store',
    })

    const rescoreJson = await rescoreResponse.json().catch(() => null)

    const notifyResponse = await fetch(`${baseUrl}/api/notifications/process`, {
        method: 'POST',
        headers,
        cache: 'no-store',
    })

    const notifyJson = await notifyResponse.json().catch(() => null)

    return NextResponse.json({
        ok:
            collectResponse.ok &&
            enrichResponse.ok &&
            rescoreResponse.ok &&
            notifyResponse.ok,
        duration_ms: Date.now() - startedAt,
        collect: collectJson,
        enrich: enrichJson,
        rescore: rescoreJson,
        notify: notifyJson,
    })
}