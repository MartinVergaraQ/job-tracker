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

type JobRow = {
    id: string
    published_at: string | null
}

type SearchProfileRow = {
    id: string
}

type JobMatchRow = {
    id: string
    is_match: boolean
    jobs: JobRow | JobRow[] | null
    search_profiles: SearchProfileRow | SearchProfileRow[] | null
}

type JobApplicationRow = {
    job_id: string
    profile_id: string
    status: 'saved' | 'applied' | 'interview' | 'rejected' | 'offer'
    cv_variant: string | null
}

function getRelationObject<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null
    }

    return value ?? null
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

function formatPercent(value: number) {
    return `${value.toFixed(1)}%`
}

function safeRate(numerator: number, denominator: number) {
    if (!denominator) return 0
    return (numerator / denominator) * 100
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
            <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
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
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-14 animate-pulse rounded bg-neutral-900" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

async function getDashboardData() {
    const supabase = createAdminClient()

    const jobs24hSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const conversionLookbackDays = Number(process.env.CONVERSION_LOOKBACK_DAYS ?? 30)
    const conversionSince = new Date(
        Date.now() - conversionLookbackDays * 24 * 60 * 60 * 1000
    ).toISOString()

    const [
        latestRunResponse,
        jobs24hResponse,
        profilesResponse,
        matchRowsResponse,
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
            .limit(1)
            .maybeSingle(),

        supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .gte('published_at', jobs24hSince),

        supabase
            .from('search_profiles')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true),

        supabase
            .from('job_matches')
            .select(`
                id,
                is_match,
                jobs (
                    id,
                    published_at
                ),
                search_profiles (
                    id
                )
            `)
            .eq('is_match', true)
            .gte('jobs.published_at', conversionSince)
            .limit(1000),
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

    if (matchRowsResponse.error) {
        throw new Error(matchRowsResponse.error.message)
    }

    const latestRun = (latestRunResponse.data ?? null) as LatestRun | null
    const jobs24h = jobs24hResponse.count ?? 0
    const profilesCount = profilesResponse.count ?? 0
    const matchRows = (matchRowsResponse.data ?? []) as JobMatchRow[]

    const keys = matchRows
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
            .select('job_id, profile_id, status, cv_variant')
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

    const conversion = {
        matches: 0,
        applied: 0,
        interview: 0,
        offer: 0,
        unassignedCv: 0,
    }

    for (const row of matchRows) {
        const job = getRelationObject(row.jobs)
        const profile = getRelationObject(row.search_profiles)

        if (!job || !profile) continue

        conversion.matches += 1

        const application = appMap.get(`${job.id}|${profile.id}`)

        if (!application?.cv_variant) {
            conversion.unassignedCv += 1
        }

        if (application?.status === 'applied') {
            conversion.applied += 1
        }

        if (application?.status === 'interview') {
            conversion.interview += 1
        }

        if (application?.status === 'offer') {
            conversion.offer += 1
        }
    }

    return {
        latestRun,
        jobs24h,
        profilesCount,
        conversion,
        conversionLookbackDays,
    }
}

function KpiCard({
    label,
    value,
    helper,
}: {
    label: string
    value: string | number
    helper?: string
}) {
    return (
        <div className="rounded-2xl border p-4">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
            {helper ? <p className="mt-2 text-xs text-neutral-500">{helper}</p> : null}
        </div>
    )
}

async function DashboardContent() {
    await connection()

    const {
        latestRun,
        jobs24h,
        profilesCount,
        conversion,
        conversionLookbackDays,
    } = await getDashboardData()

    const latestRunHealth = latestRun
        ? getRunHealthFromPersistedRun(latestRun)
        : null

    return (
        <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <KpiCard label="Jobs últimas 24h" value={jobs24h} />
                <KpiCard label="Perfiles activos" value={profilesCount} />
                <KpiCard label={`Matches ${conversionLookbackDays}d`} value={conversion.matches} />
                <KpiCard
                    label="Postulé"
                    value={conversion.applied}
                    helper={formatPercent(safeRate(conversion.applied, conversion.matches))}
                />
                <KpiCard
                    label="Entrevista"
                    value={conversion.interview}
                    helper={formatPercent(safeRate(conversion.interview, conversion.matches))}
                />
                <KpiCard label="CV sin definir" value={conversion.unassignedCv} />
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

                        <div className="flex items-center gap-3">
                            {latestRunHealth ? (
                                <span
                                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getHealthClasses(latestRunHealth)}`}
                                >
                                    {getHealthLabel(latestRunHealth)}
                                </span>
                            ) : null}

                            <Link
                                href="/admin/runs"
                                className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-900"
                            >
                                Ver runs
                            </Link>
                        </div>
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

                                {latestRun.error_message ? (
                                    <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                                        {latestRun.error_message}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-semibold">Conversión rápida</h2>
                            <p className="mt-1 text-sm text-neutral-500">
                                Foto resumida de cómo avanzan tus matches recientes.
                            </p>
                        </div>

                        <Link
                            href="/admin/conversion"
                            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-900"
                        >
                            Ver conversión
                        </Link>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl bg-neutral-950 p-4">
                            <p className="text-sm text-neutral-500">Matches</p>
                            <p className="mt-2 font-medium">{conversion.matches}</p>
                        </div>

                        <div className="rounded-xl bg-neutral-950 p-4">
                            <p className="text-sm text-neutral-500">Postulé</p>
                            <p className="mt-2 font-medium">
                                {conversion.applied} · {formatPercent(safeRate(conversion.applied, conversion.matches))}
                            </p>
                        </div>

                        <div className="rounded-xl bg-neutral-950 p-4">
                            <p className="text-sm text-neutral-500">Entrevista</p>
                            <p className="mt-2 font-medium">
                                {conversion.interview} · {formatPercent(safeRate(conversion.interview, conversion.matches))}
                            </p>
                        </div>

                        <div className="rounded-xl bg-neutral-950 p-4">
                            <p className="text-sm text-neutral-500">Oferta</p>
                            <p className="mt-2 font-medium">
                                {conversion.offer} · {formatPercent(safeRate(conversion.offer, conversion.matches))}
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 rounded-2xl bg-neutral-950 p-4">
                        <p className="text-sm text-neutral-500">Ventana analizada</p>
                        <p className="mt-2 text-sm">
                            Últimos {conversionLookbackDays} días. Mientras más vayas marcando
                            `applied`, `interview` y `offer`, más valor te va a dar este panel.
                        </p>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border p-6">
                    <h2 className="text-lg font-semibold">Accesos rápidos</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                        Navegación principal del panel admin.
                    </p>

                    <div className="mt-6 grid gap-4">
                        <Link
                            href="/admin/today"
                            className="rounded-2xl border p-4 transition hover:bg-neutral-950"
                        >
                            <p className="font-medium">Acciones de hoy</p>
                            <p className="mt-1 text-sm text-neutral-500">
                                Ver qué postular hoy, seguimientos vencidos y entrevistas activas.
                            </p>
                        </Link>
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
                            href="/admin/top-matches"
                            className="rounded-2xl border p-4 transition hover:bg-neutral-950"
                        >
                            <p className="font-medium">Top Matches</p>
                            <p className="mt-1 text-sm text-neutral-500">
                                Revisar oportunidades recientes, notas y CV usado.
                            </p>
                        </Link>

                        <Link
                            href="/admin/conversion"
                            className="rounded-2xl border p-4 transition hover:bg-neutral-950"
                        >
                            <p className="font-medium">Conversión</p>
                            <p className="mt-1 text-sm text-neutral-500">
                                Ver match → postulación → entrevista → oferta por fuente y CV.
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
                </div>

                <div className="rounded-2xl border p-6">
                    <h2 className="text-lg font-semibold">Qué mirar hoy</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                        Checklist corto para usar el sistema con intención.
                    </p>

                    <div className="mt-6 space-y-3 text-sm text-neutral-300">
                        <p>• Revisar top matches nuevas de las últimas 24–72 horas.</p>
                        <p>• Marcar como `applied` apenas postules para no perder seguimiento.</p>
                        <p>• Elegir CV en cada postulación para medir qué versión rinde mejor.</p>
                        <p>• Mirar la conversión por fuente y por CV antes de agregar más ruido.</p>
                    </div>

                    <div className="mt-6 rounded-2xl bg-neutral-950 p-4">
                        <p className="text-sm text-neutral-500">Siguiente paso recomendado</p>
                        <p className="mt-2 text-sm">
                            Cuando esto ya tenga datos reales, el próximo upgrade útil es
                            automatizar sugerencias de CV y medir qué fuente te consigue más entrevistas.
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
                    Vista general del estado del colector, jobs, conversión y monitoreo.
                </p>
            </div>

            <Suspense fallback={<DashboardSkeleton />}>
                <DashboardContent />
            </Suspense>
        </main>
    )
}