import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    return new NextResponse(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    })
}