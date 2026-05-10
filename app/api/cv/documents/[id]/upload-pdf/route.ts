import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadCvPdf } from '@/lib/storage/upload-cv-pdf'

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
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
        .slice(0, 90)
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const authError = validateInternalAuth(request)

    if (authError) return authError

    const { id } = await params
    const supabase = createAdminClient()

    const { data: document, error } = await supabase
        .from('cv_documents')
        .select(`
            id,
            job_id,
            profile_id,
            application_pack_id,
            title,
            format,
            content_json,
            jobs (
                title,
                company
            )
        `)
        .eq('id', id)
        .maybeSingle()

    if (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
        )
    }

    if (!document) {
        return NextResponse.json(
            { ok: false, error: 'CV document not found' },
            { status: 404 }
        )
    }

    const html = document.content_json?.html

    if (!html || typeof html !== 'string') {
        return NextResponse.json(
            { ok: false, error: 'CV document has no HTML content' },
            { status: 400 }
        )
    }

    let pdfBytes: Uint8Array

    try {
        const { renderHtmlToPdf } = await import('@/lib/pdf/render-html-to-pdf')
        pdfBytes = await renderHtmlToPdf(html)
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                step: 'render_pdf_import_or_render',
                error: error instanceof Error ? error.message : 'Unknown PDF render error',
            },
            { status: 500 }
        )
    }

    const pdf = Buffer.from(pdfBytes)

    const relatedJob = Array.isArray(document.jobs)
        ? document.jobs[0]
        : document.jobs

    const jobTitle = relatedJob?.title ?? 'cv-adaptado'
    const company = relatedJob?.company ?? 'empresa'
    const filename = `CV Martin Vergara - ${jobTitle} - ${company}`

    let uploaded: {
        bucket: string
        filePath: string
        publicUrl: string
    }

    try {
        uploaded = await uploadCvPdf({
            profileId: document.profile_id,
            jobId: document.job_id,
            filename: `${safeFilename(filename)}.pdf`,
            pdf,
        })
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                step: 'upload_pdf',
                error: error instanceof Error ? error.message : 'Unknown upload error',
            },
            { status: 500 }
        )
    }

    const { error: updateError } = await supabase
        .from('cv_documents')
        .update({
            format: 'pdf',
            file_path: uploaded.filePath,
            public_url: uploaded.publicUrl,
            updated_at: new Date().toISOString(),
        })
        .eq('id', document.id)

    if (updateError) {
        return NextResponse.json(
            {
                ok: false,
                step: 'update_cv_document',
                error: updateError.message,
            },
            { status: 500 }
        )
    }

    return NextResponse.json({
        ok: true,
        document: {
            id: document.id,
            title: document.title,
            format: 'pdf',
            file_path: uploaded.filePath,
            public_url: uploaded.publicUrl,
        },
    })
}