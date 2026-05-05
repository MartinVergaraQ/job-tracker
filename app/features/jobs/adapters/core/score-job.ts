import type { NormalizedJob, SearchProfile } from '../../types/job'

export type JobScoreResult = {
    score: number
    is_match: boolean
    reasons: string[]
}

const SENIOR_PATTERNS = [
    /\bsenior\b/i,
    /\bsr\b/i,
    /\bsemi senior\b/i,
    /\bsemi-senior\b/i,
    /\bssr\b/i,
    /\blead\b/i,
    /\btech lead\b/i,
    /\bprincipal\b/i,
    /\bstaff\b/i,
    /\barchitect\b/i,
    /\barquitecto\b/i,
    /\bjef[ea]\b/i,
    /\bhead\b/i,
    /\bmanager\b/i,
    /\bcoordinador\b/i,
    /\bespecialista\b/i,
]

const JUNIOR_PATTERNS = [
    /\bjunior\b/i,
    /\bjr\b/i,
    /\btrainee\b/i,
    /\bpracticante\b/i,
    /\bentry level\b/i,
    /\bsin experiencia\b/i,
]

const YEARS_PATTERNS = [
    /(\d+)\s*\+?\s*años/i,
    /(\d+)\s*\+?\s*years/i,
    /experiencia\s*(?:de)?\s*(\d+)/i,
]

function buildHaystack(job: NormalizedJob) {
    return [
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
        .toLowerCase()
}

function textMatchesAny(text: string, patterns: RegExp[]) {
    return patterns.some((pattern) => pattern.test(text))
}

function getRequiredYears(text: string) {
    for (const pattern of YEARS_PATTERNS) {
        const match = text.match(pattern)

        if (!match?.[1]) continue

        const years = Number(match[1])

        if (Number.isFinite(years)) {
            return years
        }
    }

    return null
}

function profileWantsJunior(profile: SearchProfile) {
    return profile.preferred_seniority.some((level) => {
        const normalized = level.toLowerCase()

        return (
            normalized === 'junior' ||
            normalized === 'trainee' ||
            normalized.includes('junior') ||
            normalized.includes('trainee')
        )
    })
}

function profileAllowsSenior(profile: SearchProfile) {
    return profile.preferred_seniority.some((level) => {
        const normalized = level.toLowerCase()

        return (
            normalized === 'senior' ||
            normalized === 'semi-senior' ||
            normalized.includes('senior') ||
            normalized.includes('lead') ||
            normalized.includes('staff')
        )
    })
}

function profileAllowsSeniority(profile: SearchProfile, seniority: string) {
    return profile.preferred_seniority.some(
        (level) => level.toLowerCase() === seniority.toLowerCase()
    )
}

export function scoreJob(
    job: NormalizedJob,
    profile: SearchProfile
): JobScoreResult {
    const haystack = buildHaystack(job)

    let score = 0
    const reasons: string[] = []

    const wantsJunior = profileWantsJunior(profile)
    const allowsSenior = profileAllowsSenior(profile)

    const hasSeniorText = textMatchesAny(haystack, SENIOR_PATTERNS)
    const hasJuniorText = textMatchesAny(haystack, JUNIOR_PATTERNS)
    const requiredYears = getRequiredYears(haystack)

    /**
     * Filtro fuerte:
     * Si el perfil es junior y la oferta claramente es Senior/Lead/Staff,
     * la bajamos fuerte aunque tenga muchas keywords técnicas.
     */
    if (wantsJunior && !allowsSenior) {
        if (job.seniority === 'senior' || hasSeniorText) {
            score -= 80
            reasons.push('Penalización fuerte: oferta Senior/Lead para perfil Junior')
        }

        if (requiredYears !== null && requiredYears >= 4) {
            score -= 40
            reasons.push(`Penalización: pide ${requiredYears}+ años de experiencia`)
        }

        if (requiredYears !== null && requiredYears >= 6) {
            score -= 30
            reasons.push(`Penalización fuerte: pide ${requiredYears}+ años`)
        }
    }

    /**
     * Keywords positivas.
     */
    for (const keyword of profile.include_keywords) {
        const kw = keyword.trim().toLowerCase()

        if (kw && haystack.includes(kw)) {
            score += 12
            reasons.push(`Coincide con "${keyword}"`)
        }
    }

    /**
     * Keywords excluyentes.
     */
    for (const keyword of profile.exclude_keywords) {
        const kw = keyword.trim().toLowerCase()

        if (kw && haystack.includes(kw)) {
            score -= 35
            reasons.push(`Contiene excluyente "${keyword}"`)
        }
    }

    /**
     * Bonus si la oferta dice junior/trainee y el perfil busca junior.
     */
    if (wantsJunior && hasJuniorText) {
        score += 25
        reasons.push('Señal positiva: oferta Junior/Trainee')
    }

    /**
     * Modalidad.
     */
    if (
        job.modality !== 'unknown' &&
        profile.preferred_modalities.includes(job.modality)
    ) {
        score += 10
        reasons.push(`Modalidad preferida: ${job.modality}`)
    }

    /**
     * Ubicación.
     */
    const location = (job.location ?? '').toLowerCase()

    if (
        location &&
        profile.preferred_locations.some((pref) =>
            location.includes(pref.toLowerCase())
        )
    ) {
        score += 8
        reasons.push('Ubicación alineada')
    }

    /**
     * Seniority.
     */
    if (job.seniority !== 'unknown') {
        if (profileAllowsSeniority(profile, job.seniority)) {
            score += 15
            reasons.push(`Seniority compatible: ${job.seniority}`)
        } else {
            score -= 35
            reasons.push(`Seniority no preferida: ${job.seniority}`)
        }
    }

    /**
     * Regla final de seguridad:
     * aunque haya muchas keywords, una oferta senior no debe pasar
     * para un perfil junior.
     */
    if (wantsJunior && !allowsSenior && (job.seniority === 'senior' || hasSeniorText)) {
        return {
            score,
            is_match: false,
            reasons,
        }
    }

    if (wantsJunior && requiredYears !== null && requiredYears >= 5) {
        return {
            score,
            is_match: false,
            reasons,
        }
    }

    return {
        score,
        is_match: score >= profile.min_score,
        reasons,
    }
}