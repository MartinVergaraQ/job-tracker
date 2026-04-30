import { Suspense } from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { setJobApplicationStatus } from '../top-matches/actions'
import { clearFollowUp, scheduleFollowUp } from './actions'
import { connection } from 'next/server'

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
    id: string
    job_id: string
    profile_id: string
    status: 'saved' | 'applied' | 'interview' | 'rejected' | 'offer'
    applied_at: string | null
    follow_up_at: string | null
    notes: string | null
    cv_variant: string | null
    jobs: JobRow | JobRow[] | null
    search_profiles: SearchProfileRow | SearchProfileRow[] | null
}

type ExistingApplicationRow = {
    job_id: string
    profile_id: string
    status: 'saved' | 'applied' | 'interview' | 'rejected' | 'offer'
}

function getRelationObject<T>(value: T | T[] | null | undefined): T | null {
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

function getSourceClasses(sourceName: string | null) {
    if (sourceName === 'duolaboral') return 'bg-purple-100 text-purple-700'
    if (sourceName === 'linkedin_email_alerts') return 'bg-blue-100 text-blue-700'
    if (sourceName === 'chiletrabajos') return 'bg-orange-100 text-orange-700'
    if (sourceName === 'getonboard') return 'bg-green-100 text-green-700'
    if (sourceName === 'computrabajo_email_alerts') return 'bg-cyan-100 text-cyan-700'
    return 'bg-neutral-100 text-neutral-700'
}

function getStatusLabel(status: string) {
    if (status === 'saved') return 'Guardada'
    if (status === 'applied') return 'Postulé'
    if (status === 'interview') return 'Entrevista'
    if (status === 'rejected') return 'Rechazada'
    if (status === 'offer') return 'Oferta'
    return 'Pendiente'
}

function getPublishedTime(job: JobRow | null) {
    if (!job?.published_at) return 0

    const time = new Date(job.published_at).getTime()
    return Number.isNaN(time) ? 0 : time
}

async function getTodayData() {
    const supabase = createAdminClient()

    const lookbackHours = Number(process.env.TODAY_LOOKBACK_HOURS ?? 72)
    const minScore = Number(process.env.TODAY_MIN_SCORE ?? 60)
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const { data: matchData, error: matchError } = await supabase
        .from('job_matches')
        .select(`
            id,
            score,
            reasons,
            is_match,
            jobs!inner (
                id,
                title,
                company,
                location,
                url,
                source_name,
                published_at
            ),
            search_profiles!inner (
                id,
                name,
                slug
            )
        `)
        .eq('is_match', true)
        .gte('score', minScore)
        .gte('jobs.published_at', since)
        .limit(300)

    if (matchError) {
        throw new Error(matchError.message)
    }

    const matches = (matchData ?? []) as JobMatchRow[]

    const matchKeys = matches
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

    const uniqueJobIds = Array.from(new Set(matchKeys.map((item) => item.job_id)))
    const uniqueProfileIds = Array.from(new Set(matchKeys.map((item) => item.profile_id)))

    let existingApplications: ExistingApplicationRow[] = []

    if (uniqueJobIds.length > 0 && uniqueProfileIds.length > 0) {
        const { data: appData, error: appError } = await supabase
            .from('job_applications')
            .select('job_id, profile_id, status')
            .in('job_id', uniqueJobIds)
            .in('profile_id', uniqueProfileIds)

        if (appError) {
            throw new Error(appError.message)
        }

        existingApplications = (appData ?? []) as ExistingApplicationRow[]
    }

    const applicationStatusMap = new Map<string, ExistingApplicationRow>()

    for (const app of existingApplications) {
        applicationStatusMap.set(`${app.job_id}|${app.profile_id}`, app)
    }

    const pendingMatches = matches
        .filter((row) => {
            const job = getRelationObject(row.jobs)
            const profile = getRelationObject(row.search_profiles)

            if (!job || !profile) return false

            const app = applicationStatusMap.get(`${job.id}|${profile.id}`)

            if (!app) return true

            return app.status === 'saved'
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score

            const aJob = getRelationObject(a.jobs)
            const bJob = getRelationObject(b.jobs)

            return getPublishedTime(bJob) - getPublishedTime(aJob)
        })
        .slice(0, 25)

    const { data: followUpData, error: followUpError } = await supabase
        .from('job_applications')
        .select(`
            id,
            job_id,
            profile_id,
            status,
            applied_at,
            follow_up_at,
            notes,
            cv_variant,
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
        .eq('status', 'applied')
        .not('follow_up_at', 'is', null)
        .lte('follow_up_at', now)
        .order('follow_up_at', { ascending: true })
        .limit(50)

    if (followUpError) {
        throw new Error(followUpError.message)
    }

    const { data: interviewData, error: interviewError } = await supabase
        .from('job_applications')
        .select(`
            id,
            job_id,
            profile_id,
            status,
            applied_at,
            follow_up_at,
            notes,
            cv_variant,
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
        .eq('status', 'interview')
        .order('updated_at', { ascending: false })
        .limit(50)

    if (interviewError) {
        throw new Error(interviewError.message)
    }

    return {
        pendingMatches,
        followUps: (followUpData ?? []) as JobApplicationRow[],
        interviews: (interviewData ?? []) as JobApplicationRow[],
        meta: {
            minScore,
            lookbackHours,
        },
    }
}

function StatCard({
    label,
    value,
}: {
    label: string
    value: number
}) {
    return (
        <div className="rounded-2xl border p-4">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
        </div>
    )
}

function MatchActionCard({
    row,
}: {
    row: JobMatchRow
}) {
    const job = getRelationObject(row.jobs)
    const profile = getRelationObject(row.search_profiles)

    if (!job || !profile) return null

    return (
        <article className="rounded-2xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${getSourceClasses(job.source_name)}`}
                        >
                            {job.source_name ?? 'sin fuente'}
                        </span>

                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                            Score {row.score}
                        </span>

                        <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-700">
                            Postular hoy
                        </span>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold">{job.title}</h3>
                        <p className="text-sm text-neutral-400">
                            {job.company ?? 'Sin empresa'} · {job.location ?? 'Sin ubicación'}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                            Perfil: {profile.name} · Publicado: {formatDate(job.published_at)}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
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
                        Preparar
                    </Link>
                </div>
            </div>

            <div className="mt-4 rounded-xl bg-neutral-950 p-4">
                <p className="text-sm font-medium">Por qué conviene</p>
                <ul className="mt-3 space-y-1 text-sm text-neutral-300">
                    {(row.reasons ?? []).slice(0, 6).map((reason, index) => (
                        <li key={index}>• {reason}</li>
                    ))}
                </ul>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                <form action={setJobApplicationStatus}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="profile_id" value={profile.id} />
                    <button
                        type="submit"
                        name="status"
                        value="saved"
                        className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                    >
                        Guardar
                    </button>
                </form>

                <form action={setJobApplicationStatus}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="profile_id" value={profile.id} />
                    <button
                        type="submit"
                        name="status"
                        value="applied"
                        className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                    >
                        Marcar postulado
                    </button>
                </form>

                <form action={setJobApplicationStatus}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="profile_id" value={profile.id} />
                    <button
                        type="submit"
                        name="status"
                        value="rejected"
                        className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                    >
                        Descartar
                    </button>
                </form>
            </div>
        </article>
    )
}

function ApplicationActionCard({
    application,
    variant,
}: {
    application: JobApplicationRow
    variant: 'follow_up' | 'interview'
}) {
    const job = getRelationObject(application.jobs)
    const profile = getRelationObject(application.search_profiles)

    if (!job || !profile) return null

    return (
        <article className="rounded-2xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${getSourceClasses(job.source_name)}`}
                        >
                            {job.source_name ?? 'sin fuente'}
                        </span>

                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                            {variant === 'follow_up' ? 'Seguimiento' : 'Entrevista'}
                        </span>

                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                            {getStatusLabel(application.status)}
                        </span>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold">{job.title}</h3>
                        <p className="text-sm text-neutral-400">
                            {job.company ?? 'Sin empresa'} · {job.location ?? 'Sin ubicación'}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                            Perfil: {profile.name} · Postulación: {formatDate(application.applied_at)}
                        </p>
                        {application.follow_up_at ? (
                            <p className="mt-1 text-xs text-neutral-500">
                                Seguimiento: {formatDate(application.follow_up_at)}
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
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
                        Abrir
                    </Link>
                </div>
            </div>

            {application.notes ? (
                <div className="mt-4 rounded-xl bg-neutral-950 p-4 text-sm text-neutral-300">
                    {application.notes}
                </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
                {variant === 'follow_up' ? (
                    <>
                        <form action={scheduleFollowUp}>
                            <input type="hidden" name="application_id" value={application.id} />
                            <input type="hidden" name="days" value="5" />
                            <button
                                type="submit"
                                className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                            >
                                Reprogramar +5 días
                            </button>
                        </form>

                        <form action={clearFollowUp}>
                            <input type="hidden" name="application_id" value={application.id} />
                            <button
                                type="submit"
                                className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                            >
                                Seguimiento hecho
                            </button>
                        </form>
                    </>
                ) : null}

                <form action={setJobApplicationStatus}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="profile_id" value={profile.id} />
                    <button
                        type="submit"
                        name="status"
                        value="offer"
                        className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                    >
                        Oferta
                    </button>
                </form>

                <form action={setJobApplicationStatus}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="profile_id" value={profile.id} />
                    <button
                        type="submit"
                        name="status"
                        value="rejected"
                        className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                    >
                        Rechazada
                    </button>
                </form>
            </div>
        </article>
    )
}

function EmptyState({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="rounded-2xl border p-6 text-sm text-neutral-400">
            {children}
        </div>
    )
}

function TodaySkeleton() {
    return (
        <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-2xl border p-5">
                    <div className="h-5 w-56 animate-pulse rounded bg-neutral-900" />
                    <div className="mt-3 h-4 w-80 animate-pulse rounded bg-neutral-950" />
                    <div className="mt-5 h-24 animate-pulse rounded-xl bg-neutral-950" />
                </div>
            ))}
        </div>
    )
}

async function TodayContent() {
    await connection()

    const { pendingMatches, followUps, interviews, meta } = await getTodayData()

    return (
        <div className="space-y-8">
            <div className="rounded-2xl border p-4 text-sm text-neutral-400">
                Ventana de oportunidades: últimas {meta.lookbackHours} horas · Score mínimo: {meta.minScore}
            </div>

            <section className="grid gap-4 md:grid-cols-3">
                <StatCard label="Postular hoy" value={pendingMatches.length} />
                <StatCard label="Seguimientos vencidos" value={followUps.length} />
                <StatCard label="Entrevistas activas" value={interviews.length} />
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-xl font-semibold">1. Postular hoy</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                        Matches nuevos o guardados que todavía no están postulados.
                    </p>
                </div>

                {!pendingMatches.length ? (
                    <EmptyState>No tienes postulaciones urgentes ahora. Buena señal: estás al día.</EmptyState>
                ) : (
                    <div className="space-y-4">
                        {pendingMatches.map((row) => (
                            <MatchActionCard key={row.id} row={row} />
                        ))}
                    </div>
                )}
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-xl font-semibold">2. Hacer seguimiento</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                        Postulaciones aplicadas cuyo seguimiento ya venció.
                    </p>
                </div>

                {!followUps.length ? (
                    <EmptyState>No tienes seguimientos pendientes.</EmptyState>
                ) : (
                    <div className="space-y-4">
                        {followUps.map((application) => (
                            <ApplicationActionCard
                                key={application.id}
                                application={application}
                                variant="follow_up"
                            />
                        ))}
                    </div>
                )}
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-xl font-semibold">3. Entrevistas</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                        Oportunidades marcadas como entrevista.
                    </p>
                </div>

                {!interviews.length ? (
                    <EmptyState>Aún no hay entrevistas marcadas.</EmptyState>
                ) : (
                    <div className="space-y-4">
                        {interviews.map((application) => (
                            <ApplicationActionCard
                                key={application.id}
                                application={application}
                                variant="interview"
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}

export default function AdminTodayPage() {
    return (
        <main className="space-y-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Acciones de hoy</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Tu tablero diario para postular, hacer seguimiento y mover oportunidades.
                    </p>
                </div>

                <Link
                    href="/admin/top-matches"
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Ver Top Matches
                </Link>
            </div>

            <Suspense fallback={<TodaySkeleton />}>
                <TodayContent />
            </Suspense>
        </main>
    )
}