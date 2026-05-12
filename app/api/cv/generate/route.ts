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

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message
    return String(error)
}

function isRetryableAiError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase()

    return (
        message.includes('high demand') ||
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('temporarily unavailable') ||
        message.includes('timeout') ||
        message.includes('overloaded') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('504')
    )
}

async function generateAdaptedCvWithRetry(input: {
    job: any
    profile: any
    cvProfile: any
    applicationPack: any
}) {
    const delays = [800, 1800, 3500]
    let lastError: unknown

    for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
            return await generateAdaptedCv(input)
        } catch (error) {
            lastError = error

            if (!isRetryableAiError(error)) {
                throw error
            }

            if (attempt === delays.length) {
                break
            }

            await sleep(delays[attempt])
        }
    }

    throw lastError
}

async function findExistingPdfFallback(params: {
    supabase: ReturnType<typeof createAdminClient>
    jobId: string
    profileId: string
}) {
    const { supabase, jobId, profileId } = params

    const { data, error } = await supabase
        .from('cv_documents')
        .select(`
      id,
      title,
      format,
      public_url,
      created_at,
      updated_at
    `)
        .eq('job_id', jobId)
        .eq('profile_id', profileId)
        .eq('format', 'pdf')
        .not('public_url', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    return data
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

    try {
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

        try {
            const generated = await generateAdaptedCvWithRetry({
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
                source: 'generated',
                document,
            })
        } catch (generationError) {
            const fallbackPdf = await findExistingPdfFallback({
                supabase,
                jobId: body.jobId,
                profileId: body.profileId,
            })

            if (fallbackPdf) {
                return NextResponse.json({
                    ok: true,
                    source: 'fallback_existing_pdf',
                    warning: 'AI_HIGH_DEMAND',
                    message: 'La IA está con alta demanda. Se devolvió el último PDF disponible.',
                    document: fallbackPdf,
                })
            }

            const retryable = isRetryableAiError(generationError)

            return NextResponse.json(
                {
                    ok: false,
                    error: getErrorMessage(generationError),
                    errorCode: retryable ? 'AI_HIGH_DEMAND' : 'CV_GENERATION_FAILED',
                },
                { status: retryable ? 503 : 500 }
            )
        }
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error: getErrorMessage(error),
            },
            { status: 500 }
        )
    }
}