import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAdaptedCv } from '@/lib/cv/generate-adapted-cv'

export const maxDuration = 60

type RequestBody = {
    jobId: string
    profileId: string
    applicationPackId?: string | null
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

export async function POST(request: NextRequest) {
    const authError = validateInternalAuth(request)

    if (authError) return authError

    let body: RequestBody

    try {
        body = (await request.json()) as RequestBody
    } catch {
        return NextResponse.json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 }
        )
    }

    if (!body.jobId || !body.profileId) {
        return NextResponse.json(
            { ok: false, error: 'Missing jobId or profileId' },
            { status: 400 }
        )
    }

    const supabase = createAdminClient()

    const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select(`
            id,
            title,
            company,
            location,
            modality,
            seniority,
            description,
            tech_tags,
            url
        `)
        .eq('id', body.jobId)
        .maybeSingle()

    if (jobError) throw new Error(jobError.message)

    if (!job) {
        return NextResponse.json(
            { ok: false, error: 'Job not found' },
            { status: 404 }
        )
    }

    const { data: profile, error: profileError } = await supabase
        .from('search_profiles')
        .select('id, name, slug')
        .eq('id', body.profileId)
        .maybeSingle()

    if (profileError) throw new Error(profileError.message)

    if (!profile) {
        return NextResponse.json(
            { ok: false, error: 'Profile not found' },
            { status: 404 }
        )
    }

    const { data: cvProfile, error: cvProfileError } = await supabase
        .from('cv_profiles')
        .select(`
            headline,
            summary,
            skills,
            experience,
            projects,
            education,
            languages
        `)
        .eq('profile_id', body.profileId)
        .eq('is_active', true)
        .maybeSingle()

    if (cvProfileError) throw new Error(cvProfileError.message)

    const { data: applicationPack, error: packError } = body.applicationPackId
        ? await supabase
            .from('application_packs')
            .select(`
                  id,
                  fit_summary,
                  ats_keywords,
                  missing_keywords,
                  cv_improvements
              `)
            .eq('id', body.applicationPackId)
            .maybeSingle()
        : await supabase
            .from('application_packs')
            .select(`
                  id,
                  fit_summary,
                  ats_keywords,
                  missing_keywords,
                  cv_improvements
              `)
            .eq('job_id', body.jobId)
            .eq('profile_id', body.profileId)
            .maybeSingle()

    if (packError) throw new Error(packError.message)

    const generated = await generateAdaptedCv({
        job,
        profile,
        cvProfile,
        applicationPack,
    })

    const now = new Date().toISOString()

    const { data: document, error: documentError } = await supabase
        .from('cv_documents')
        .upsert(
            {
                job_id: body.jobId,
                profile_id: body.profileId,
                application_pack_id: applicationPack?.id ?? null,
                title: generated.title,
                format: 'html',
                file_path: null,
                public_url: null,
                content_json: {
                    ...generated.contentJson,
                    html: generated.html,
                },
                generated_by: 'ai',
                updated_at: now,
            },
            {
                onConflict: 'job_id,profile_id,format',
            }
        )
        .select('id, title, format, created_at, updated_at')
        .single()

    if (documentError) {
        throw new Error(documentError.message)
    }

    return NextResponse.json({
        ok: true,
        document,
    })
}