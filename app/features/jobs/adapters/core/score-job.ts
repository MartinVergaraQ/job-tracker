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
    'sr.',
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
    'especialista',
    'advanced',
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

const EXPERIENCE_HEAVY_SIGNALS = [
    '3 años',
    '3+ años',
    '4 años',
    '4+ años',
    '5 años',
    '5+ años',
    '6 años',
    '20+',
    '20 años',
    'experiencia comprobable',
    'experiencia solida',
    'experiencia sólida',
    'experiencia avanzada',
    'experiencia senior',
]

const JAVA_TITLE_SIGNALS = [
    'backend java',
    'desarrollador java',
    'java developer',
    'spring boot',
    'java spring',
]

const DOTNET_TITLE_SIGNALS = [
    'c#',
    '.net',
    'asp.net',
    'dotnet',
]

const INTERMEDIATE_SIGNALS = [
    'intermedio',
    'semi senior',
    'semisenior',
    'semi-senior',
    'ssr',
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

function strictJuniorHardRejectRules(
    job: NormalizedJob,
    profile: SearchProfile
): RuleResult {
    const title = buildTitleText(job)
    const text = buildHaystack(job)

    const reasons: string[] = []
    let score = 0
    let hardReject = false

    const strictJunior = profileIsStrictJunior(profile)
    const allowsSenior = profileAllowsSenior(profile)

    if (!strictJunior) {
        return { score, reasons, hardReject }
    }

    if (includesAny(title, SENIOR_SIGNALS) && !allowsSenior) {
        score -= 300
        hardReject = true
        reasons.push('Descartado: cargo Senior/Lead no compatible con perfil Junior')
    }

    if (includesAny(title, INTERMEDIATE_SIGNALS)) {
        score -= 180
        hardReject = true
        reasons.push('Descartado: cargo Intermedio/Semi Senior no compatible con perfil Junior actual')
    }

    if (includesAny(text, EXPERIENCE_HEAVY_SIGNALS) && !allowsSenior) {
        score -= 180
        hardReject = true
        reasons.push('Descartado: pide experiencia mayor a perfil Junior')
    }

    if (includesAny(title, JAVA_TITLE_SIGNALS)) {
        score -= 160
        hardReject = true
        reasons.push('Descartado: cargo centrado en Java/Spring, fuera del foco principal actual')
    }

    if (includesAny(title, DOTNET_TITLE_SIGNALS)) {
        score -= 160
        hardReject = true
        reasons.push('Descartado: cargo centrado en C#/.NET, fuera del foco principal actual')
    }

    return { score, reasons, hardReject }
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

function hasExactTitleSignal(title: string, signals: string[]) {
    const normalizedTitle = normalizeText(title)

    return signals.some((signal) => {
        const normalizedSignal = normalizeText(signal)

        if (!normalizedSignal) return false

        const pattern = new RegExp(`(^|\\s|/|-)${normalizedSignal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|/|-|$)`, 'i')

        return pattern.test(normalizedTitle)
    })
}

function profileIsStrictJunior(profile: SearchProfile) {
    const text = normalizeText(
        [
            profile.slug,
            profile.name,
            ...(profile.preferred_seniority ?? []),
        ].join(' ')
    )

    return (
        text.includes('junior') ||
        text.includes('jr') ||
        text.includes('trainee')
    )
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

    const hasMidInTitle = hasExactTitleSignal(title, MID_SIGNALS)
    const hasSeniorInTitle = hasExactTitleSignal(title, SENIOR_SIGNALS)

    const allowsSenior = profileAllowsSenior(profile)
    const strictJunior = profileIsStrictJunior(profile)

    if (hasSeniorInTitle && !allowsSenior) {
        score -= 150
        hardReject = true
        reasons.push('Descartado: cargo Senior/Lead no compatible con perfil Junior')
    }

    if (hasMidInTitle && strictJunior) {
        score -= 110
        hardReject = true
        reasons.push('Descartado: cargo Semi Senior no compatible con perfil Junior actual')
    }

    if (hasJunior) {
        score += 32
        reasons.push('Señal fuerte: oferta Junior/Trainee')
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
        strictJuniorHardRejectRules(job, profile),
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

    if (hardReject) {
        return {
            score: Math.max(0, Math.round(score)),
            is_match: false,
            reasons: cleanReasons,
        }
    }

    return {
        score: Math.max(0, Math.round(score)),
        is_match: score >= profile.min_score,
        reasons: cleanReasons,
    }
}