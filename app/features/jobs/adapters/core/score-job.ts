import type { NormalizedJob, SearchProfile } from '../../types/job'

export type JobScoreResult = {
    score: number
    is_match: boolean
    reasons: string[]
}

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

export function scoreJob(
    job: NormalizedJob,
    profile: SearchProfile
): JobScoreResult {
    const haystack = buildHaystack(job)
    let score = 0
    const reasons: string[] = []

    for (const keyword of profile.include_keywords) {
        const kw = keyword.trim().toLowerCase()
        if (kw && haystack.includes(kw)) {
            score += 12
            reasons.push(`Coincide con "${keyword}"`)
        }
    }

    for (const keyword of profile.exclude_keywords) {
        const kw = keyword.trim().toLowerCase()
        if (kw && haystack.includes(kw)) {
            score -= 20
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

    if (
        job.seniority !== 'unknown' &&
        profile.preferred_seniority.some(
            (level) => level.toLowerCase() === job.seniority.toLowerCase()
        )
    ) {
        score += 8
        reasons.push(`Seniority compatible: ${job.seniority}`)
    }

    return {
        score,
        is_match: score >= profile.min_score,
        reasons,
    }
}