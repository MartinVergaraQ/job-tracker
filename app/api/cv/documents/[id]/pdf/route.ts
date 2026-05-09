import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderHtmlToPdf } from '@/lib/pdf/render-html-to-pdf'

export const maxDuration = 60

type RouteParams = {
    params: Promise<{
        id: string
    }>
}

function validateInternalAuth(request: NextRequest) {
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

function safeFilename(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .slice(0, 80)
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const authError = validateInternalAuth(request)

    if (authError) return authError

    const { id } = await params
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('cv_documents')
        .select('id, title, format, content_json')
        .eq('id', id)
        .maybeSingle()

    if (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
        )
    }

    if (!data) {
        return NextResponse.json(
            { ok: false, error: 'CV document not found' },
            { status: 404 }
        )
    }

    const html = data.content_json?.html

    if (!html || typeof html !== 'string') {
        return NextResponse.json(
            { ok: false, error: 'CV document has no HTML content' },
            { status: 400 }
        )
    }

    const pdf = await renderHtmlToPdf(html)
    const filename = `${safeFilename(data.title ?? 'cv-martin-vergara')}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'no-store',
        },
    })
}