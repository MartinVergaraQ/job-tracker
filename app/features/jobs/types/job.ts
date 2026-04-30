export type JobModality = 'remote' | 'hybrid' | 'onsite' | 'unknown'

export type JobSeniority =
    | 'junior'
    | 'semi-senior'
    | 'senior'
    | 'trainee'
    | 'unknown'

export type JobSourceType =
    | 'mock'
    | 'api'
    | 'rss'
    | 'html'
    | 'browser'
    | 'email'

export type NormalizedJob = {
    source_name: string
    source_type: JobSourceType
    external_id: string | null
    url: string
    title: string
    company: string
    location: string | null
    modality: JobModality
    seniority: JobSeniority
    salary_text: string | null
    description: string | null
    tech_tags: string[]
    published_at: string | null
    scraped_at: string
}

export type SearchProfile = {
    id: string
    slug: string
    name: string
    include_keywords: string[]
    exclude_keywords: string[]
    preferred_locations: string[]
    preferred_modalities: string[]
    preferred_seniority: string[]
    min_score: number
    is_active: boolean
}