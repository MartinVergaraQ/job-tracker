import { createAdminClient } from '@/lib/supabase/admin'
import {
    getCvVariantLabel,
    suggestCvVariant,
    type CvVariant,
} from '@/lib/applications/cv-variants'

type JobRow = {
    id: string
    title: string
    company: string | null
    location: string | null
    modality: string | null
    seniority: string | null
    salary_text: string | null
    source_name: string | null
    url: string | null
    description: string | null
    tech_tags: string[] | null
}

type SearchProfileRow = {
    id: string
    name: string
    slug: string
    include_keywords: string[] | null
    exclude_keywords: string[] | null
    preferred_locations: string[] | null
    preferred_modalities: string[] | null
    preferred_seniority: string[] | null
}

type JobMatchRow = {
    id: string
    score: number
    reasons: string[] | null
    is_match: boolean
}

type JobApplicationRow = {
    job_id: string
    profile_id: string
    status: string
    cv_variant: string | null
    notes: string | null
}

type ApplicationPackRow = {
    id: string
    job_id: string
    profile_id: string
    recommended_cv_variant: string
    fit_summary: string
    ats_keywords: string[]
    missing_keywords: string[]
    cv_improvements: string[]
    cover_letter: string
    recruiter_message: string
    form_answers: unknown
    checklist: unknown
    generated_by: string
    created_at: string
    updated_at: string
}

const ATS_KEYWORDS = [
    'node',
    'node.js',
    'typescript',
    'javascript',
    'react',
    'next.js',
    'sql',
    'postgresql',
    'mysql',
    'mongodb',
    'api',
    'apis',
    'rest',
    'backend',
    'frontend',
    'fullstack',
    'tailwind',
    'git',
    'github',
    'supabase',
    'express',
    'nest',
    'laravel',
    'php',
    'scrum',
    'agile',
    'remoto',
    'híbrido',
    'presencial',
]

function normalizeText(value: string | null | undefined) {
    return value?.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') ?? ''
}

function uniqueStrings(values: string[]) {
    return Array.from(
        new Set(
            values
                .map((value) => value.trim())
                .filter(Boolean)
        )
    )
}

function extractAtsKeywords(params: {
    job: JobRow
    match: JobMatchRow | null
}) {
    const text = normalizeText(
        [
            params.job.title,
            params.job.company,
            params.job.location,
            params.job.modality,
            params.job.seniority,
            params.job.description,
            ...(params.job.tech_tags ?? []),
            ...(params.match?.reasons ?? []),
        ]
            .filter(Boolean)
            .join(' ')
    )

    const detected = ATS_KEYWORDS.filter((keyword) => {
        return text.includes(normalizeText(keyword))
    })

    return uniqueStrings([...(params.job.tech_tags ?? []), ...detected]).slice(0, 18)
}

function getMissingKeywords(params: {
    atsKeywords: string[]
    profile: SearchProfileRow
}) {
    const profileText = normalizeText(
        [
            ...(params.profile.include_keywords ?? []),
            params.profile.slug,
            params.profile.name,
        ].join(' ')
    )

    return params.atsKeywords
        .filter((keyword) => !profileText.includes(normalizeText(keyword)))
        .slice(0, 8)
}

function buildFitSummary(params: {
    job: JobRow
    profile: SearchProfileRow
    match: JobMatchRow | null
    recommendedCvVariant: CvVariant
}) {
    const company = params.job.company ?? 'la empresa'
    const score = params.match?.score ?? 0
    const cvLabel = getCvVariantLabel(params.recommendedCvVariant)

    const reasons = params.match?.reasons?.slice(0, 3) ?? []

    return [
        `Esta oferta para "${params.job.title}" en ${company} calza con el perfil "${params.profile.name}" con score ${score}.`,
        `La variante recomendada de CV es "${cvLabel}".`,
        reasons.length
            ? `Motivos principales: ${reasons.join('; ')}.`
            : `El encaje se basa principalmente en el título, tecnologías detectadas y preferencias del perfil.`,
    ].join(' ')
}

function buildCvImprovements(params: {
    job: JobRow
    atsKeywords: string[]
    missingKeywords: string[]
    recommendedCvVariant: CvVariant
}) {
    const improvements: string[] = []

    improvements.push(
        `Usar el CV "${getCvVariantLabel(params.recommendedCvVariant)}" para esta postulación.`
    )

    if (params.atsKeywords.length > 0) {
        improvements.push(
            `Asegurar que el CV mencione naturalmente: ${params.atsKeywords
                .slice(0, 8)
                .join(', ')}.`
        )
    }

    if (params.missingKeywords.length > 0) {
        improvements.push(
            `Revisar si puedes agregar evidencia real de: ${params.missingKeywords.join(', ')}.`
        )
    }

    improvements.push(
        'Priorizar logros concretos: proyectos, APIs, bases de datos, despliegues o mejoras medibles.'
    )

    if (params.job.description) {
        improvements.push(
            'Alinear el resumen profesional con las primeras responsabilidades mencionadas en la oferta.'
        )
    }

    return improvements
}

function buildRecruiterMessage(params: {
    job: JobRow
    profile: SearchProfileRow
    atsKeywords: string[]
}) {
    const company = params.job.company ?? 'su empresa'
    const keywords = params.atsKeywords.slice(0, 5).join(', ')

    return [
        `Hola, vi la oferta de ${params.job.title} en ${company} y me interesó mucho.`,
        keywords
            ? `Tengo experiencia práctica relacionada con ${keywords}, y estoy buscando una oportunidad donde pueda aportar desde el desarrollo y seguir creciendo.`
            : `Estoy buscando una oportunidad donde pueda aportar desde el desarrollo y seguir creciendo.`,
        `Quedo atento por si mi perfil calza con lo que están buscando. Muchas gracias.`,
    ].join(' ')
}

function buildCoverLetter(params: {
    job: JobRow
    profile: SearchProfileRow
    atsKeywords: string[]
}) {
    const company = params.job.company ?? 'la empresa'
    const location = params.job.location ?? 'la ubicación indicada'
    const keywords = params.atsKeywords.slice(0, 6).join(', ')

    return [
        `Hola equipo de ${company},`,
        ``,
        `Me interesa postular al cargo de ${params.job.title}. La oportunidad me llamó la atención porque se alinea con mi perfil ${params.profile.name} y con mi interés por seguir creciendo profesionalmente.`,
        ``,
        keywords
            ? `En mi experiencia y proyectos he trabajado con tecnologías y conceptos relacionados con ${keywords}. Me interesa aportar con responsabilidad, aprendizaje rápido y foco en resolver problemas reales.`
            : `Me interesa aportar con responsabilidad, aprendizaje rápido y foco en resolver problemas reales.`,
        ``,
        `Estoy disponible para conversar y profundizar cómo mi perfil puede aportar al equipo. La modalidad/ubicación indicada es ${location}.`,
        ``,
        `Saludos,`,
        `Martín Vergara`,
    ].join('\n')
}

function buildFormAnswers(params: {
    job: JobRow
    recommendedCvVariant: CvVariant
}) {
    return [
        {
            question: '¿Por qué te interesa esta oferta?',
            answer: `Me interesa porque el cargo de ${params.job.title} se alinea con mi perfil y con mi objetivo de seguir creciendo profesionalmente en tecnología.`,
        },
        {
            question: '¿Cuál es tu disponibilidad?',
            answer: 'Tengo disponibilidad para avanzar en el proceso y coordinar entrevista según los horarios del equipo.',
        },
        {
            question: '¿Modalidad preferida?',
            answer:
                params.job.modality === 'remote'
                    ? 'Tengo preferencia por modalidad remota y cuento con condiciones para trabajar de forma autónoma.'
                    : 'Estoy abierto a conversar la modalidad según las necesidades del cargo.',
        },
        {
            question: '¿Qué CV usar?',
            answer: getCvVariantLabel(params.recommendedCvVariant),
        },
    ]
}

function buildChecklist(params: {
    job: JobRow
    recommendedCvVariant: CvVariant
    missingKeywords: string[]
}) {
    return [
        {
            label: `Usar CV: ${getCvVariantLabel(params.recommendedCvVariant)}`,
            done: false,
        },
        {
            label: 'Revisar que el cargo, empresa y link estén correctos.',
            done: false,
        },
        {
            label: 'Adaptar el resumen del CV a la oferta.',
            done: false,
        },
        {
            label: params.missingKeywords.length
                ? `Evaluar agregar keywords reales: ${params.missingKeywords.join(', ')}.`
                : 'No hay keywords críticas faltantes detectadas.',
            done: false,
        },
        {
            label: 'Guardar evidencia de la postulación en el sistema.',
            done: false,
        },
        {
            label: 'Programar seguimiento si postulas.',
            done: false,
        },
    ]
}

async function getJob(jobId: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('jobs')
        .select(`
            id,
            title,
            company,
            location,
            modality,
            seniority,
            salary_text,
            source_name,
            url,
            description,
            tech_tags
        `)
        .eq('id', jobId)
        .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Job not found')

    return data as JobRow
}

async function getProfile(profileId: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('search_profiles')
        .select(`
            id,
            name,
            slug,
            include_keywords,
            exclude_keywords,
            preferred_locations,
            preferred_modalities,
            preferred_seniority
        `)
        .eq('id', profileId)
        .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Search profile not found')

    return data as SearchProfileRow
}

async function getMatch(jobId: string, profileId: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('job_matches')
        .select('id, score, reasons, is_match')
        .eq('job_id', jobId)
        .eq('profile_id', profileId)
        .maybeSingle()

    if (error) throw new Error(error.message)

    return (data ?? null) as JobMatchRow | null
}

async function getApplication(jobId: string, profileId: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('job_applications')
        .select('job_id, profile_id, status, cv_variant, notes')
        .eq('job_id', jobId)
        .eq('profile_id', profileId)
        .maybeSingle()

    if (error) throw new Error(error.message)

    return (data ?? null) as JobApplicationRow | null
}

export async function buildApplicationPack(params: {
    jobId: string
    profileId: string
}) {
    const supabase = createAdminClient()

    const [job, profile, match, application] = await Promise.all([
        getJob(params.jobId),
        getProfile(params.profileId),
        getMatch(params.jobId, params.profileId),
        getApplication(params.jobId, params.profileId),
    ])

    const recommendedCvVariant =
        (application?.cv_variant as CvVariant | null) ??
        suggestCvVariant({
            title: job.title,
            description: job.description,
            reasons: match?.reasons ?? [],
            profileSlug: profile.slug,
            company: job.company,
            sourceName: job.source_name,
        })

    const atsKeywords = extractAtsKeywords({ job, match })
    const missingKeywords = getMissingKeywords({ atsKeywords, profile })

    const fitSummary = buildFitSummary({
        job,
        profile,
        match,
        recommendedCvVariant,
    })

    const cvImprovements = buildCvImprovements({
        job,
        atsKeywords,
        missingKeywords,
        recommendedCvVariant,
    })

    const recruiterMessage = buildRecruiterMessage({
        job,
        profile,
        atsKeywords,
    })

    const coverLetter = buildCoverLetter({
        job,
        profile,
        atsKeywords,
    })

    const formAnswers = buildFormAnswers({
        job,
        recommendedCvVariant,
    })

    const checklist = buildChecklist({
        job,
        recommendedCvVariant,
        missingKeywords,
    })

    const now = new Date().toISOString()

    const { data, error } = await supabase
        .from('application_packs')
        .upsert(
            {
                job_id: params.jobId,
                profile_id: params.profileId,
                recommended_cv_variant: recommendedCvVariant,
                fit_summary: fitSummary,
                ats_keywords: atsKeywords,
                missing_keywords: missingKeywords,
                cv_improvements: cvImprovements,
                cover_letter: coverLetter,
                recruiter_message: recruiterMessage,
                form_answers: formAnswers,
                checklist,
                generated_by: 'rules',
                updated_at: now,
            },
            {
                onConflict: 'job_id,profile_id',
                ignoreDuplicates: false,
            }
        )
        .select(`
            id,
            job_id,
            profile_id,
            recommended_cv_variant,
            fit_summary,
            ats_keywords,
            missing_keywords,
            cv_improvements,
            cover_letter,
            recruiter_message,
            form_answers,
            checklist,
            generated_by,
            created_at,
            updated_at
        `)
        .single()

    if (error) {
        throw new Error(error.message)
    }

    return data as ApplicationPackRow
}