import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

function getAllowedSecrets() {
    return [process.env.CRON_SECRET, process.env.INTERNAL_API_SECRET]
        .map((value) => value?.trim())
        .filter(Boolean) as string[]
}

function validateAuth(request: NextRequest): NextResponse | null {
    const authHeader = request.headers.get('authorization')
    const allowedSecrets = getAllowedSecrets()

    if (allowedSecrets.length === 0) {
        return NextResponse.json(
            { ok: false, error: 'Missing CRON_SECRET or INTERNAL_API_SECRET' },
            { status: 500 }
        )
    }

    const isAuthorized = allowedSecrets.some(
        (secret) => authHeader === `Bearer ${secret}`
    )

    if (!isAuthorized) {
        return NextResponse.json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 }
        )
    }

    return null
}

export async function GET(request: NextRequest) {
    const authError = validateAuth(request)
    if (authError) return authError

    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    const version = process.env.WHATSAPP_API_VERSION?.trim() || 'v21.0'
    const testTo = process.env.WHATSAPP_TEST_TO?.trim()

    if (!token || !phoneNumberId || !testTo) {
        return NextResponse.json(
            {
                ok: false,
                error:
                    'Missing WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TEST_TO',
            },
            { status: 500 }
        )
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

    const payload = {
        messaging_product: 'whatsapp',
        to: testTo,
        type: 'text',
        text: {
            body: 'Prueba directa desde debug/whatsapp',
        },
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    const body = await response.json().catch(() => null)

    return NextResponse.json(
        {
            ok: response.ok,
            status: response.status,
            url,
            phoneNumberId,
            testTo,
            body,
        },
        { status: response.ok ? 200 : 500 }
    )
}