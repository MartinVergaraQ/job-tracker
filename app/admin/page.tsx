import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
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
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

function formatDuration(ms: number) {
    if (!ms) return '0s'
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
        return 'border-green-500/30 bg-green-500/10 text-green-300'
    }

    if (health === 'degraded') {
        return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
    }

    return 'border-red-500/30 bg-red-500/10 text-red-300'
}

function getHealthLabel(health: 'healthy' | 'degraded' | 'error') {
    if (health === 'healthy') return 'Sistema sano'
    if (health === 'degraded') return 'Sistema degradado'
    return 'Error'
}

function getSourceClasses(sourceName: string) {
    if (sourceName === 'getonboard') return 'bg-green-500/10 text-green-300 border-green-500/20'
    if (sourceName === 'chiletrabajos') return 'bg-orange-500/10 text-orange-300 border-orange-500/20'
    if (sourceName === 'duolaboral') return 'bg-purple-500/10 text-purple-300 border-purple-500/20'
    if (sourceName === 'linkedin_email_alerts') return 'bg-blue-500/10 text-blue-300 border-blue-500/20'
    if (sourceName === 'computrabajo_email_alerts') return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'

    return 'bg-neutral-500/10 text-neutral-300 border-neutral-500/20'
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

    if (latestRunResponse.error) throw new Error(latestRunResponse.error.message)
    if (jobs24hResponse.error) throw new Error(jobs24hResponse.error.message)
    if (profilesResponse.error) throw new Error(profilesResponse.error.message)
    if (matchRowsResponse.error) throw new Error(matchRowsResponse.error.message)

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

        if (appError) throw new Error(appError.message)

        applications = (appData ?? []) as JobApplicationRow[]
    }

    const appMap = new Map<string, JobApplicationRow>()

    for (const app of applications) {
        appMap.set(`${app.job_id}|${app.profile_id}`, app)
    }

    const conversion = {
        matches: 0,
        saved: 0,
        applied: 0,
        interview: 0,
        rejected: 0,
        offer: 0,
        unassignedCv: 0,
    }

    for (const row of matchRows) {
        const job = getRelationObject(row.jobs)
        const profile = getRelationObject(row.search_profiles)

        if (!job || !profile) continue

        conversion.matches += 1

        const application = appMap.get(`${job.id}|${profile.id}`)

        if (!application?.cv_variant) conversion.unassignedCv += 1
        if (application?.status === 'saved') conversion.saved += 1
        if (application?.status === 'applied') conversion.applied += 1
        if (application?.status === 'interview') conversion.interview += 1
        if (application?.status === 'rejected') conversion.rejected += 1
        if (application?.status === 'offer') conversion.offer += 1
    }

    return {
        latestRun,
        jobs24h,
        profilesCount,
        conversion,
        conversionLookbackDays,
    }
}

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="rounded-3xl border bg-neutral-950 p-8">
                <div className="h-8 w-64 animate-pulse rounded bg-neutral-900" />
                <div className="mt-4 h-4 w-96 animate-pulse rounded bg-neutral-900" />
            </div>

            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border p-4">
                        <div className="h-4 w-24 animate-pulse rounded bg-neutral-900" />
                        <div className="mt-4 h-8 w-16 animate-pulse rounded bg-neutral-900" />
                    </div>
                ))}
            </div>
        </div>
    )
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
        <div className="rounded-2xl border bg-neutral-950/40 p-5">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
            {helper ? <p className="mt-2 text-xs text-neutral-500">{helper}</p> : null}
        </div>
    )
}

function QuickAction({
    href,
    title,
    description,
    badge,
}: {
    href: string
    title: string
    description: string
    badge?: string
}) {
    return (
        <Link
            href={href}
            className="group rounded-2xl border bg-neutral-950/30 p-5 transition hover:-translate-y-0.5 hover:bg-neutral-950"
        >
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-500">
                        {description}
                    </p>
                </div>

                {badge ? (
                    <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400">
                        {badge}
                    </span>
                ) : null}
            </div>

            <p className="mt-4 text-sm text-neutral-400 group-hover:text-white">
                Abrir →
            </p>
        </Link>
    )
}

function SectionCard({
    title,
    description,
    children,
}: {
    title: string
    description?: string
    children: ReactNode
}) {
    return (
        <section className="rounded-3xl border bg-neutral-950/20 p-6">
            <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                {description ? (
                    <p className="mt-1 text-sm text-neutral-500">{description}</p>
                ) : null}
            </div>

            <div className="mt-6">{children}</div>
        </section>
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

    const appliedRate = safeRate(conversion.applied, conversion.matches)
    const interviewRate = safeRate(conversion.interview, conversion.applied)

    return (
        <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-8">
                <div className="flex flex-wrap items-start justify-between gap-6">
                    <div>
                        <div className="mb-4 inline-flex rounded-full border border-neutral-800 bg-black/30 px-3 py-1 text-xs text-neutral-400">
                            Job Tracker · Admin Command Center
                        </div>

                        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
                            Tu radar laboral está funcionando. Ahora toca convertir matches en entrevistas.
                        </h1>

                        <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-400">
                            Revisa fuentes, oportunidades recientes, postulaciones, seguimientos
                            y rendimiento de CV desde un solo lugar.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-neutral-800 bg-black/30 p-4 text-sm">
                        <p className="text-neutral-500">Última corrida</p>

                        {latestRun ? (
                            <>
                                <p className="mt-2 font-medium">{formatDate(latestRun.started_at)}</p>
                                <p className="mt-1 text-neutral-500">
                                    Duración: {formatDuration(latestRun.duration_ms)}
                                </p>
                            </>
                        ) : (
                            <p className="mt-2 text-neutral-400">Sin corridas registradas</p>
                        )}

                        {latestRunHealth ? (
                            <span
                                className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getHealthClasses(latestRunHealth)}`}
                            >
                                {getHealthLabel(latestRunHealth)}
                            </span>
                        ) : null}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <KpiCard label="Jobs 24h" value={jobs24h} />
                <KpiCard label="Perfiles activos" value={profilesCount} />
                <KpiCard label={`${conversionLookbackDays}d matches`} value={conversion.matches} />
                <KpiCard
                    label="Postulé"
                    value={conversion.applied}
                    helper={formatPercent(appliedRate)}
                />
                <KpiCard
                    label="Entrevista"
                    value={conversion.interview}
                    helper={`Sobre postuladas: ${formatPercent(interviewRate)}`}
                />
                <KpiCard label="CV sin definir" value={conversion.unassignedCv} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <SectionCard
                    title="Acciones rápidas"
                    description="Lo que más vas a usar durante el día."
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        <QuickAction
                            href="/admin/today"
                            title="Acciones de hoy"
                            description="Postular, hacer seguimiento y revisar entrevistas activas."
                            badge="Diario"
                        />

                        <QuickAction
                            href="/admin/top-matches"
                            title="Top Matches"
                            description="Ver las mejores oportunidades recientes y preparar postulaciones."
                            badge="Prioridad"
                        />

                        <QuickAction
                            href="/admin/conversion"
                            title="Conversión"
                            description="Medir fuente, CV usado, postulaciones y entrevistas."
                            badge="Métricas"
                        />

                        <QuickAction
                            href="/admin/runs"
                            title="Runs"
                            description="Auditar corridas, fuentes caídas y cantidad de trabajos encontrados."
                            badge="Monitoreo"
                        />

                        <QuickAction
                            href="/admin/jobs"
                            title="Jobs"
                            description="Explorar trabajos guardados en la base de datos."
                        />

                        <QuickAction
                            href="/admin/sources"
                            title="Fuentes"
                            description="Revisar de dónde vienen las oportunidades y detectar ruido."
                        />
                    </div>
                </SectionCard>

                <SectionCard
                    title="Estado de fuentes"
                    description="Resumen de la última corrida registrada."
                >
                    {!latestRun ? (
                        <div className="rounded-2xl border border-neutral-800 p-4 text-sm text-neutral-500">
                            Todavía no hay datos de fuentes.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {(latestRun.scrape_run_sources ?? []).map((source) => (
                                <div
                                    key={source.source_name}
                                    className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-black/20 p-4"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">{source.source_name}</p>
                                        <p className="mt-1 text-xs text-neutral-500">
                                            {source.jobs_found} trabajos encontrados
                                        </p>
                                    </div>

                                    <span
                                        className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${source.ok
                                            ? getSourceClasses(source.source_name)
                                            : 'border-red-500/20 bg-red-500/10 text-red-300'
                                            }`}
                                    >
                                        {source.ok ? 'OK' : 'FAIL'}
                                    </span>
                                </div>
                            ))}

                            {latestRun.error_message ? (
                                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                                    {latestRun.error_message}
                                </div>
                            ) : null}
                        </div>
                    )}
                </SectionCard>
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
                <SectionCard title="Plan de uso diario">
                    <div className="space-y-4 text-sm text-neutral-300">
                        <p>1. Entra a “Acciones de hoy”.</p>
                        <p>2. Postula primero a los matches de mayor score.</p>
                        <p>3. Marca cada postulación como “Postulé”.</p>
                        <p>4. Define qué CV usaste para medir rendimiento real.</p>
                    </div>
                </SectionCard>

                <SectionCard title="Automatización actual">
                    <div className="space-y-4 text-sm text-neutral-300">
                        <p>• Recolecta empleos desde varias fuentes.</p>
                        <p>• Calcula matches por perfil.</p>
                        <p>• Evita reenviar notificaciones repetidas.</p>
                        <p>• Notifica por Telegram/email según perfil.</p>
                    </div>
                </SectionCard>

                <SectionCard title="Próximo upgrade recomendado">
                    <div className="space-y-4 text-sm text-neutral-300">
                        <p>Crear un panel de “fuentes rentables”.</p>
                        <p>
                            La idea: dejar de perseguir cantidad y medir qué fuente realmente
                            genera postulaciones y entrevistas.
                        </p>
                    </div>
                </SectionCard>
            </section>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 text-xs text-neutral-500">
                UI build marker: admin-dashboard-v2
            </div>
        </div>
    )
}

export default function AdminPage() {
    return (
        <main className="space-y-6 p-6">
            <Suspense fallback={<DashboardSkeleton />}>
                <DashboardContent />
            </Suspense>
        </main>
    )
}