import Link from 'next/link'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRunHealthFromPersistedRun } from '@/lib/monitoring/run-health'

type ScrapeRunSource = {
    source_name: string
    ok: boolean
    jobs_found: number
}

type LatestRun = {
    id: string
    status: 'success' | 'error'
    started_at: string
    duration_ms: number
    jobs_found: number
    jobs_processed: number
    matches_created: number
    error_message: string | null
    scrape_run_sources?: ScrapeRunSource[]
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'short',
        timeStyle: 'medium',
    }).format(new Date(value))
}

function formatDuration(ms: number) {
    if (ms < 1000) return `${ms} ms`

    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    if (minutes === 0) return `${seconds}s`
    return `${minutes}m ${seconds}s`
}

function getHealthClasses(health: 'healthy' | 'degraded' | 'error') {
    if (health === 'healthy') {
        return 'bg-green-100 text-green-700 border-green-200'
    }

    if (health === 'degraded') {
        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    }

    return 'bg-red-100 text-red-700 border-red-200'
}

function getHealthLabel(health: 'healthy' | 'degraded' | 'error') {
    if (health === 'healthy') return 'HEALTHY'
    if (health === 'degraded') return 'DEGRADED'
    return 'ERROR'
}

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border p-4">
                        <div className="h-4 w-28 animate-pulse rounded bg-neutral-800" />
                        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-neutral-900" />
                    </div>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border p-6">
                    <div className="h-6 w-48 animate-pulse rounded bg-neutral-800" />
                    <div className="mt-4 space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-14 animate-pulse rounded bg-neutral-900" />
                        ))}
                    </div>
                </div>

                <div className="rounded-2xl border p-6">
                    <div className="h-6 w-48 animate-pulse rounded bg-neutral-800" />
                    <div className="mt-4 space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-12 animate-pulse rounded bg-neutral-900" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

async function DashboardContent() {
    await connection()

    const supabase = createAdminClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
        latestRunResponse,
        jobs24hResponse,
        profilesResponse,
    ] = await Promise.all([
        supabase
            .from('scrape_runs')
            .select(`
        id,
        status,
        started_at,
        duration_ms,
        jobs_found,
        jobs_processed,
        matches_created,
        error_message,
        scrape_run_sources (
          source_name,
          ok,
          jobs_found
        )
      `)
            .order('started_at', { ascending: false })
            .limit(1),

        supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .gte('published_at', since),

        supabase
            .from('search_profiles')
            .select('id', { count: 'exact', head: true }),
    ])

    if (latestRunResponse.error) {
        throw new Error(latestRunResponse.error.message)
    }

    if (jobs24hResponse.error) {
        throw new Error(jobs24hResponse.error.message)
    }

    if (profilesResponse.error) {
        throw new Error(profilesResponse.error.message)
    }

    const latestRun = (latestRunResponse.data?.[0] ?? null) as LatestRun | null
    const jobs24h = jobs24hResponse.count ?? 0
    const profilesCount = profilesResponse.count ?? 0
    const currentHealth = latestRun
        ? getRunHealthFromPersistedRun(latestRun)
        : 'degraded'

    return (
        <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border p-4">
                    <p className="text-sm text-neutral-500">Estado actual</p>
                    <div className="mt-3">
                        <span
                            className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${getHealthClasses(currentHealth)}`}
                        >
                            {getHealthLabel(currentHealth)}
                        </span>
                    </div>
                </div>

                <div className="rounded-2xl border p-4">
                    <p className="text-sm text-neutral-500">Jobs últimas 24h</p>
                    <p className="mt-2 text-3xl font-semibold">{jobs24h}</p>
                </div>

                <div className="rounded-2xl border p-4">
                    <p className="text-sm text-neutral-500">Perfiles</p>
                    <p className="mt-2 text-3xl font-semibold">{profilesCount}</p>
                </div>

                <div className="rounded-2xl border p-4">
                    <p className="text-sm text-neutral-500">Último run</p>
                    <p className="mt-2 text-lg font-semibold">
                        {latestRun ? formatDate(latestRun.started_at) : 'Sin datos'}
                    </p>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-semibold">Última corrida</h2>
                            <p className="mt-1 text-sm text-neutral-500">
                                Resumen del último proceso de recolección.
                            </p>
                        </div>

                        <Link
                            href="/admin/runs"
                            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-900"
                        >
                            Ver runs
                        </Link>
                    </div>

                    {!latestRun ? (
                        <div className="mt-6 rounded-xl border p-4 text-neutral-500">
                            Aún no hay corridas registradas.
                        </div>
                    ) : (
                        <div className="mt-6 space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="rounded-xl bg-neutral-950 p-4">
                                    <p className="text-sm text-neutral-500">Inicio</p>
                                    <p className="mt-2 font-medium">{formatDate(latestRun.started_at)}</p>
                                </div>

                                <div className="rounded-xl bg-neutral-950 p-4">
                                    <p className="text-sm text-neutral-500">Duración</p>
                                    <p className="mt-2 font-medium">{formatDuration(latestRun.duration_ms)}</p>
                                </div>

                                <div className="rounded-xl bg-neutral-950 p-4">
                                    <p className="text-sm text-neutral-500">Jobs encontrados</p>
                                    <p className="mt-2 font-medium">{latestRun.jobs_found}</p>
                                </div>

                                <div className="rounded-xl bg-neutral-950 p-4">
                                    <p className="text-sm text-neutral-500">Matches creados</p>
                                    <p className="mt-2 font-medium">{latestRun.matches_created}</p>
                                </div>
                            </div>

                            <div>
                                <p className="mb-3 text-sm text-neutral-500">Fuentes</p>

                                <div className="space-y-3">
                                    {(latestRun.scrape_run_sources ?? []).map((source) => (
                                        <div
                                            key={source.source_name}
                                            className="flex items-center justify-between gap-3 rounded-xl bg-neutral-100 px-4 py-3 text-black"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="font-medium">{source.source_name}</span>

                                                <span
                                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${source.ok
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-red-100 text-red-700'
                                                        }`}
                                                >
                                                    {source.ok ? 'OK' : 'FAIL'}
                                                </span>
                                            </div>

                                            <span className="text-sm text-neutral-600">
                                                {source.jobs_found} jobs
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {latestRun.error_message && (
                                    <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                                        {latestRun.error_message}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border p-6">
                    <h2 className="text-lg font-semibold">Accesos rápidos</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                        Navegación principal del panel admin.
                    </p>

                    <div className="mt-6 grid gap-4">
                        <Link
                            href="/admin/jobs"
                            className="rounded-2xl border p-4 transition hover:bg-neutral-950"
                        >
                            <p className="font-medium">Jobs</p>
                            <p className="mt-1 text-sm text-neutral-500">
                                Ver trabajos recolectados y matches por perfil.
                            </p>
                        </Link>

                        <Link
                            href="/admin/runs"
                            className="rounded-2xl border p-4 transition hover:bg-neutral-950"
                        >
                            <p className="font-medium">Runs</p>
                            <p className="mt-1 text-sm text-neutral-500">
                                Ver historial de corridas, fuentes y errores.
                            </p>
                        </Link>
                    </div>

                    <div className="mt-6 rounded-2xl bg-neutral-950 p-4">
                        <p className="text-sm text-neutral-500">Qué sigue</p>
                        <p className="mt-2 text-sm">
                            El próximo paso es agregar métricas de negocio:
                            jobs nuevas, matches útiles y notificaciones enviadas.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    )
}

export default function AdminPage() {
    return (
        <main className="space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Vista general del estado del colector, jobs y monitoreo.
                </p>
            </div>

            <Suspense fallback={<DashboardSkeleton />}>
                <DashboardContent />
            </Suspense>
        </main>
    )
}