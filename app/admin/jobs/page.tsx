import { Suspense } from 'react'
import { connection } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type SearchProfileRow = {
    id: string
    name: string
    slug: string
}

type JobMatchRow = {
    score: number
    is_match: boolean
    reasons: string[] | null
    search_profiles: SearchProfileRow | SearchProfileRow[] | null
}

type JobRow = {
    id: string
    title: string
    company: string | null
    location: string | null
    modality: string | null
    seniority: string | null
    source_name: string | null
    url: string | null
    published_at: string | null
    job_matches: JobMatchRow[] | null
}

export default function AdminJobsPage() {
    return (
        <main className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">Jobs</h1>
                <p className="text-sm text-neutral-500">
                    Últimas 24 horas
                </p>
            </div>

            <Suspense fallback={<JobsSkeleton />}>
                <JobsList />
            </Suspense>
        </main>
    )
}

function JobsSkeleton() {
    return (
        <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border p-4">
                    <div className="h-6 w-72 animate-pulse rounded bg-neutral-800" />
                    <div className="mt-3 h-4 w-56 animate-pulse rounded bg-neutral-900" />
                    <div className="mt-6 rounded-lg bg-neutral-950 p-4">
                        <div className="h-4 w-40 animate-pulse rounded bg-neutral-800" />
                        <div className="mt-3 space-y-2">
                            <div className="h-3 w-full animate-pulse rounded bg-neutral-900" />
                            <div className="h-3 w-5/6 animate-pulse rounded bg-neutral-900" />
                            <div className="h-3 w-4/6 animate-pulse rounded bg-neutral-900" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

function formatPublishedAt(value: string | null) {
    if (!value) return 'Sin fecha'

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return 'Sin fecha válida'

    return new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date)
}

function getProfile(match: JobMatchRow) {
    if (Array.isArray(match.search_profiles)) {
        return match.search_profiles[0] ?? null
    }

    return match.search_profiles ?? null
}

async function JobsList() {
    await connection()

    const supabase = createAdminClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
        .from('jobs')
        .select(`
      id,
      title,
      company,
      location,
      modality,
      seniority,
      source_name,
      url,
      published_at,
      job_matches (
        score,
        is_match,
        reasons,
        search_profiles (
          id,
          name,
          slug
        )
      )
    `)
        .gte('published_at', since)
        .order('published_at', { ascending: false })
        .limit(50)

    if (error) {
        return <p className="text-red-600">{error.message}</p>
    }

    const jobs = (data ?? []) as JobRow[]

    if (!jobs.length) {
        return (
            <div className="rounded-xl border p-6 text-neutral-400">
                No hay trabajos publicados en las últimas 24 horas.
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {jobs.map((job) => {
                const positiveMatches = (job.job_matches ?? []).filter(
                    (match) => match.is_match
                )

                return (
                    <article key={job.id} className="rounded-xl border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold">{job.title}</h2>

                                <p className="text-sm text-neutral-400">
                                    {job.company ?? 'Empresa sin nombre'} ·{' '}
                                    {job.location ?? 'Sin ubicación'} ·{' '}
                                    {job.modality ?? 'Sin modalidad'}
                                </p>

                                <p className="mt-1 text-sm text-neutral-500">
                                    Fuente: {job.source_name ?? 'Sin fuente'} · Publicado:{' '}
                                    {formatPublishedAt(job.published_at)}
                                </p>
                            </div>

                            {job.url ? (
                                <a
                                    href={job.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
                                >
                                    Abrir oferta
                                </a>
                            ) : null}
                        </div>

                        {positiveMatches.length === 0 ? (
                            <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-neutral-500">
                                Sin matches relevantes para los perfiles cargados.
                            </div>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {positiveMatches.map((match, index) => {
                                    const profile = getProfile(match)

                                    return (
                                        <div
                                            key={`${job.id}-${profile?.id ?? index}`}
                                            className="rounded-lg bg-neutral-100 p-4 text-black"
                                        >
                                            <div className="flex flex-wrap items-center gap-3">
                                                <p className="font-medium">
                                                    {profile?.name ?? 'Perfil sin nombre'}
                                                </p>

                                                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                                                    MATCH
                                                </span>

                                                <span className="text-sm text-neutral-700">
                                                    Score: {match.score}
                                                </span>
                                            </div>

                                            {!!match.reasons?.length && (
                                                <ul className="mt-3 list-disc pl-5 text-sm text-neutral-700">
                                                    {match.reasons.map((reason, i) => (
                                                        <li key={i}>{reason}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </article>
                )
            })}
        </div>
    )
}