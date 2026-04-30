import { Suspense } from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    saveJobApplicationNotes,
    saveJobApplicationCvVariant,
    setJobApplicationStatus,
} from './actions'

type JobRow = {
    id: string
    title: string
    company: string | null
    location: string | null
    url: string | null
    source_name: string | null
    published_at: string | null
}

type SearchProfileRow = {
    id: string
    name: string
    slug: string
}

type JobMatchRow = {
    id: string
    score: number
    reasons: string[] | null
    is_match: boolean
    jobs: JobRow | JobRow[] | null
    search_profiles: SearchProfileRow | SearchProfileRow[] | null
}

type JobApplicationRow = {
    job_id: string
    profile_id: string
    status: 'saved' | 'applied' | 'interview' | 'rejected' | 'offer'
    applied_at: string | null
    notes: string | null
    cv_variant: string | null
}

type FilterSearchParams = {
    profile?: string
    status?: string
    source?: string
    q?: string
    cvVariant?: string
}

function getRelationObject<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null
    }

    return value ?? null
}

function formatDate(value: string | null) {
    if (!value) return 'Sin fecha'

    return new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(value))
}

function getStatusClasses(
    status: 'saved' | 'applied' | 'interview' | 'rejected' | 'offer' | 'pending'
) {
    if (status === 'saved') return 'bg-neutral-200 text-neutral-800 border-neutral-300'
    if (status === 'applied') return 'bg-blue-100 text-blue-700 border-blue-200'
    if (status === 'interview') return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    if (status === 'rejected') return 'bg-red-100 text-red-700 border-red-200'
    if (status === 'offer') return 'bg-green-100 text-green-700 border-green-200'
    return 'bg-neutral-100 text-neutral-600 border-neutral-200'
}

function getStatusLabel(
    status: 'saved' | 'applied' | 'interview' | 'rejected' | 'offer' | 'pending'
) {
    if (status === 'saved') return 'GUARDADA'
    if (status === 'applied') return 'POSTULÉ'
    if (status === 'interview') return 'ENTREVISTA'
    if (status === 'rejected') return 'RECHAZADA'
    if (status === 'offer') return 'OFERTA'
    return 'PENDIENTE'
}

function getSourceClasses(sourceName: string | null) {
    if (sourceName === 'duolaboral') return 'bg-purple-100 text-purple-700'
    if (sourceName === 'linkedin_email_alerts') return 'bg-blue-100 text-blue-700'
    if (sourceName === 'chiletrabajos') return 'bg-orange-100 text-orange-700'
    if (sourceName === 'getonboard') return 'bg-green-100 text-green-700'
    return 'bg-neutral-100 text-neutral-700'
}
function getEffectiveCvVariant(application: JobApplicationRow | undefined) {
    return application?.cv_variant ?? 'unassigned'
}

function buildQueryString(params: Record<string, string | undefined>) {
    const searchParams = new URLSearchParams()

    for (const [key, value] of Object.entries(params)) {
        if (value && value.trim()) {
            searchParams.set(key, value)
        }
    }

    const result = searchParams.toString()
    return result ? `?${result}` : ''
}

function normalizeText(value: string | null | undefined) {
    return (value ?? '').toLowerCase().trim()
}

function rowMatchesQuery(params: {
    row: JobMatchRow
    application: JobApplicationRow | undefined
    query: string
}) {
    const { row, application, query } = params

    if (!query) return true

    const job = getRelationObject(row.jobs)
    const profile = getRelationObject(row.search_profiles)

    if (!job || !profile) return false

    const haystack = [
        job.title,
        job.company,
        job.location,
        job.source_name,
        profile.name,
        profile.slug,
        ...(row.reasons ?? []),
        application?.notes ?? '',
    ]
        .map((value) => normalizeText(value))
        .join(' ')

    return haystack.includes(normalizeText(query))
}

async function getTopMatches(filters: FilterSearchParams) {
    const supabase = createAdminClient()

    const lookbackHours = Number(process.env.TOP_MATCHES_LOOKBACK_HOURS ?? 72)
    const minScore = Number(process.env.TOP_MATCHES_MIN_SCORE ?? 60)
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
        .from('job_matches')
        .select(`
      id,
      score,
      reasons,
      is_match,
      jobs (
        id,
        title,
        company,
        location,
        url,
        source_name,
        published_at
      ),
      search_profiles (
        id,
        name,
        slug
      )
    `)
        .eq('is_match', true)
        .gte('score', minScore)
        .gte('jobs.published_at', since)
        .limit(200)

    if (error) {
        throw new Error(error.message)
    }

    const rows = (data ?? []) as JobMatchRow[]

    const keys = rows
        .map((row) => {
            const job = getRelationObject(row.jobs)
            const profile = getRelationObject(row.search_profiles)

            if (!job || !profile) return null

            return {
                job_id: job.id,
                profile_id: profile.id,
            }
        })
        .filter(Boolean) as Array<{ job_id: string; profile_id: string }>

    const uniqueJobIds = Array.from(new Set(keys.map((item) => item.job_id)))
    const uniqueProfileIds = Array.from(new Set(keys.map((item) => item.profile_id)))

    let applications: JobApplicationRow[] = []

    if (uniqueJobIds.length > 0 && uniqueProfileIds.length > 0) {
        const { data: appData, error: appError } = await supabase
            .from('job_applications')
            .select('job_id, profile_id, status, applied_at, notes, cv_variant')
            .in('job_id', uniqueJobIds)
            .in('profile_id', uniqueProfileIds)

        if (appError) {
            throw new Error(appError.message)
        }

        applications = (appData ?? []) as JobApplicationRow[]
    }

    const appMap = new Map<string, JobApplicationRow>()

    for (const app of applications) {
        appMap.set(`${app.job_id}|${app.profile_id}`, app)
    }

    const filteredRows = rows.filter((row) => {
        const job = getRelationObject(row.jobs)
        const profile = getRelationObject(row.search_profiles)

        if (!job || !profile) return false

        const application = appMap.get(`${job.id}|${profile.id}`)
        const currentStatus = application?.status ?? 'pending'
        const currentCvVariant = getEffectiveCvVariant(application)

        if (filters.profile && profile.slug !== filters.profile) {
            return false
        }

        if (filters.status && currentStatus !== filters.status) {
            return false
        }

        if (filters.source && job.source_name !== filters.source) {
            return false
        }

        if (filters.cvVariant && currentCvVariant !== filters.cvVariant) {
            return false
        }

        if (filters.q && !rowMatchesQuery({ row, application, query: filters.q })) {
            return false
        }

        return true
    })

    const sorted = filteredRows.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score

        const aJob = getRelationObject(a.jobs)
        const bJob = getRelationObject(b.jobs)

        const aTime = aJob?.published_at ? new Date(aJob.published_at).getTime() : 0
        const bTime = bJob?.published_at ? new Date(bJob.published_at).getTime() : 0

        return bTime - aTime
    })

    const profiles = Array.from(
        new Map(
            rows
                .map((row) => getRelationObject(row.search_profiles))
                .filter(Boolean)
                .map((profile) => [profile!.slug, profile!])
        ).values()
    )

    const sources = Array.from(
        new Set(
            rows
                .map((row) => getRelationObject(row.jobs)?.source_name)
                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        )
    ).sort()

    return {
        rows: sorted,
        appMap,
        profiles,
        sources,
        meta: {
            minScore,
            lookbackHours,
        },
    }
}

function SummaryCards({
    rows,
    appMap,
}: {
    rows: JobMatchRow[]
    appMap: Map<string, JobApplicationRow>
}) {
    const totals = {
        pending: 0,
        saved: 0,
        applied: 0,
        interview: 0,
        rejected: 0,
        offer: 0,
    }

    for (const row of rows) {
        const job = getRelationObject(row.jobs)
        const profile = getRelationObject(row.search_profiles)
        if (!job || !profile) continue

        const application = appMap.get(`${job.id}|${profile.id}`)
        const currentStatus = application?.status ?? 'pending'
        totals[currentStatus] += 1
    }

    return (
        <section className="grid gap-4 md:grid-cols-6">
            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Pendientes</p>
                <p className="mt-2 text-2xl font-semibold">{totals.pending}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Guardadas</p>
                <p className="mt-2 text-2xl font-semibold">{totals.saved}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Postulé</p>
                <p className="mt-2 text-2xl font-semibold">{totals.applied}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Entrevista</p>
                <p className="mt-2 text-2xl font-semibold">{totals.interview}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Rechazadas</p>
                <p className="mt-2 text-2xl font-semibold">{totals.rejected}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Ofertas</p>
                <p className="mt-2 text-2xl font-semibold">{totals.offer}</p>
            </div>
        </section>
    )
}
function CvVariantStats({
    rows,
    appMap,
}: {
    rows: JobMatchRow[]
    appMap: Map<string, JobApplicationRow>
}) {
    const buckets = new Map<
        string,
        {
            label: string
            total: number
            applied: number
            interview: number
            offer: number
        }
    >()

    buckets.set('unassigned', {
        label: 'Sin definir',
        total: 0,
        applied: 0,
        interview: 0,
        offer: 0,
    })

    for (const variant of CV_VARIANTS) {
        buckets.set(variant.value, {
            label: variant.label,
            total: 0,
            applied: 0,
            interview: 0,
            offer: 0,
        })
    }

    for (const row of rows) {
        const job = getRelationObject(row.jobs)
        const profile = getRelationObject(row.search_profiles)

        if (!job || !profile) continue

        const application = appMap.get(`${job.id}|${profile.id}`)
        const key = getEffectiveCvVariant(application)
        const bucket = buckets.get(key)

        if (!bucket) continue

        bucket.total += 1

        if (application?.status === 'applied') {
            bucket.applied += 1
        }

        if (application?.status === 'interview') {
            bucket.interview += 1
        }

        if (application?.status === 'offer') {
            bucket.offer += 1
        }
    }

    const rowsToShow = Array.from(buckets.entries())
        .map(([key, value]) => ({ key, ...value }))
        .filter((item) => item.total > 0)

    if (!rowsToShow.length) {
        return null
    }

    return (
        <section className="rounded-2xl border p-5">
            <div className="mb-4">
                <h2 className="text-lg font-semibold">Rendimiento por CV</h2>
                <p className="mt-1 text-sm text-neutral-500">
                    Cuántas matches tienes por variante y cómo avanzan.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rowsToShow.map((item) => (
                    <div key={item.key} className="rounded-2xl border p-4">
                        <p className="text-sm text-neutral-500">{item.label}</p>
                        <p className="mt-2 text-2xl font-semibold">{item.total}</p>

                        <div className="mt-4 space-y-1 text-sm text-neutral-400">
                            <p>Postulé: {item.applied}</p>
                            <p>Entrevista: {item.interview}</p>
                            <p>Oferta: {item.offer}</p>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

function FiltersBar({
    selectedProfile,
    selectedStatus,
    selectedSource,
    selectedQuery,
    selectedCvVariant,
    profiles,
    sources,
}: {
    selectedProfile?: string
    selectedStatus?: string
    selectedSource?: string
    selectedQuery?: string
    selectedCvVariant?: string
    profiles: SearchProfileRow[]
    sources: string[]
}) {
    return (
        <section className="rounded-2xl border p-4 space-y-4">
            <form method="GET" className="flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] flex-1">
                    <label className="mb-2 block text-sm text-neutral-500">
                        Buscar por texto
                    </label>
                    <input
                        type="text"
                        name="q"
                        defaultValue={selectedQuery ?? ''}
                        placeholder="backend, react, php, empresa, fuente..."
                        className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                    />
                </div>

                <input type="hidden" name="profile" value={selectedProfile ?? ''} />
                <input type="hidden" name="status" value={selectedStatus ?? ''} />
                <input type="hidden" name="source" value={selectedSource ?? ''} />
                <input type="hidden" name="cvVariant" value={selectedCvVariant ?? ''} />
                <button
                    type="submit"
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Buscar
                </button>

                <Link
                    href={buildQueryString({
                        profile: selectedProfile,
                        status: selectedStatus,
                        source: selectedSource,
                    })}
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Limpiar texto
                </Link>
            </form>

            <div className="grid gap-3 md:grid-cols-4">
                <div>
                    <p className="mb-2 text-sm text-neutral-500">Perfil</p>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href={buildQueryString({
                                status: selectedStatus,
                                source: selectedSource,
                                q: selectedQuery,
                            })}
                            className={`rounded-xl border px-3 py-2 text-sm ${!selectedProfile ? 'bg-neutral-900' : ''
                                }`}
                        >
                            Todos
                        </Link>

                        {profiles.map((profile) => (
                            <Link
                                key={profile.id}
                                href={buildQueryString({
                                    profile: profile.slug,
                                    status: selectedStatus,
                                    source: selectedSource,
                                    q: selectedQuery,
                                })}
                                className={`rounded-xl border px-3 py-2 text-sm ${selectedProfile === profile.slug ? 'bg-neutral-900' : ''
                                    }`}
                            >
                                {profile.name}
                            </Link>
                        ))}
                    </div>
                </div>

                <div>
                    <p className="mb-2 text-sm text-neutral-500">Estado</p>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { value: '', label: 'Todos' },
                            { value: 'pending', label: 'Pendiente' },
                            { value: 'saved', label: 'Guardada' },
                            { value: 'applied', label: 'Postulé' },
                            { value: 'interview', label: 'Entrevista' },
                            { value: 'rejected', label: 'Rechazada' },
                            { value: 'offer', label: 'Oferta' },
                        ].map((item) => (
                            <Link
                                key={item.label}
                                href={buildQueryString({
                                    profile: selectedProfile,
                                    status: item.value || undefined,
                                    source: selectedSource,
                                    q: selectedQuery,
                                })}
                                className={`rounded-xl border px-3 py-2 text-sm ${(selectedStatus ?? '') === item.value ? 'bg-neutral-900' : ''
                                    }`}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="md:col-span-2">
                    <p className="mb-2 text-sm text-neutral-500">Fuente</p>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href={buildQueryString({
                                profile: selectedProfile,
                                status: selectedStatus,
                                q: selectedQuery,
                            })}
                            className={`rounded-xl border px-3 py-2 text-sm ${!selectedSource ? 'bg-neutral-900' : ''
                                }`}
                        >
                            Todas
                        </Link>

                        {sources.map((source) => (
                            <Link
                                key={source}
                                href={buildQueryString({
                                    profile: selectedProfile,
                                    status: selectedStatus,
                                    source,
                                    q: selectedQuery,
                                })}
                                className={`rounded-xl border px-3 py-2 text-sm ${selectedSource === source ? 'bg-neutral-900' : ''
                                    }`}
                            >
                                {source}
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

const CV_VARIANTS = [
    { value: 'backend-jr', label: 'Backend Jr' },
    { value: 'fullstack-jr', label: 'Fullstack Jr' },
    { value: 'frontend-react', label: 'Frontend React' },
    { value: 'administrativo', label: 'Administrativo' },
    { value: 'ventas-atencion', label: 'Ventas / Atención' },
    { value: 'general', label: 'General' },
] as const

function getCvVariantLabel(value: string | null | undefined) {
    const found = CV_VARIANTS.find((item) => item.value === value)
    return found?.label ?? 'Sin definir'
}

function suggestCvVariant(params: {
    title: string
    reasons: string[]
    profileSlug: string
    company?: string | null
    sourceName?: string | null
}) {
    const haystack = [
        params.title,
        params.company ?? '',
        params.sourceName ?? '',
        params.profileSlug,
        ...params.reasons,
    ]
        .map((value) => normalizeText(value))
        .join(' ')

    if (/\bfull stack\b|\bfullstack\b/.test(haystack)) {
        return 'fullstack-jr'
    }

    if (
        /\bbackend\b|\bnode\b|\bnode\.js\b|\bapi\b|\bapis\b|\bsql\b|\bpostgres\b|\bpostgresql\b|\bmysql\b|\b\.net\b|\bc#\b|\bcsharp\b|\bjava\b|\bspring\b|\bgo\b/.test(
            haystack
        )
    ) {
        return 'backend-jr'
    }

    if (
        /\bfrontend\b|\breact\b|\bnext\b|\bnext\.js\b|\bjavascript\b|\btypescript\b|\bangular\b|\bvue\b/.test(
            haystack
        )
    ) {
        return 'frontend-react'
    }

    if (
        /\badministrativ\b|\brecepcion\b|\bsecretari\b|\boffice\b|\bexcel\b|\basistente\b/.test(
            haystack
        )
    ) {
        return 'administrativo'
    }

    if (
        /\bventas\b|\batencion\b|\batención\b|\bcliente\b|\bretail\b|\bcajer\b|\bcomercial\b/.test(
            haystack
        )
    ) {
        return 'ventas-atencion'
    }

    return 'general'
}

function NotesForm({
    jobId,
    profileId,
    notes,
}: {
    jobId: string
    profileId: string
    notes: string | null
}) {
    return (
        <form action={saveJobApplicationNotes} className="mt-4 space-y-2">
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="profile_id" value={profileId} />

            <label className="block text-sm font-medium text-neutral-300">
                Notas
            </label>

            <textarea
                name="notes"
                defaultValue={notes ?? ''}
                placeholder="Ej: postulé por portal, usé CV backend, hacer seguimiento el jueves..."
                rows={3}
                className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
            />

            <button
                type="submit"
                className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
            >
                Guardar nota
            </button>
        </form>
    )
}

function CvVariantForm({
    jobId,
    profileId,
    currentCvVariant,
    suggestedCvVariant,
}: {
    jobId: string
    profileId: string
    currentCvVariant: string | null
    suggestedCvVariant: string
}) {
    const effectiveValue = currentCvVariant ?? suggestedCvVariant

    return (
        <form action={saveJobApplicationCvVariant} className="mt-4 space-y-2">
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="profile_id" value={profileId} />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="block text-sm font-medium text-neutral-300">
                    CV usado
                </label>

                {!currentCvVariant ? (
                    <span className="rounded-full border px-3 py-1 text-xs text-neutral-400">
                        Sugerido: {getCvVariantLabel(suggestedCvVariant)}
                    </span>
                ) : (
                    <span className="rounded-full border px-3 py-1 text-xs text-neutral-400">
                        Actual: {getCvVariantLabel(currentCvVariant)}
                    </span>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <select
                    name="cv_variant"
                    defaultValue={effectiveValue}
                    className="rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                >
                    {CV_VARIANTS.map((variant) => (
                        <option key={variant.value} value={variant.value}>
                            {variant.label}
                        </option>
                    ))}
                </select>

                <button
                    type="submit"
                    className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Guardar CV
                </button>
            </div>
        </form>
    )
}

function MatchCard({
    row,
    application,
}: {
    row: JobMatchRow
    application: JobApplicationRow | undefined
}) {
    const job = getRelationObject(row.jobs)
    const profile = getRelationObject(row.search_profiles)

    if (!job || !profile) return null

    const currentStatus = application?.status ?? 'pending'

    const suggestedCvVariant = suggestCvVariant({
        title: job.title,
        reasons: row.reasons ?? [],
        profileSlug: profile.slug,
        company: job.company,
        sourceName: job.source_name,
    })

    const effectiveCvVariant = application?.cv_variant ?? suggestedCvVariant

    return (
        <article className="rounded-2xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getSourceClasses(job.source_name)}`}
                        >
                            {job.source_name ?? 'sin fuente'}
                        </span>

                        <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                            Score {row.score}
                        </span>

                        <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(currentStatus)}`}
                        >
                            {getStatusLabel(currentStatus)}
                        </span>
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold">{job.title}</h2>
                        <p className="text-sm text-neutral-400">
                            {job.company ?? 'Sin empresa'} · {job.location ?? 'Sin ubicación'}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                            Perfil: {profile.name} · Publicado: {formatDate(job.published_at)}
                        </p>
                    </div>
                </div>

                {job.url ? (
                    <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                    >
                        Ver oferta
                    </a>
                ) : null}

                <Link
                    href={`/admin/top-matches/${job.id}/${profile.id}`}
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Preparar postulación
                </Link>
            </div>

            <div className="mt-4 rounded-xl bg-neutral-950 p-4">
                <p className="text-sm font-medium">Motivos del match</p>
                <ul className="mt-3 space-y-2 text-sm text-neutral-300">
                    {(row.reasons ?? []).slice(0, 6).map((reason, index) => (
                        <li key={index}>• {reason}</li>
                    ))}
                </ul>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {(['saved', 'applied', 'interview', 'rejected', 'offer'] as const).map((status) => (
                    <form key={status} action={setJobApplicationStatus}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="profile_id" value={profile.id} />
                        <button
                            type="submit"
                            name="status"
                            value={status}
                            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                        >
                            {getStatusLabel(status)}
                        </button>
                    </form>
                ))}
            </div>

            <CvVariantForm
                jobId={job.id}
                profileId={profile.id}
                currentCvVariant={application?.cv_variant ?? null}
                suggestedCvVariant={suggestedCvVariant}
            />

            <NotesForm
                jobId={job.id}
                profileId={profile.id}
                notes={application?.notes ?? null}
            />

            {application?.applied_at ? (
                <p className="mt-3 text-xs text-neutral-500">
                    Fecha de postulación: {formatDate(application.applied_at)}
                </p>
            ) : null}

            <p className="mt-2 text-xs text-neutral-500">
                CV activo: {getCvVariantLabel(effectiveCvVariant)}
                {application?.cv_variant ? '' : ' (sugerido)'}
            </p>
        </article>
    )
}

function TopMatchesSkeleton() {
    return (
        <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-2xl border p-5">
                    <div className="h-5 w-48 animate-pulse rounded bg-neutral-900" />
                    <div className="mt-3 h-4 w-72 animate-pulse rounded bg-neutral-950" />
                    <div className="mt-5 h-24 animate-pulse rounded-xl bg-neutral-950" />
                </div>
            ))}
        </div>
    )
}

async function TopMatchesContent({
    searchParams,
}: {
    searchParams: Promise<FilterSearchParams>
}) {
    const filters = await searchParams
    const { rows, appMap, profiles, sources, meta } = await getTopMatches(filters)

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border p-4 text-sm text-neutral-400">
                Ventana: últimas {meta.lookbackHours} horas · Score mínimo: {meta.minScore}
            </div>

            <FiltersBar
                selectedProfile={filters.profile}
                selectedStatus={filters.status}
                selectedSource={filters.source}
                selectedQuery={filters.q}
                selectedCvVariant={filters.cvVariant}
                profiles={profiles}
                sources={sources}
            />

            <SummaryCards rows={rows} appMap={appMap} />
            <CvVariantStats rows={rows} appMap={appMap} />

            {!rows.length ? (
                <div className="rounded-2xl border p-6 text-neutral-400">
                    No hay top matches para esos filtros.
                </div>
            ) : (
                rows.map((row) => {
                    const job = getRelationObject(row.jobs)
                    const profile = getRelationObject(row.search_profiles)

                    if (!job || !profile) return null

                    const key = `${job.id}|${profile.id}`
                    const application = appMap.get(key)

                    return (
                        <MatchCard
                            key={row.id}
                            row={row}
                            application={application}
                        />
                    )
                })
            )}
        </div>
    )
}

export default function AdminTopMatchesPage({
    searchParams,
}: {
    searchParams: Promise<FilterSearchParams>
}) {
    return (
        <main className="space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-semibold">Top Matches</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Mejores oportunidades recientes, búsqueda por texto y seguimiento de postulaciones.
                </p>
            </div>

            <Suspense fallback={<TopMatchesSkeleton />}>
                <TopMatchesContent searchParams={searchParams} />
            </Suspense>
        </main>
    )
}