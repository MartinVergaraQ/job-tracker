import { createAdminClient } from '@/lib/supabase/admin'
import { scoreJob } from '../core/score-job'
import type { NormalizedJob, SearchProfile } from '../../types/job'
import type { JobModality, JobSeniority } from '../../types/job'

type JobRow = {
    id: string
    source_name: string
    source_type: string
    external_id: string | null
    url: string
    title: string
    company: string
    location: string | null
    modality: string | null
    seniority: string | null
    salary_text: string | null
    description: string | null
    tech_tags: string[] | null
    published_at: string | null
    scraped_at: string | null
}

type RescoreResult = {
    scanned: number
    rescored: number
    matches_upserted: number
}

const DEFAULT_LIMIT = 250

const EXCLUDED_SOURCES = new Set([
    'duolaboral',
])

async function getActiveProfiles() {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('search_profiles')
        .select('*')
        .eq('is_active', true)

    if (error) throw new Error(error.message)

    return (data ?? []) as SearchProfile[]
}

function toNormalizedJob(job: JobRow): NormalizedJob {
    const VALID_SOURCE_TYPES = ['mock', 'api', 'rss', 'html', 'browser'] as const
    const VALID_MODALITIES: JobModality[] = ['remote', 'hybrid', 'onsite', 'unknown']
    const VALID_SENIORITIES: JobSeniority[] = [
        'junior',
        'semi-senior',
        'senior',
        'trainee',
        'unknown',
    ]

    const sourceType = VALID_SOURCE_TYPES.includes(
        job.source_type as (typeof VALID_SOURCE_TYPES)[number]
    )
        ? (job.source_type as (typeof VALID_SOURCE_TYPES)[number])
        : 'html'

    const modality: JobModality =
        job.modality && VALID_MODALITIES.includes(job.modality as JobModality)
            ? (job.modality as JobModality)
            : 'unknown'

    const seniority: JobSeniority =
        job.seniority && VALID_SENIORITIES.includes(job.seniority as JobSeniority)
            ? (job.seniority as JobSeniority)
            : 'unknown'

    return {
        source_name: job.source_name,
        source_type: sourceType,
        external_id: job.external_id ?? '',
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        modality,
        seniority,
        salary_text: job.salary_text,
        description: job.description,
        tech_tags: job.tech_tags ?? [],
        published_at: job.published_at,
        scraped_at: job.scraped_at ?? new Date().toISOString(),
    }
}

function hasSeniorSenioritySignal(value: string) {
    const text = value.toLowerCase()

    return (
        text.includes('semi senior') ||
        text.includes('semisenior') ||
        text.includes('semi-senior') ||
        text.includes('senior') ||
        text.includes(' sr ') ||
        text.includes('sr.') ||
        text.includes('lead') ||
        text.includes('architect') ||
        text.includes('arquitecto')
    )
}

function isJuniorProfile(profile: SearchProfile) {
    const text = `${profile.slug} ${profile.name} ${profile.preferred_seniority?.join(' ') ?? ''}`.toLowerCase()

    return (
        text.includes('junior') ||
        text.includes('jr') ||
        text.includes('trainee') ||
        text.includes('practicante')
    )
}

function getSeniorityPenalty(params: {
    job: NormalizedJob
    profile: SearchProfile
}) {
    const jobText = [
        params.job.title,
        params.job.seniority,
        params.job.description ?? '',
    ].join(' ')

    if (!isJuniorProfile(params.profile)) {
        return {
            penalty: 0,
            reason: null as string | null,
        }
    }

    if (hasSeniorSenioritySignal(jobText)) {
        return {
            penalty: -80,
            reason: 'Penalización: la oferta parece Senior/Semi Senior y el perfil es Junior.',
        }
    }

    return {
        penalty: 0,
        reason: null as string | null,
    }
}

function getStackMismatchPenalty(params: {
    job: NormalizedJob
    profile: SearchProfile
}) {
    const text = [
        params.job.title,
        params.job.description ?? '',
        ...(params.job.tech_tags ?? []),
    ]
        .join(' ')
        .toLowerCase()

    const profileText = [
        params.profile.slug,
        params.profile.name,
        ...(params.profile.include_keywords ?? []),
    ]
        .join(' ')
        .toLowerCase()

    const isMartinBackend =
        profileText.includes('martin') ||
        profileText.includes('backend') ||
        profileText.includes('node') ||
        profileText.includes('react') ||
        profileText.includes('next')

    const hasMainStack =
        text.includes('node') ||
        text.includes('node.js') ||
        text.includes('react') ||
        text.includes('next') ||
        text.includes('next.js') ||
        text.includes('typescript') ||
        text.includes('javascript') ||
        text.includes('php') ||
        text.includes('laravel') ||
        text.includes('angular')

    const hasDotnetFocus =
        text.includes('c#') ||
        text.includes('.net') ||
        text.includes('asp.net') ||
        text.includes('dotnet')

    const hasJavaFocus =
        text.includes('java') ||
        text.includes('spring') ||
        text.includes('spring boot') ||
        text.includes('j2ee') ||
        text.includes('microservicios java')

    const hasCloudHeavyFocus =
        text.includes('aws') ||
        text.includes('azure') ||
        text.includes('gcp') ||
        text.includes('kubernetes') ||
        text.includes('terraform')

    const hasGoFocus =
        text.includes(' golang ') ||
        text.includes(' go ') ||
        text.includes('go developer')

    if (isMartinBackend && hasDotnetFocus && !hasMainStack) {
        return {
            penalty: -90,
            reason: 'Penalización fuerte: oferta centrada en C#/.NET, fuera del stack principal del perfil.',
        }
    }

    if (isMartinBackend && hasJavaFocus && !hasMainStack) {
        return {
            penalty: -90,
            reason: 'Penalización fuerte: oferta centrada en Java/Spring, fuera del stack principal del perfil.',
        }
    }

    if (isMartinBackend && hasGoFocus && !hasMainStack) {
        return {
            penalty: -80,
            reason: 'Penalización fuerte: oferta centrada en Go/Golang, fuera del stack principal del perfil.',
        }
    }

    if (isMartinBackend && hasCloudHeavyFocus && !hasMainStack) {
        return {
            penalty: -60,
            reason: 'Penalización: oferta muy centrada en cloud/devops sin stack principal del perfil.',
        }
    }

    return {
        penalty: 0,
        reason: null as string | null,
    }
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function getJobSearchText(job: NormalizedJob) {
    return normalizeText(
        [
            job.title,
            job.company,
            job.location ?? '',
            job.modality,
            job.seniority,
            job.salary_text ?? '',
            job.description ?? '',
            ...(job.tech_tags ?? []),
        ].join(' ')
    )
}

function getHardExcludeResult(params: {
    job: NormalizedJob
    profile: SearchProfile
}) {
    const text = getJobSearchText(params.job)

    const excludedKeyword = (params.profile.exclude_keywords ?? []).find((keyword) => {
        const normalizedKeyword = normalizeText(keyword)

        return normalizedKeyword.length > 0 && text.includes(normalizedKeyword)
    })

    if (!excludedKeyword) {
        return {
            blocked: false,
            reason: null as string | null,
        }
    }

    return {
        blocked: true,
        reason: `Descartado: contiene keyword excluida del perfil: "${excludedKeyword}".`,
    }
}

function applyPostScoreRules(params: {
    job: NormalizedJob
    profile: SearchProfile
    score: number
    isMatch: boolean
    reasons: string[]
}) {
    let score = params.score
    const reasons = [...params.reasons]

    const hardExclude = getHardExcludeResult({
        job: params.job,
        profile: params.profile,
    })

    if (hardExclude.blocked) {
        if (hardExclude.reason) {
            reasons.push(hardExclude.reason)
        }

        return {
            score: 0,
            is_match: false,
            reasons,
        }
    }

    const seniorityPenalty = getSeniorityPenalty({
        job: params.job,
        profile: params.profile,
    })

    score += seniorityPenalty.penalty

    if (seniorityPenalty.reason) {
        reasons.push(seniorityPenalty.reason)
    }

    const stackPenalty = getStackMismatchPenalty({
        job: params.job,
        profile: params.profile,
    })

    score += stackPenalty.penalty

    if (stackPenalty.reason) {
        reasons.push(stackPenalty.reason)
    }

    score = Math.max(0, Math.round(score))

    const minScore = Number(params.profile.min_score ?? 60)
    const isMatch = params.isMatch && score >= minScore

    return {
        score,
        is_match: isMatch,
        reasons,
    }
}

export async function rescoreDuolaboralJobs(
    limit = DEFAULT_LIMIT
): Promise<RescoreResult> {
    const supabase = createAdminClient()
    const profiles = await getActiveProfiles()

    const { data: jobs, error } = await supabase
        .from('jobs')
        .select(`
            id,
            source_name,
            source_type,
            external_id,
            url,
            title,
            company,
            location,
            modality,
            seniority,
            salary_text,
            description,
            tech_tags,
            published_at,
            scraped_at
        `)
        .eq('is_active', true)
        .eq('is_canonical', true)
        .not('description', 'is', null)
        .order('scraped_at', { ascending: false })
        .limit(limit)

    if (error) {
        throw new Error(error.message)
    }

    let rescored = 0
    let matchesUpserted = 0

    for (const rawJob of (jobs ?? []) as JobRow[]) {
        if (EXCLUDED_SOURCES.has(rawJob.source_name)) {
            continue
        }

        const job = toNormalizedJob(rawJob)

        for (const profile of profiles) {
            const baseResult = scoreJob(job, profile)

            const result = applyPostScoreRules({
                job,
                profile,
                score: baseResult.score,
                isMatch: baseResult.is_match,
                reasons: baseResult.reasons,
            })

            const { error: upsertError } = await supabase
                .from('job_matches')
                .upsert(
                    {
                        job_id: rawJob.id,
                        profile_id: profile.id,
                        score: result.score,
                        is_match: result.is_match,
                        reasons: result.reasons,
                    },
                    {
                        onConflict: 'job_id,profile_id',
                        ignoreDuplicates: false,
                    }
                )

            if (upsertError) {
                throw new Error(upsertError.message)
            }

            matchesUpserted += 1
        }

        rescored += 1
    }

    return {
        scanned: jobs?.length ?? 0,
        rescored,
        matches_upserted: matchesUpserted,
    }
}