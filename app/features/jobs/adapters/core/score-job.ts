import type { NormalizedJob, SearchProfile } from '../../types/job'

export type JobScoreResult = {
    score: number
    is_match: boolean
    reasons: string[]
}

function normalizeText(value: string | null | undefined) {
    return (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s.+#-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function buildHaystack(job: NormalizedJob) {
    return normalizeText(
        [
            job.title,
            job.company,
            job.location,
            job.description,
            ...(job.tech_tags ?? []),
            job.modality,
            job.seniority,
        ]
            .filter(Boolean)
            .join(' ')
    )
}

function includesTerm(haystack: string, term: string) {
    const normalizedTerm = normalizeText(term)

    if (!normalizedTerm) return false

    return haystack.includes(normalizedTerm)
}

function titleHasAny(job: NormalizedJob, terms: string[]) {
    const title = normalizeText(job.title)

    return terms.some((term) => includesTerm(title, term))
}

function haystackHasAny(haystack: string, terms: string[]) {
    return terms.some((term) => includesTerm(haystack, term))
}

function clampScore(score: number) {
    if (score < 0) return 0
    if (score > 100) return 100
    return score
}

const SENIOR_TERMS = [
    'senior',
    'sr',
    'lead',
    'lider',
    'principal',
    'staff',
    'architect',
    'arquitecto',
    'jefe',
    'head',
    'manager',
    'tech lead',
]

const JUNIOR_TERMS = [
    'junior',
    'jr',
    'trainee',
    'practica',
    'practicante',
    'entry level',
    'sin experiencia',
    'egresado',
]

const BACKEND_ROLE_TERMS = [
    'backend',
    'back end',
    'desarrollador backend',
    'developer backend',
    'api',
    'apis',
    'rest',
]

const FULLSTACK_ROLE_TERMS = [
    'fullstack',
    'full stack',
    'desarrollador full stack',
    'desarrollador fullstack',
]

const FRONTEND_ROLE_TERMS = [
    'frontend',
    'front end',
    'react',
    'next',
    'next.js',
    'nextjs',
]

const CORE_TECH_TERMS = [
    'node',
    'node.js',
    'typescript',
    'javascript',
    'sql',
    'postgres',
    'mysql',
    'mongodb',
    'react',
    'next',
    'next.js',
    'nextjs',
    'express',
    'nestjs',
]

function profilePrefersJunior(profile: SearchProfile) {
    return profile.preferred_seniority.some((item) => {
        const value = normalizeText(item)
        return value === 'junior' || value === 'trainee'
    })
}

function profileAllowsSenior(profile: SearchProfile) {
    return profile.preferred_seniority.some((item) => {
        const value = normalizeText(item)
        return value === 'senior' || value === 'semi-senior'
    })
}

export function scoreJob(
    job: NormalizedJob,
    profile: SearchProfile
): JobScoreResult {
    const haystack = buildHaystack(job)
    let score = 0
    const reasons: string[] = []

    const prefersJunior = profilePrefersJunior(profile)
    const allowsSenior = profileAllowsSenior(profile)

    const hasSeniorInTitle = titleHasAny(job, SENIOR_TERMS)
    const hasJuniorInTitle = titleHasAny(job, JUNIOR_TERMS)

    if (prefersJunior && hasSeniorInTitle && !allowsSenior) {
        score -= 45
        reasons.push('Castigo fuerte: cargo parece Senior/Lead')
    }

    if (prefersJunior && hasJuniorInTitle) {
        score += 22
        reasons.push('Cargo alineado a Junior/Trainee')
    }

    if (
        job.seniority !== 'unknown' &&
        profile.preferred_seniority.some(
            (level) => normalizeText(level) === normalizeText(job.seniority)
        )
    ) {
        score += 15
        reasons.push(`Seniority compatible: ${job.seniority}`)
    }

    if (hasSeniorInTitle && job.seniority === 'senior' && prefersJunior && !allowsSenior) {
        score -= 20
        reasons.push('Seniority detectada como senior')
    }

    const hasBackendRole = haystackHasAny(haystack, BACKEND_ROLE_TERMS)
    const hasFullstackRole = haystackHasAny(haystack, FULLSTACK_ROLE_TERMS)
    const hasFrontendRole = haystackHasAny(haystack, FRONTEND_ROLE_TERMS)
    const hasCoreTech = haystackHasAny(haystack, CORE_TECH_TERMS)

    if (hasBackendRole) {
        score += 18
        reasons.push('Rol relacionado a Backend')
    }

    if (hasFullstackRole) {
        score += 14
        reasons.push('Rol relacionado a Full Stack')
    }

    if (hasFrontendRole) {
        score += 8
        reasons.push('Tiene tecnologías Frontend útiles')
    }

    if (hasCoreTech) {
        score += 12
        reasons.push('Tiene tecnologías principales del perfil')
    }

    let includeHits = 0

    for (const keyword of profile.include_keywords) {
        if (includesTerm(haystack, keyword)) {
            includeHits += 1
            reasons.push(`Coincide con "${keyword}"`)
        }
    }

    score += Math.min(includeHits * 6, 30)

    for (const keyword of profile.exclude_keywords) {
        if (includesTerm(haystack, keyword)) {
            score -= 35
            reasons.push(`Contiene excluyente "${keyword}"`)
        }
    }

    if (
        job.modality !== 'unknown' &&
        profile.preferred_modalities.includes(job.modality)
    ) {
        score += 10
        reasons.push(`Modalidad preferida: ${job.modality}`)
    }

    const location = normalizeText(job.location)

    if (
        location &&
        profile.preferred_locations.some((pref) =>
            location.includes(normalizeText(pref))
        )
    ) {
        score += 8
        reasons.push('Ubicación alineada')
    }

    if (!hasBackendRole && !hasFullstackRole && !hasCoreTech) {
        score -= 25
        reasons.push('No parece rol técnico alineado')
    }

    const finalScore = clampScore(score)

    return {
        score: finalScore,
        is_match: finalScore >= profile.min_score,
        reasons: reasons.slice(0, 10),
    }
}