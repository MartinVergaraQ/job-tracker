import type { NormalizedJob, SearchProfile } from '../../types/job'

export type JobScoreResult = {
    score: number
    is_match: boolean
    reasons: string[]
}

type RuleResult = {
    score: number
    reasons: string[]
    hardReject: boolean
}

const JUNIOR_SIGNALS = [
    'junior',
    'jr',
    'trainee',
    'practicante',
    'práctica',
    'practica',
    'entry level',
    'sin experiencia',
    'egresado',
    'recién egresado',
    'recien egresado',
]

const MID_SIGNALS = [
    'semi senior',
    'semisenior',
    'semi-senior',
    'ssr',
]

const SENIOR_SIGNALS = [
    'senior',
    'sr',
    'lead',
    'líder',
    'lider',
    'staff',
    'principal',
    'architect',
    'arquitecto',
    'manager',
    'jefe',
    'head',
]

const QA_SIGNALS = [
    'qa',
    'quality assurance',
    'tester',
    'testing',
    'automatizador qa',
    'analista qa',
    'calidad software',
    'especialista en calidad',
]

const DATA_SENIOR_SIGNALS = [
    'data engineer senior',
    'data pipeline senior',
    'python + java',
    'java + sql',
    'big data',
    'spark',
    'scala',
]

const GOOD_BACKEND_SIGNALS = [
    'backend',
    'back-end',
    'api',
    'apis',
    'rest',
    'node',
    'node.js',
    'nestjs',
    'express',
    'typescript',
    'javascript',
    'sql',
    'postgres',
    'postgresql',
    'mysql',
    'mongodb',
]

const GOOD_FULLSTACK_SIGNALS = [
    'full stack',
    'fullstack',
    'react',
    'next',
    'next.js',
    'angular',
]

const BAD_ROLE_SIGNALS = [
    'product manager',
    'project manager',
    'scrum master',
    'business analyst',
    'analista funcional',
    'soporte ti',
    'soporte técnico',
    'mesa de ayuda',
    'helpdesk',
    'devops senior',
    'sre senior',
    'mobile senior',
]

function normalizeText(value: string | null | undefined) {
    return (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s.+#/-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function includesAny(text: string, terms: string[]) {
    return terms.some((term) => text.includes(normalizeText(term)))
}

function countMatches(text: string, terms: string[]) {
    return terms.filter((term) => text.includes(normalizeText(term))).length
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

function buildTitleText(job: NormalizedJob) {
    return normalizeText(job.title)
}

function profileAllowsSenior(profile: SearchProfile) {
    return profile.preferred_seniority.some((level) =>
        ['senior', 'lead', 'staff', 'principal'].includes(
            normalizeText(level)
        )
    )
}

function profileAllowsQa(profile: SearchProfile) {
    const haystack = normalizeText(
        [
            profile.name,
            profile.slug,
            ...(profile.include_keywords ?? []),
            ...(profile.preferred_seniority ?? []),
        ].join(' ')
    )

    return includesAny(haystack, ['qa', 'tester', 'testing', 'calidad'])
}

function seniorityRules(job: NormalizedJob, profile: SearchProfile): RuleResult {
    const title = buildTitleText(job)
    const text = buildHaystack(job)
    const reasons: string[] = []
    let score = 0
    let hardReject = false

    const hasJunior = includesAny(title, JUNIOR_SIGNALS) || includesAny(text, JUNIOR_SIGNALS)
    const hasMid = includesAny(title, MID_SIGNALS) || includesAny(text, MID_SIGNALS)
    const hasSenior = includesAny(title, SENIOR_SIGNALS)
    const allowsSenior = profileAllowsSenior(profile)

    if (hasJunior) {
        score += 28
        reasons.push('Señal fuerte: oferta Junior/Trainee')
    }

    if (hasMid) {
        score += 10
        reasons.push('Señal aceptable: Semi Senior')
    }

    if (hasSenior && !allowsSenior && !hasJunior) {
        score -= 90
        hardReject = true
        reasons.push('Descartado: cargo Senior/Lead no compatible con perfil actual')
    }

    if (
        job.seniority !== 'unknown' &&
        profile.preferred_seniority.some(
            (level) => normalizeText(level) === normalizeText(job.seniority)
        )
    ) {
        score += 12
        reasons.push(`Seniority compatible: ${job.seniority}`)
    }

    return { score, reasons, hardReject }
}

function roleRules(job: NormalizedJob, profile: SearchProfile): RuleResult {
    const title = buildTitleText(job)
    const text = buildHaystack(job)
    const reasons: string[] = []
    let score = 0
    let hardReject = false

    const backendCount = countMatches(text, GOOD_BACKEND_SIGNALS)
    const fullstackCount = countMatches(text, GOOD_FULLSTACK_SIGNALS)

    if (includesAny(title, ['backend', 'back-end'])) {
        score += 32
        reasons.push('Rol principal Backend')
    }

    if (includesAny(title, ['full stack', 'fullstack'])) {
        score += 24
        reasons.push('Rol relacionado a Full Stack')
    }

    if (backendCount >= 2) {
        score += Math.min(backendCount * 7, 35)
        reasons.push('Tiene tecnologías principales del perfil')
    }

    if (fullstackCount >= 2) {
        score += Math.min(fullstackCount * 5, 20)
        reasons.push('Tiene tecnologías Frontend útiles')
    }

    if (includesAny(title, QA_SIGNALS) && !profileAllowsQa(profile)) {
        score -= 80
        hardReject = true
        reasons.push('Descartado: rol QA/Testing no es objetivo principal')
    }

    if (includesAny(title, BAD_ROLE_SIGNALS)) {
        score -= 55
        hardReject = true
        reasons.push('Descartado: rol fuera del foco Backend/Full Stack Junior')
    }

    if (includesAny(text, DATA_SENIOR_SIGNALS) && !profileAllowsSenior(profile)) {
        score -= 45
        reasons.push('Penalización: foco Data/Senior no alineado')
    }

    return { score, reasons, hardReject }
}

function keywordRules(job: NormalizedJob, profile: SearchProfile): RuleResult {
    const haystack = buildHaystack(job)
    const reasons: string[] = []
    let score = 0
    let hardReject = false

    for (const keyword of profile.include_keywords) {
        const kw = normalizeText(keyword)

        if (!kw) continue

        if (haystack.includes(kw)) {
            score += 8
            reasons.push(`Coincide con "${keyword}"`)
        }
    }

    for (const keyword of profile.exclude_keywords) {
        const kw = normalizeText(keyword)

        if (!kw) continue

        if (haystack.includes(kw)) {
            score -= 70
            hardReject = true
            reasons.push(`Descartado por excluyente "${keyword}"`)
        }
    }

    return { score, reasons, hardReject }
}

function modalityRules(job: NormalizedJob, profile: SearchProfile): RuleResult {
    const reasons: string[] = []
    let score = 0

    if (
        job.modality !== 'unknown' &&
        profile.preferred_modalities.includes(job.modality)
    ) {
        score += 12
        reasons.push(`Modalidad preferida: ${job.modality}`)
    }

    return { score, reasons, hardReject: false }
}

function locationRules(job: NormalizedJob, profile: SearchProfile): RuleResult {
    const location = normalizeText(job.location)
    const reasons: string[] = []
    let score = 0

    if (
        location &&
        profile.preferred_locations.some((pref) =>
            location.includes(normalizeText(pref))
        )
    ) {
        score += 8
        reasons.push('Ubicación alineada')
    }

    return { score, reasons, hardReject: false }
}

export function scoreJob(
    job: NormalizedJob,
    profile: SearchProfile
): JobScoreResult {
    const rules = [
        seniorityRules(job, profile),
        roleRules(job, profile),
        keywordRules(job, profile),
        modalityRules(job, profile),
        locationRules(job, profile),
    ]

    let score = 0
    const reasons: string[] = []
    let hardReject = false

    for (const rule of rules) {
        score += rule.score
        reasons.push(...rule.reasons)

        if (rule.hardReject) {
            hardReject = true
        }
    }

    const cleanReasons = Array.from(new Set(reasons))

    return {
        score,
        is_match: !hardReject && score >= profile.min_score,
        reasons: cleanReasons,
    }
}