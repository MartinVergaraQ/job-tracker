import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/notifications/telegram'
import { sendEmailNotification } from '@/lib/notifications/email'
import {
    markNotificationSent,
    shouldSendNotification,
} from '@/lib/notifications/job-match-notifications'

export const maxDuration = 60

type NotificationChannel = 'telegram' | 'email'

type SearchProfileRow = {
    id: string
    name: string
    slug: string
    is_active: boolean
    notification_channel: NotificationChannel | null
    telegram_chat_id: string | null
    notification_email: string | null
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

type JobMatchRow = {
    id: string
    job_id: string
    profile_id: string
    score: number
    reasons: string[] | null
    is_match: boolean
    notified_at: string | null
    jobs: JobRow | JobRow[] | null
    search_profiles: SearchProfileRow | SearchProfileRow[] | null
}

type NotificationTarget = {
    channel: NotificationChannel
    recipient: string
}

function getEnvNumber(name: string, fallback: number) {
    const raw = process.env[name]
    const value = Number(raw ?? fallback)

    return Number.isFinite(value) && value > 0 ? value : fallback
}

const NOTIFICATION_MIN_SCORE = getEnvNumber('NOTIFICATION_MIN_SCORE', 60)

const NOTIFICATION_MAX_PER_PROFILE = getEnvNumber(
    'NOTIFICATION_MAX_PER_PROFILE',
    5
)

const NOTIFICATION_LOOKBACK_HOURS = getEnvNumber(
    'NOTIFICATION_LOOKBACK_HOURS',
    getEnvNumber('TOP_MATCHES_LOOKBACK_HOURS', 72)
)

function getRelationObject<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null
    }

    return value ?? null
}

function normalizeString(value: string | null | undefined) {
    const normalized = value?.trim() ?? ''
    return normalized.length > 0 ? normalized : null
}

function getPublishedAtTime(job: JobRow | null) {
    if (!job?.published_at) return 0

    const time = new Date(job.published_at).getTime()

    return Number.isNaN(time) ? 0 : time
}

function sortRows(rows: JobMatchRow[]) {
    return [...rows].sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score
        }

        const aJob = getRelationObject(a.jobs)
        const bJob = getRelationObject(b.jobs)

        return getPublishedAtTime(bJob) - getPublishedAtTime(aJob)
    })
}

function resolveNotificationTarget(
    profile: SearchProfileRow
): NotificationTarget | null {
    const telegramChatId = normalizeString(profile.telegram_chat_id)
    const email = normalizeString(profile.notification_email)

    if (profile.notification_channel === 'telegram') {
        if (!telegramChatId) return null

        return {
            channel: 'telegram',
            recipient: telegramChatId,
        }
    }

    if (profile.notification_channel === 'email') {
        if (!email) return null

        return {
            channel: 'email',
            recipient: email,
        }
    }

    // Fallback senior:
    // si notification_channel viene null, usamos lo que exista.
    if (telegramChatId) {
        return {
            channel: 'telegram',
            recipient: telegramChatId,
        }
    }

    if (email) {
        return {
            channel: 'email',
            recipient: email,
        }
    }

    return null
}

function escapeHtml(value: string | null | undefined) {
    return (value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function buildTelegramText(
    match: JobMatchRow,
    job: JobRow,
    profile: SearchProfileRow
) {
    const reasons = (match.reasons ?? []).slice(0, 6)

    return [
        `Nuevo match para: ${profile.name}`,
        ``,
        `Cargo: ${job.title}`,
        `Empresa: ${job.company ?? 'Sin empresa'}`,
        `Ubicación: ${job.location ?? 'Sin ubicación'}`,
        `Fuente: ${job.source_name ?? 'Sin fuente'}`,
        `Score: ${match.score}`,
        ``,
        `Motivos:`,
        ...(reasons.length
            ? reasons.map((reason) => `- ${reason}`)
            : ['- Sin razones detalladas']),
        ``,
        `Link: ${job.url ?? 'Sin link'}`,
    ].join('\n')
}

function buildEmailContent(
    match: JobMatchRow,
    job: JobRow,
    profile: SearchProfileRow
) {
    const reasons = (match.reasons ?? []).slice(0, 6)

    const subject = `Nuevo trabajo para ${profile.name}: ${job.title}`

    const text = [
        `Hola,`,
        ``,
        `Encontramos un nuevo trabajo que hace match con el perfil: ${profile.name}`,
        ``,
        `Cargo: ${job.title}`,
        `Empresa: ${job.company ?? 'Sin empresa'}`,
        `Ubicación: ${job.location ?? 'Sin ubicación'}`,
        `Fuente: ${job.source_name ?? 'Sin fuente'}`,
        `Score: ${match.score}`,
        ``,
        `Motivos:`,
        ...(reasons.length
            ? reasons.map((reason) => `- ${reason}`)
            : ['- Sin razones detalladas']),
        ``,
        `Link: ${job.url ?? 'Sin link'}`,
    ].join('\n')

    const safeProfileName = escapeHtml(profile.name)
    const safeTitle = escapeHtml(job.title)
    const safeCompany = escapeHtml(job.company ?? 'Sin empresa')
    const safeLocation = escapeHtml(job.location ?? 'Sin ubicación')
    const safeSource = escapeHtml(job.source_name ?? 'Sin fuente')
    const safeUrl = escapeHtml(job.url ?? '#')

    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>Nuevo trabajo para ${safeProfileName}</h2>
            <p>Encontramos un nuevo trabajo que hace match con este perfil.</p>

            <ul>
                <li><strong>Cargo:</strong> ${safeTitle}</li>
                <li><strong>Empresa:</strong> ${safeCompany}</li>
                <li><strong>Ubicación:</strong> ${safeLocation}</li>
                <li><strong>Fuente:</strong> ${safeSource}</li>
                <li><strong>Score:</strong> ${match.score}</li>
            </ul>

            <p><strong>Motivos:</strong></p>

            <ul>
                ${reasons.length
            ? reasons
                .map((reason) => `<li>${escapeHtml(reason)}</li>`)
                .join('')
            : '<li>Sin razones detalladas</li>'
        }
            </ul>

            <p>
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">
                    Ver oferta
                </a>
            </p>
        </div>
    `

    return { subject, text, html }
}

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const internalSecret = process.env.INTERNAL_API_SECRET

    if (!internalSecret) {
        return NextResponse.json(
            { ok: false, error: 'Missing INTERNAL_API_SECRET' },
            { status: 500 }
        )
    }

    if (authHeader !== `Bearer ${internalSecret}`) {
        return NextResponse.json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 }
        )
    }

    const supabase = createAdminClient()

    const since = new Date(
        Date.now() - NOTIFICATION_LOOKBACK_HOURS * 60 * 60 * 1000
    ).toISOString()

    const { data, error } = await supabase
        .from('job_matches')
        .select(`
            id,
            job_id,
            profile_id,
            score,
            reasons,
            is_match,
            notified_at,
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
                slug,
                is_active,
                notification_channel,
                telegram_chat_id,
                notification_email
            )
        `)
        .eq('is_match', true)
        .gte('score', NOTIFICATION_MIN_SCORE)
        .gte('jobs.published_at', since)
        .eq('search_profiles.is_active', true)
        .order('score', { ascending: false })
        .limit(300)

    if (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
        )
    }

    const rows = sortRows((data ?? []) as unknown as JobMatchRow[])

    console.log('[notifications] raw candidates', {
        minScore: NOTIFICATION_MIN_SCORE,
        maxPerProfile: NOTIFICATION_MAX_PER_PROFILE,
        lookbackHours: NOTIFICATION_LOOKBACK_HOURS,
        since,
        total: rows.length,
        sample: rows.slice(0, 5).map((row) => {
            const job = getRelationObject(row.jobs)
            const profile = getRelationObject(row.search_profiles)

            return {
                match_id: row.id,
                score: row.score,
                title: job?.title,
                source: job?.source_name,
                published_at: job?.published_at,
                profile: profile?.name,
                channel: profile?.notification_channel,
                telegram: Boolean(normalizeString(profile?.telegram_chat_id)),
                email: Boolean(normalizeString(profile?.notification_email)),
            }
        }),
    })

    const countByProfile = new Map<string, number>()

    const sentIds: string[] = []
    const selectedIds: string[] = []

    const sent: Array<{
        matchId: string
        jobId: string
        profileId: string
        channel: NotificationChannel
        recipient: string
        score: number
    }> = []

    const skipped: Array<{
        matchId: string
        reason: string
    }> = []

    const failures: Array<{
        matchId: string
        error: string
    }> = []

    for (const row of rows) {
        const job = getRelationObject(row.jobs)
        const profile = getRelationObject(row.search_profiles)

        if (!job || !profile) {
            skipped.push({
                matchId: row.id,
                reason: 'missing_relation',
            })
            continue
        }

        if (!row.is_match) {
            skipped.push({
                matchId: row.id,
                reason: 'not_match',
            })
            continue
        }

        if (row.score < NOTIFICATION_MIN_SCORE) {
            skipped.push({
                matchId: row.id,
                reason: 'score_too_low',
            })
            continue
        }

        const target = resolveNotificationTarget(profile)

        if (!target) {
            skipped.push({
                matchId: row.id,
                reason: 'missing_recipient',
            })
            continue
        }

        const currentProfileCount = countByProfile.get(profile.id) ?? 0

        if (currentProfileCount >= NOTIFICATION_MAX_PER_PROFILE) {
            skipped.push({
                matchId: row.id,
                reason: 'profile_limit_reached',
            })
            continue
        }

        try {
            const decision = await shouldSendNotification({
                jobId: row.job_id,
                profileId: row.profile_id,
                channel: target.channel,
                recipient: target.recipient,
                currentScore: row.score,
            })

            if (!decision.shouldSend) {
                skipped.push({
                    matchId: row.id,
                    reason: decision.reason,
                })
                continue
            }

            selectedIds.push(row.id)
            countByProfile.set(profile.id, currentProfileCount + 1)

            if (target.channel === 'telegram') {
                const text = buildTelegramText(row, job, profile)

                await sendTelegramMessage({
                    chatId: target.recipient,
                    text,
                })
            }

            if (target.channel === 'email') {
                const { subject, text, html } = buildEmailContent(row, job, profile)

                await sendEmailNotification({
                    to: target.recipient,
                    subject,
                    text,
                    html,
                })
            }

            await markNotificationSent({
                jobId: row.job_id,
                profileId: row.profile_id,
                channel: target.channel,
                recipient: target.recipient,
                currentScore: row.score,
            })

            sentIds.push(row.id)

            sent.push({
                matchId: row.id,
                jobId: row.job_id,
                profileId: row.profile_id,
                channel: target.channel,
                recipient: target.recipient,
                score: row.score,
            })
        } catch (err) {
            failures.push({
                matchId: row.id,
                error:
                    err instanceof Error
                        ? err.message
                        : 'Unknown notification error',
            })
        }
    }

    if (sentIds.length > 0) {
        const { error: updateError } = await supabase
            .from('job_matches')
            .update({
                notified_at: new Date().toISOString(),
            })
            .in('id', sentIds)

        if (updateError) {
            return NextResponse.json(
                {
                    ok: false,
                    error: updateError.message,
                    scanned: rows.length,
                    selected: selectedIds.length,
                    sent: sentIds.length,
                    failures,
                    config: {
                        min_score: NOTIFICATION_MIN_SCORE,
                        max_per_profile: NOTIFICATION_MAX_PER_PROFILE,
                        lookback_hours: NOTIFICATION_LOOKBACK_HOURS,
                    },
                },
                { status: 500 }
            )
        }
    }

    return NextResponse.json({
        ok: true,
        scanned: rows.length,
        selected: selectedIds.length,
        sent: sentIds.length,
        failures,
        skipped: skipped.slice(0, 30),
        sent_details: sent,
        config: {
            min_score: NOTIFICATION_MIN_SCORE,
            max_per_profile: NOTIFICATION_MAX_PER_PROFILE,
            lookback_hours: NOTIFICATION_LOOKBACK_HOURS,
        },
    })
}