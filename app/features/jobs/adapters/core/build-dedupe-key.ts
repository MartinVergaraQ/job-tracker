import type { NormalizedJob } from '../../types/job'

function normalize(value: string | null | undefined) {
    return (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function normalizeTitle(title: string) {
    return normalize(title)
        .replace(/\b(sr|senior)\b/g, 'senior')
        .replace(/\b(jr|junior)\b/g, 'junior')
        .replace(/\bsemi senior\b/g, 'semi-senior')
        .replace(/\bfullstack\b/g, 'full stack')
}

function normalizeLocation(location: string | null | undefined) {
    const value = normalize(location)

    if (value.includes('santiago')) return 'santiago'
    if (value.includes('region metropolitana')) return 'santiago'
    if (value.includes('remote') || value.includes('remoto') || value.includes('remota')) {
        return 'remote'
    }
    if (value.includes('hybrid') || value.includes('hibrido') || value.includes('hibrida')) {
        return 'hybrid'
    }

    return value
}

export function buildDedupeKey(job: Pick<NormalizedJob, 'title' | 'company' | 'location'>) {
    const title = normalizeTitle(job.title)
    const company = normalize(job.company)
    const location = normalizeLocation(job.location)

    return [title, company, location].filter(Boolean).join(' | ')
}