import { Suspense } from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

type NotificationRow = {
    id: string
    job_id: string
    profile_id: string
    channel: 'telegram' | 'email'
    recipient: string
    last_sent_score: number
    send_count: number
    first_sent_at: string | null
    last_sent_at: string | null
    updated_at: string | null
}

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
    telegram_chat_id: string | null
    notification_email: string | null
}

type NotificationViewRow = {
    notification: NotificationRow
    job: JobRow | null
    profile: SearchProfileRow | null
}

function formatDate(value: string | null) {
    if (!value) return 'Sin fecha'

    return new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(value))
}

function getChannelLabel(channel: string) {
    if (channel === 'telegram') return 'Telegram'
    if (channel === 'email') return 'Email'
    return channel
}

function getChannelClasses(channel: string) {
    if (channel === 'telegram') {
        return 'bg-blue-100 text-blue-700 border-blue-200'
    }

    if (channel === 'email') {
        return 'bg-green-100 text-green-700 border-green-200'
    }

    return 'bg-neutral-100 text-neutral-700 border-neutral-200'
}

function getSourceClasses(sourceName: string | null) {
    if (sourceName === 'duolaboral') return 'bg-purple-100 text-purple-700'
    if (sourceName === 'linkedin_email_alerts') return 'bg-blue-100 text-blue-700'
    if (sourceName === 'computrabajo_email_alerts') return 'bg-cyan-100 text-cyan-700'
    if (sourceName === 'chiletrabajos') return 'bg-orange-100 text-orange-700'
    if (sourceName === 'getonboard') return 'bg-green-100 text-green-700'

    return 'bg-neutral-100 text-neutral-700'
}

async function getNotifications(): Promise<NotificationViewRow[]> {
    const supabase = createAdminClient()

    const { data: notificationsData, error: notificationsError } = await supabase
        .from('job_match_notifications')
        .select(`
            id,
            job_id,
            profile_id,
            channel,
            recipient,
            last_sent_score,
            send_count,
            first_sent_at,
            last_sent_at,
            updated_at
        `)
        .order('last_sent_at', { ascending: false })
        .limit(200)

    if (notificationsError) {
        throw new Error(notificationsError.message)
    }

    const notifications = (notificationsData ?? []) as NotificationRow[]

    const jobIds = Array.from(
        new Set(
            notifications
                .map((item) => item.job_id)
                .filter((value): value is string => Boolean(value))
        )
    )

    const profileIds = Array.from(
        new Set(
            notifications
                .map((item) => item.profile_id)
                .filter((value): value is string => Boolean(value))
        )
    )

    let jobs: JobRow[] = []
    let profiles: SearchProfileRow[] = []

    if (jobIds.length > 0) {
        const { data: jobsData, error: jobsError } = await supabase
            .from('jobs')
            .select(`
                id,
                title,
                company,
                location,
                url,
                source_name,
                published_at
            `)
            .in('id', jobIds)

        if (jobsError) {
            throw new Error(jobsError.message)
        }

        jobs = (jobsData ?? []) as JobRow[]
    }

    if (profileIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
            .from('search_profiles')
            .select(`
                id,
                name,
                slug,
                telegram_chat_id,
                notification_email
            `)
            .in('id', profileIds)

        if (profilesError) {
            throw new Error(profilesError.message)
        }

        profiles = (profilesData ?? []) as SearchProfileRow[]
    }

    const jobMap = new Map(jobs.map((job) => [job.id, job]))
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))

    return notifications.map((notification) => ({
        notification,
        job: jobMap.get(notification.job_id) ?? null,
        profile: profileMap.get(notification.profile_id) ?? null,
    }))
}

function SummaryCards({ rows }: { rows: NotificationViewRow[] }) {
    const totalSent = rows.length
    const telegramCount = rows.filter(
        (row) => row.notification.channel === 'telegram'
    ).length
    const emailCount = rows.filter(
        (row) => row.notification.channel === 'email'
    ).length
    const resendCount = rows.filter(
        (row) => row.notification.send_count > 1
    ).length

    return (
        <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Notificaciones</p>
                <p className="mt-2 text-2xl font-semibold">{totalSent}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Telegram</p>
                <p className="mt-2 text-2xl font-semibold">{telegramCount}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Email</p>
                <p className="mt-2 text-2xl font-semibold">{emailCount}</p>
            </div>

            <div className="rounded-2xl border p-4">
                <p className="text-sm text-neutral-500">Reenviadas por mejora</p>
                <p className="mt-2 text-2xl font-semibold">{resendCount}</p>
            </div>
        </section>
    )
}

function NotificationCard({ row }: { row: NotificationViewRow }) {
    const { notification, job, profile } = row

    return (
        <article className="rounded-2xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getChannelClasses(
                                notification.channel
                            )}`}
                        >
                            {getChannelLabel(notification.channel)}
                        </span>

                        <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getSourceClasses(
                                job?.source_name ?? null
                            )}`}
                        >
                            {job?.source_name ?? 'sin fuente'}
                        </span>

                        <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                            Score {notification.last_sent_score}
                        </span>

                        <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                            Envíos {notification.send_count}
                        </span>
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold">
                            {job?.title ?? 'Trabajo no encontrado'}
                        </h2>

                        <p className="text-sm text-neutral-400">
                            {job?.company ?? 'Sin empresa'} ·{' '}
                            {job?.location ?? 'Sin ubicación'}
                        </p>

                        <p className="mt-1 text-xs text-neutral-500">
                            Perfil: {profile?.name ?? 'Perfil no encontrado'} ·{' '}
                            Destino: {notification.recipient}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {job?.url ? (
                        <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                        >
                            Ver oferta
                        </a>
                    ) : null}

                    {job && profile ? (
                        <Link
                            href={`/admin/top-matches/${job.id}/${profile.id}`}
                            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                        >
                            Preparar postulación
                        </Link>
                    ) : null}
                </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-neutral-500">Primer envío</p>
                    <p className="mt-1 text-neutral-200">
                        {formatDate(notification.first_sent_at)}
                    </p>
                </div>

                <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-neutral-500">Último envío</p>
                    <p className="mt-1 text-neutral-200">
                        {formatDate(notification.last_sent_at)}
                    </p>
                </div>

                <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-neutral-500">Publicado</p>
                    <p className="mt-1 text-neutral-200">
                        {formatDate(job?.published_at ?? null)}
                    </p>
                </div>
            </div>
        </article>
    )
}

function NotificationsSkeleton() {
    return (
        <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-2xl border p-5">
                    <div className="h-5 w-48 animate-pulse rounded bg-neutral-900" />
                    <div className="mt-3 h-4 w-72 animate-pulse rounded bg-neutral-950" />
                    <div className="mt-5 h-20 animate-pulse rounded-xl bg-neutral-950" />
                </div>
            ))}
        </div>
    )
}

async function NotificationsContent() {
    const rows = await getNotifications()

    return (
        <div className="space-y-5">
            <SummaryCards rows={rows} />

            {!rows.length ? (
                <div className="rounded-2xl border p-6 text-neutral-400">
                    Todavía no hay notificaciones registradas.
                </div>
            ) : (
                <section className="space-y-4">
                    {rows.map((row) => (
                        <NotificationCard
                            key={row.notification.id}
                            row={row}
                        />
                    ))}
                </section>
            )}
        </div>
    )
}

export default function AdminNotificationsPage() {
    return (
        <main className="space-y-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Historial de notificaciones
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Control real de matches enviados por Telegram y email.
                    </p>
                </div>

                <Link
                    href="/admin/top-matches"
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Ver Top Matches
                </Link>
            </div>

            <Suspense fallback={<NotificationsSkeleton />}>
                <NotificationsContent />
            </Suspense>
        </main>
    )
}