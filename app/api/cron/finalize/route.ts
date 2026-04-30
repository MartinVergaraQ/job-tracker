import { NextRequest, NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/http/get-base-url'
import { callInternalApi } from '@/lib/http/call-internal-api'

export const maxDuration = 60

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET
    const internalSecret = process.env.INTERNAL_API_SECRET
    const authHeader = request.headers.get('authorization')

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!internalSecret) {
        return NextResponse.json(
            { ok: false, error: 'Missing INTERNAL_API_SECRET' },
            { status: 500 }
        )
    }

    const startedAt = Date.now()
    const baseUrl = getBaseUrl(request)

    const rescore = await callInternalApi(`${baseUrl}/api/jobs/rescore`, internalSecret)
    const notify = await callInternalApi(`${baseUrl}/api/notifications/process`, internalSecret)

    return NextResponse.json({
        ok: rescore.ok && notify.ok,
        duration_ms: Date.now() - startedAt,
        rescore: rescore.body,
        notify: notify.body,
    })
}