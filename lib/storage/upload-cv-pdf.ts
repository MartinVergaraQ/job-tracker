import { createAdminClient } from '@/lib/supabase/admin'

type UploadCvPdfParams = {
    profileId: string
    jobId: string
    filename: string
    pdf: Buffer
}

const CV_BUCKET = process.env.SUPABASE_CV_BUCKET?.trim() || 'cv-documents'

function cleanPathPart(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
}

export async function uploadCvPdf({
    profileId,
    jobId,
    filename,
    pdf,
}: UploadCvPdfParams) {
    const supabase = createAdminClient()

    const cleanFilename = cleanPathPart(filename.replace(/\.pdf$/i, '')) + '.pdf'

    const filePath = [
        cleanPathPart(profileId),
        cleanPathPart(jobId),
        cleanFilename,
    ].join('/')

    const { error: uploadError } = await supabase.storage
        .from(CV_BUCKET)
        .upload(filePath, pdf, {
            contentType: 'application/pdf',
            upsert: true,
        })

    if (uploadError) {
        throw new Error(`Failed to upload CV PDF: ${uploadError.message}`)
    }

    const { data } = supabase.storage.from(CV_BUCKET).getPublicUrl(filePath)

    return {
        bucket: CV_BUCKET,
        filePath,
        publicUrl: data.publicUrl,
    }
}