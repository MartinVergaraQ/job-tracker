import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyJobMatchWhatsApp } from '@/lib/notifications/notify-job-match-whatsapp'
import { sendEmailNotification } from '@/lib/notifications/email'
import {
    shouldSendNotification,
    markNotificationSent,
} from '@/lib/notifications/job-match-notifications'

export const maxDuration = 300

type NotificationChannel = 'whatsapp' | 'email'

type JobRow = {
    id: string
    source_name: string
    source_type: string
    url: string
    title: string
    company: string
    location: string | null
    modality: string
    seniority: string
    salary_text: string | null
    description: string | null
    tech_tags: string[]
    published_at: string | null
    scraped_at: string
    is_active: boolean
    is_canonical: boolean
}

type SearchProfileRow = {
    id: string
    slug: string
    name: string
    min_score: number
    is_active: boolean
    notification_channel: string | null
    telegram_chat_id: string | null
    notification_email: string | null
}

type JobMatchRow = {
    id: string
    job_id: string
    profile_id: string
    score: number
    is_match: boolean
    reasons: string[]
    notified_at: string | null
    dismissed: boolean
    saved: boolean
    created_at: string
    jobs: JobRow | JobRow[] | null
    search_profiles: SearchProfileRow | SearchProfileRow[] | null
}

type NotificationTarget = {
    channel: NotificationChannel
    recipient: string
}

function getAllowedSecrets() {
    return [process.env.CRON_SECRET, process.env.INTERNAL_API_SECRET]
        .map((value) => value?.trim())
        .filter(Boolean) as string[]
}

function validateInternalAuth(request: NextRequest): NextResponse | null {
    const authHeader = request.headers.get('authorization')
    const allowedSecrets = getAllowedSecrets()

    if (allowedSecrets.length === 0) {
        return NextResponse.json(
            {
                ok: false,
                error: 'Missing CRON_SECRET or INTERNAL_API_SECRET',
            },
            { status: 500 }
        )
    }

    const isAuthorized = allowedSecrets.some(
        (secret) => authHeader === `Bearer ${secret}`
    )

    if (!isAuthorized) {
        return NextResponse.json(
            {
                ok: false,
                error: 'Unauthorized',
            },
            { status: 401 }
        )
    }

    return null
}

function normalizeString(value: string | null | undefined) {
    const normalized = value?.trim()
    return normalized && normalized.length > 0 ? normalized : null
}

function normalizeArrayRelation<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    if (Array.isArray(value)) return value[0] ?? null
    return value
}

function getNumberEnv(name: string, fallback: number) {
    const raw = Number(process.env[name] ?? fallback)

    if (!Number.isFinite(raw)) {
        return fallback
    }

    return raw
}

function resolveNotificationTarget(
    profile: SearchProfileRow
): NotificationTarget | null {
    const whatsappTo = normalizeString(process.env.WHATSAPP_TO)
    const email = normalizeString(profile.notification_email)

    /**
     * Si el perfil pide email explícitamente, respetamos email.
     */
    if (profile.notification_channel === 'email') {
        if (!email) return null

        return {
            channel: 'email',
            recipient: email,
        }
    }

    /**
     * Si el perfil pide WhatsApp explícitamente, usamos WHATSAPP_TO global.
     * Por ahora no tienes whatsapp_to en BD, así que usamos env.
     */
    if (profile.notification_channel === 'whatsapp') {
        if (!whatsappTo) return null

        return {
            channel: 'whatsapp',
            recipient: whatsappTo,
        }
    }

    /**
     * Si viene telegram/null/otro valor, usamos WhatsApp como canal principal.
     */
    if (whatsappTo) {
        return {
            channel: 'whatsapp',
            recipient: whatsappTo,
        }
    }

    /**
     * Fallback opcional a email.
     */
    if (email) {
        return {
            channel: 'email',
            recipient: email,
        }
    }

    return null
}

function buildWhatsAppText(
    match: JobMatchRow,
    job: JobRow,
    profile: SearchProfileRow
) {
    const reasons = (match.reasons ?? []).slice(0, 5)
    const techTags = (job.tech_tags ?? []).slice(0, 8)

    return [
        `🎯 Nuevo match para ${profile.name}`,
        '',
        `Cargo: ${job.title}`,
        `Empresa: ${job.company}`,
        job.location ? `Ubicación: ${job.location}` : null,
        job.modality ? `Modalidad: ${job.modality}` : null,
        job.seniority ? `Senioridad: ${job.seniority}` : null,
        job.salary_text ? `Sueldo: ${job.salary_text}` : null,
        `Score: ${match.score}`,
        '',
        techTags.length > 0 ? `Tags: ${techTags.join(', ')}` : null,
        '',
        reasons.length > 0 ? 'Por qué calza:' : null,
        ...reasons.map((reason) => `• ${reason}`),
        '',
        `Link: ${job.url}`,
        '',
        'Acciones sugeridas:',
        `match ${match.id}`,
        `postular ${match.id}`,
        `descartar ${match.id}`,
    ]
        .filter(Boolean)
        .join('\n')
}

function buildEmailContent(
    match: JobMatchRow,
    job: JobRow,
    profile: SearchProfileRow
) {
    const reasons = (match.reasons ?? []).slice(0, 8)

    const subject = `Nuevo match ${match.score}: ${job.title} en ${job.company}`

    const text = [
        `Nuevo match para ${profile.name}`,
        '',
        `Cargo: ${job.title}`,
        `Empresa: ${job.company}`,
        job.location ? `Ubicación: ${job.location}` : null,
        job.modality ? `Modalidad: ${job.modality}` : null,
        job.seniority ? `Senioridad: ${job.seniority}` : null,
        job.salary_text ? `Sueldo: ${job.salary_text}` : null,
        `Score: ${match.score}`,
        '',
        reasons.length > 0 ? 'Por qué calza:' : null,
        ...reasons.map((reason) => `- ${reason}`),
        '',
        `Link: ${job.url}`,
    ]
        .filter(Boolean)
        .join('\n')

    const html = `
    <div>
      <h2>Nuevo match para ${profile.name}</h2>

      <p><strong>Cargo:</strong> ${job.title}</p>
      <p><strong>Empresa:</strong> ${job.company}</p>
      ${job.location ? `<p><strong>Ubicación:</strong> ${job.location}</p>` : ''}
      ${job.modality ? `<p><strong>Modalidad:</strong> ${job.modality}</p>` : ''}
      ${job.seniority ? `<p><strong>Senioridad:</strong> ${job.seniority}</p>` : ''}
      ${job.salary_text ? `<p><strong>Sueldo:</strong> ${job.salary_text}</p>` : ''}
      <p><strong>Score:</strong> ${match.score}</p>

      ${reasons.length > 0
            ? `
            <h3>Por qué calza</h3>
            <ul>
              ${reasons.map((reason) => `<li>${reason}</li>`).join('')}
            </ul>
          `
            : ''
        }

      <p>
        <a href="${job.url}" target="_blank" rel="noopener noreferrer">
          Ver oferta
        </a>
      </p>
    </div>
  `

    return {
        subject,
        text,
        html,
    }
}

async function processNotifications() {
    const supabase = createAdminClient()

    const minScore = getNumberEnv('NOTIFICATIONS_MIN_SCORE', 70)
    const maxPerRun = getNumberEnv('NOTIFICATIONS_MAX_PER_RUN', 10)
    const maxPerProfile = getNumberEnv('NOTIFICATIONS_MAX_PER_PROFILE', 5)

    const { data, error } = await supabase
        .from('job_matches')
        .select(`
      id,
      job_id,
      profile_id,
      score,
      is_match,
      reasons,
      notified_at,
      dismissed,
      saved,
      created_at,
      jobs (
        id,
        source_name,
        source_type,
        url,
        title,
        company,
        location,
        modality,
        seniority,
        salary_text,
        description,
        tech_tags,
        published_at,
        scraped_at,
        is_active,
        is_canonical
      ),
      search_profiles (
        id,
        slug,
        name,
        min_score,
        is_active,
        notification_channel,
        telegram_chat_id,
        notification_email
      )
    `)
        .eq('is_match', true)
        .eq('dismissed', false)
        .gte('score', minScore)
        .order('score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(maxPerRun * 5)

    if (error) {
        throw new Error(error.message)
    }

    const rows = (data ?? []) as JobMatchRow[]

    const sent: unknown[] = []
    const skipped: unknown[] = []
    const failures: unknown[] = []
    const selectedIds: string[] = []
    const sentIds: string[] = []

    const countByProfile = new Map<string, number>()

    for (const row of rows) {
        const job = normalizeArrayRelation(row.jobs)
        const profile = normalizeArrayRelation(row.search_profiles)

        if (!job) {
            skipped.push({
                matchId: row.id,
                reason: 'missing_job',
            })
            continue
        }

        if (!profile) {
            skipped.push({
                matchId: row.id,
                reason: 'missing_profile',
            })
            continue
        }

        if (!profile.is_active) {
            skipped.push({
                matchId: row.id,
                jobId: row.job_id,
                profileId: row.profile_id,
                reason: 'inactive_profile',
            })
            continue
        }

        if (!job.is_active) {
            skipped.push({
                matchId: row.id,
                jobId: row.job_id,
                profileId: row.profile_id,
                reason: 'inactive_job',
            })
            continue
        }

        if (job.is_canonical === false) {
            skipped.push({
                matchId: row.id,
                jobId: row.job_id,
                profileId: row.profile_id,
                reason: 'non_canonical_job',
            })
            continue
        }

        if (row.score < profile.min_score) {
            skipped.push({
                matchId: row.id,
                jobId: row.job_id,
                profileId: row.profile_id,
                score: row.score,
                profileMinScore: profile.min_score,
                reason: 'below_profile_min_score',
            })
            continue
        }

        const currentProfileCount = countByProfile.get(profile.id) ?? 0

        if (currentProfileCount >= maxPerProfile) {
            skipped.push({
                matchId: row.id,
                jobId: row.job_id,
                profileId: row.profile_id,
                reason: 'profile_limit_reached',
            })
            continue
        }

        const target = resolveNotificationTarget(profile)

        if (!target) {
            skipped.push({
                matchId: row.id,
                jobId: row.job_id,
                profileId: row.profile_id,
                reason: 'missing_notification_target',
                profileChannel: profile.notification_channel,
            })
            continue
        }

        try {
            let wasSent = false

            if (target.channel === 'whatsapp') {
                const body = buildWhatsAppText(row, job, profile)

                const result = await notifyJobMatchWhatsApp({
                    jobId: row.job_id,
                    profileId: row.profile_id,
                    recipient: target.recipient,
                    score: row.score,
                    body,
                })

                if (!result.sent) {
                    skipped.push({
                        matchId: row.id,
                        jobId: row.job_id,
                        profileId: row.profile_id,
                        channel: target.channel,
                        recipient: target.recipient,
                        score: row.score,
                        reason: result.reason,
                        previousScore: result.previousScore,
                        currentScore: result.currentScore,
                    })

                    continue
                }

                wasSent = true
            }

            if (target.channel === 'email') {
                const decision = await shouldSendNotification({
                    jobId: row.job_id,
                    profileId: row.profile_id,
                    channel: 'email',
                    recipient: target.recipient,
                    currentScore: row.score,
                })

                if (!decision.shouldSend) {
                    skipped.push({
                        matchId: row.id,
                        jobId: row.job_id,
                        profileId: row.profile_id,
                        channel: target.channel,
                        recipient: target.recipient,
                        score: row.score,
                        reason: decision.reason,
                        previousScore: decision.previousScore,
                    })

                    continue
                }

                const { subject, text, html } = buildEmailContent(row, job, profile)

                await sendEmailNotification({
                    to: target.recipient,
                    subject,
                    text,
                    html,
                })

                await markNotificationSent({
                    jobId: row.job_id,
                    profileId: row.profile_id,
                    channel: 'email',
                    recipient: target.recipient,
                    currentScore: row.score,
                })

                wasSent = true
            }

            if (!wasSent) {
                skipped.push({
                    matchId: row.id,
                    jobId: row.job_id,
                    profileId: row.profile_id,
                    channel: target.channel,
                    reason: 'unsupported_channel',
                })

                continue
            }

            selectedIds.push(row.id)
            sentIds.push(row.id)
            countByProfile.set(profile.id, currentProfileCount + 1)

            sent.push({
                matchId: row.id,
                jobId: row.job_id,
                profileId: row.profile_id,
                channel: target.channel,
                recipient: target.recipient,
                score: row.score,
            })
        } catch (error) {
            failures.push({
                matchId: row.id,
                jobId: row.job_id,
                profileId: row.profile_id,
                channel: target.channel,
                recipient: target.recipient,
                error: error instanceof Error ? error.message : 'Unknown send error',
            })
        }
    }

    if (sentIds.length > 0) {
        const now = new Date().toISOString()

        const { error: updateError } = await supabase
            .from('job_matches')
            .update({
                notified_at: now,
            })
            .in('id', sentIds)

        if (updateError) {
            failures.push({
                step: 'update_job_matches_notified_at',
                error: updateError.message,
            })
        }
    }

    return {
        ok: failures.length === 0,
        scanned: rows.length,
        selected: selectedIds.length,
        sent: sent.length,
        failures,
        skipped,
        config: {
            minScore,
            maxPerRun,
            maxPerProfile,
            whatsappConfigured: Boolean(normalizeString(process.env.WHATSAPP_TO)),
        },
    }
}

async function handleProcessNotifications(request: NextRequest): Promise<Response> {
    const authError = validateInternalAuth(request)

    if (authError) {
        return authError
    }

    try {
        const result = await processNotifications()

        return NextResponse.json(result, {
            status: result.ok ? 200 : 500,
        })
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                scanned: 0,
                selected: 0,
                sent: 0,
                failures: [
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Unknown notification process error',
                    },
                ],
                skipped: [],
            },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest): Promise<Response> {
    return handleProcessNotifications(request)
}

export async function GET(request: NextRequest): Promise<Response> {
    return handleProcessNotifications(request)
}