import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/notifications/send-whatsapp-message'

function validateInternalAuth(request: NextRequest): NextResponse | null {
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

    return null
}

export async function GET(request: NextRequest): Promise<Response> {
    const authError = validateInternalAuth(request)

    if (authError) {
        return authError
    }

    try {
        const result = await sendWhatsAppMessage({
            body: [
                '✅ Job Tracker conectado con WhatsApp.',
                '',
                'Próximo paso: enviarte los mejores matches por acá.',
            ].join('\n'),
        })

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