import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

type ScrapeRunSource = {
    id: string
    source_name: string
    ok: boolean
    jobs_found: number
}

type ScrapeRun = {
    id: string
    status: 'success' | 'error'
    started_at: string
    finished_at: string
    duration_ms: number
    jobs_found: number
    jobs_processed: number
    matches_created: number
    error_message: string | null
    scrape_run_sources?: ScrapeRunSource[]
}

type RunHealth = 'healthy' | 'degraded' | 'error'

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

function getStatusClasses(status: ScrapeRun['status']) {
    if (status === 'success') {
        return 'bg-green-100 text-green-700 border-green-200'
    }

    return 'bg-red-100 text-red-700 border-red-200'
}

function getRunHealth(run: ScrapeRun): RunHealth {
    if (run.status === 'error') {
        return 'error'
    }

    const sources = run.scrape_run_sources ?? []

    if (!sources.length) {
        return 'degraded'
    }

    if (sources.some((source) => source.ok === false)) {
        return 'degraded'
    }

    if (sources.some((source) => source.jobs_found === 0)) {
        return 'degraded'
    }

    return 'healthy'
}

function getHealthClasses(health: RunHealth) {
    if (health === 'healthy') {
        return 'bg-green-100 text-green-700 border-green-200'
    }

    if (health === 'degraded') {
        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    }

    return 'bg-red-100 text-red-700 border-red-200'
}

function getHealthLabel(health: RunHealth) {
    if (health === 'healthy') return 'HEALTHY'
    if (health === 'degraded') return 'DEGRADED'
    return 'ERROR'
}

async function getRuns(): Promise<ScrapeRun[]> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('scrape_runs')
        .select(`
      id,
      status,
      started_at,
      finished_at,
      duration_ms,
      jobs_found,
      jobs_processed,
      matches_created,
      error_message,
      scrape_run_sources (
        id,
        source_name,
        ok,
        jobs_found
      )
    `)
        .order('started_at', { ascending: false })
        .limit(20)

    if (error) {
        throw new Error(error.message)
    }

    return (data ?? []) as ScrapeRun[]
}

function LatestRunHealthBanner({ runs }: { runs: ScrapeRun[] }) {
    const latest = runs[0]

    if (!latest) return null

    const health = getRunHealth(latest)

    const messageByHealth: Record<RunHealth, string> = {
        healthy: 'Última corrida sana. Todas las fuentes respondieron bien.',
        degraded: 'Última corrida parcial. El run pasó, pero alguna fuente vino degradada.',
        error: 'Última corrida con error. Requiere revisión.',
    }

    return (
        <div className="rounded-2xl border p-4">
            <div className="flex flex-wrap items-center gap-3">
                <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getHealthClasses(health)}`}
                >
                    {getHealthLabel(health)}
                </span>

                <p className="text-sm text-neutral-400">
                    {messageByHealth[health]}
                </p>
            </div>
        </div>
    )
}

function SummaryCards({ runs }: { runs: ScrapeRun[] }) {
    const latest = runs[0]
    const healthyCount = runs.filter((run) => getRunHealth(run) === 'healthy').length
    const degradedCount = runs.filter((run) => getRunHealth(run) === 'degraded').length
    const errorCount = runs.filter((run) => getRunHealth(run) === 'error').length
    const totalJobs = runs.reduce((acc, run) => acc + run.jobs_found, 0)

    return (
        <section className="grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Último run</p>
                <p className="mt-2 text-lg font-semibold">
                    {latest ? formatDate(latest.started_at) : 'Sin datos'}
                </p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Healthy</p>
                <p className="mt-2 text-lg font-semibold">{healthyCount}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Degraded</p>
                <p className="mt-2 text-lg font-semibold">{degradedCount}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Errores</p>
                <p className="mt-2 text-lg font-semibold">{errorCount}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Jobs encontrados</p>
                <p className="mt-2 text-lg font-semibold">{totalJobs}</p>
            </div>
        </section>
    )
}

function RunsTable({ runs }: { runs: ScrapeRun[] }) {
    if (!runs.length) {
        return (
            <div className="rounded-2xl border p-6 text-neutral-500">
                No hay corridas registradas todavía.
            </div>
        )
    }

    return (
        <div className="overflow-hidden rounded-2xl border">
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50 text-left text-black">
                        <tr className="border-b">
                            <th className="px-4 py-3 font-medium">Estado</th>
                            <th className="px-4 py-3 font-medium">Salud</th>
                            <th className="px-4 py-3 font-medium">Inicio</th>
                            <th className="px-4 py-3 font-medium">Duración</th>
                            <th className="px-4 py-3 font-medium">Jobs</th>
                            <th className="px-4 py-3 font-medium">Procesados</th>
                            <th className="px-4 py-3 font-medium">Matches</th>
                            <th className="px-4 py-3 font-medium">Fuentes</th>
                            <th className="px-4 py-3 font-medium">Error</th>
                        </tr>
                    </thead>

                    <tbody>
                        {runs.map((run) => {
                            const health = getRunHealth(run)

                            return (
                                <tr key={run.id} className="border-b align-top last:border-b-0">
                                    <td className="px-4 py-4">
                                        <span
                                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(run.status)}`}
                                        >
                                            {run.status === 'success' ? 'SUCCESS' : 'ERROR'}
                                        </span>
                                    </td>

                                    <td className="px-4 py-4">
                                        <span
                                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getHealthClasses(health)}`}
                                        >
                                            {getHealthLabel(health)}
                                        </span>
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap">
                                        {formatDate(run.started_at)}
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap">
                                        {formatDuration(run.duration_ms)}
                                    </td>

                                    <td className="px-4 py-4">{run.jobs_found}</td>
                                    <td className="px-4 py-4">{run.jobs_processed}</td>
                                    <td className="px-4 py-4">{run.matches_created}</td>

                                    <td className="px-4 py-4">
                                        <div className="flex flex-col gap-2">
                                            {(run.scrape_run_sources ?? []).map((source) => (
                                                <div
                                                    key={source.id}
                                                    className="flex items-center justify-between gap-3 rounded-lg bg-neutral-100 px-3 py-2 text-black"
                                                >
                                                    <div className="flex items-center gap-2">
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

                                                    <span className="text-neutral-600">
                                                        {source.jobs_found} jobs
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </td>

                                    <td className="px-4 py-4">
                                        {run.error_message ? (
                                            <div className="max-w-xs rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                                                {run.error_message}
                                            </div>
                                        ) : (
                                            <span className="text-neutral-400">—</span>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function RunsSkeleton() {
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border p-4">
                <div className="h-6 w-80 animate-pulse rounded bg-neutral-900" />
            </div>

            <div className="grid gap-4 md:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border p-4">
                        <div className="h-4 w-24 animate-pulse rounded bg-neutral-800" />
                        <div className="mt-3 h-7 w-20 animate-pulse rounded bg-neutral-900" />
                    </div>
                ))}
            </div>

            <div className="rounded-2xl border p-4">
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-16 animate-pulse rounded bg-neutral-900" />
                    ))}
                </div>
            </div>
        </div>
    )
}

async function RunsContent() {
    const runs = await getRuns()

    return (
        <>
            <LatestRunHealthBanner runs={runs} />
            <SummaryCards runs={runs} />
            <RunsTable runs={runs} />
        </>
    )
}

export default function AdminRunsPage() {
    return (
        <main className="space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-semibold">Scrape Runs</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Monitoreo de corridas del colector, resultados y fuentes.
                </p>
            </div>

            <Suspense fallback={<RunsSkeleton />}>
                <RunsContent />
            </Suspense>
        </main>
    )
}