import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppMessage } from '@/lib/notifications/send-whatsapp-message'

export const maxDuration = 300

type JobRow = {
    id: string
    source_name: string
    source_type?: string | null
    url: string
    title: string
    company: string
    location: string | null
    modality: string | null
    seniority: string | null
    salary_text: string | null
    tech_tags: string[] | null
    published_at: string | null
    is_active: boolean | null
    is_canonical: boolean | null
}

type SearchProfileRow = {
    id: string
    slug: string
    name: string
    min_score: number
    is_active: boolean
    notification_channel: string | null
    notification_email: string | null
    telegram_chat_id: string | null
    whatsapp_recipient: string | null
    notifications_enabled: boolean | null
}

type JobMatchRow = {
    id: string
    job_id: string
    profile_id: string
    score: number
    is_match: boolean
    reasons: string[] | null
    notified_at: string | null
    dismissed: boolean
    saved: boolean
    created_at: string
    jobs: JobRow | JobRow[] | null
    search_profiles: SearchProfileRow | SearchProfileRow[] | null
}

type SelectedMatch = {
    itemNumber: number
    recipient: string
    match: JobMatchRow
    job: JobRow
    profile: SearchProfileRow
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

function normalizeArrayRelation<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    if (Array.isArray(value)) return value[0] ?? null
    return value
}

function getNumberEnv(names: string[], fallback: number) {
    for (const name of names) {
        const value = process.env[name]

        if (value === undefined) continue

        const parsed = Number(value)

        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.floor(parsed)
        }
    }

    return fallback
}

function normalizeWhatsAppRecipient(value: string) {
    const clean = value.trim().replace(/\s+/g, '')

    if (!clean) return null

    if (clean.startsWith('whatsapp:')) {
        return clean
    }

    if (clean.startsWith('+')) {
        return `whatsapp:${clean}`
    }

    return `whatsapp:+${clean.replace(/^\+/, '')}`
}

function getProfileWhatsAppRecipient(profile: SearchProfileRow) {
    if (!profile.whatsapp_recipient) return null
    return normalizeWhatsAppRecipient(profile.whatsapp_recipient)
}

function truncate(value: string, maxLength: number) {
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength - 1)}…`
}

function formatJobLine(selected: SelectedMatch) {
    const { itemNumber, match, job, profile } = selected

    const location = job.location ? ` · ${job.location}` : ''
    const modality =
        job.modality && job.modality !== 'unknown' ? ` · ${job.modality}` : ''

    return [
        `${itemNumber}. ${job.title}`,
        `   ${job.company}${location}${modality}`,
        `   Score ${Math.round(match.score)} · Perfil: ${profile.name}`,
    ].join('\n')
}

function buildSummaryMessage(selected: SelectedMatch[]) {
    const lines = selected.map(formatJobLine)

    return truncate(
        [
            `🚀 Encontré ${selected.length} matches buenos para revisar`,
            '',
            ...lines,
            '',
            'Responde con:',
            'match 1 → ver detalle',
            'preparar 1 → generar pack de postulación',
            'descartar 1 → descartar oferta',
            'aplicado 1 → marcar como postulada',
        ].join('\n'),
        3500
    )
}

function sortRows(rows: JobMatchRow[]) {
    return [...rows].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
}

function uniqueByProfileAndJob(rows: JobMatchRow[]) {
    const seen = new Set<string>()
    const result: JobMatchRow[] = []

    for (const row of rows) {
        const key = `${row.profile_id}:${row.job_id}`

        if (seen.has(key)) continue

        seen.add(key)
        result.push(row)
    }

    return result
}

function groupByRecipient(selected: Omit<SelectedMatch, 'itemNumber'>[]) {
    const groups = new Map<string, Omit<SelectedMatch, 'itemNumber'>[]>()

    for (const item of selected) {
        const current = groups.get(item.recipient) ?? []
        current.push(item)
        groups.set(item.recipient, current)
    }

    return groups
}

async function createMatchSession(params: {
    recipient: string
    selected: SelectedMatch[]
}) {
    const supabase = createAdminClient()
    const firstProfileId = params.selected[0]?.profile.id ?? null

    await supabase
        .from('whatsapp_match_sessions')
        .update({ status: 'expired' })
        .eq('recipient', params.recipient)
        .eq('status', 'active')

    const { data: session, error: sessionError } = await supabase
        .from('whatsapp_match_sessions')
        .insert({
            recipient: params.recipient,
            profile_id: firstProfileId,
            status: 'active',
        })
        .select('id')
        .single()

    if (sessionError) {
        throw new Error(sessionError.message)
    }

    const items = params.selected.map(({ itemNumber, match, job, profile }) => ({
        session_id: session.id,
        item_number: itemNumber,
        match_id: match.id,
        job_id: job.id,
        profile_id: profile.id,
    }))

    const { error: itemsError } = await supabase
        .from('whatsapp_match_session_items')
        .insert(items)

    if (itemsError) {
        throw new Error(itemsError.message)
    }

    return session.id as string
}

async function markMatchesNotified(matchIds: string[]) {
    if (matchIds.length === 0) return

    const supabase = createAdminClient()

    const { error } = await supabase
        .from('job_matches')
        .update({
            notified_at: new Date().toISOString(),
        })
        .in('id', matchIds)

    if (error) {
        throw new Error(error.message)
    }
}

async function processNotifications() {
    const supabase = createAdminClient()

    const minScore = getNumberEnv(
        ['NOTIFICATIONS_MIN_SCORE', 'NOTIFICATION_MIN_SCORE'],
        75
    )

    const topMatchesPerRecipient = getNumberEnv(
        ['NOTIFICATIONS_TOP_MATCHES', 'NOTIFICATION_TOP_MATCHES'],
        5
    )

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
                tech_tags,
                published_at,
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
                notification_email,
                telegram_chat_id,
                whatsapp_recipient,
                notifications_enabled
            )
        `)
        .eq('is_match', true)
        .eq('dismissed', false)
        .is('notified_at', null)
        .gte('score', minScore)
        .order('score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)

    if (error) {
        throw new Error(error.message)
    }

    const rows = uniqueByProfileAndJob(sortRows((data ?? []) as JobMatchRow[]))

    const skipped: unknown[] = []
    const candidates: Omit<SelectedMatch, 'itemNumber'>[] = []

    for (const row of rows) {
        const job = normalizeArrayRelation(row.jobs)
        const profile = normalizeArrayRelation(row.search_profiles)

        if (!job) {
            skipped.push({
                matchId: row.id,
                profileId: row.profile_id,
                reason: 'missing_job',
            })
            continue
        }

        if (!profile) {
            skipped.push({
                matchId: row.id,
                profileId: row.profile_id,
                reason: 'missing_profile',
            })
            continue
        }

        if (!profile.is_active) {
            skipped.push({
                matchId: row.id,
                profileId: profile.id,
                reason: 'inactive_profile',
            })
            continue
        }

        if (!profile.notifications_enabled) {
            skipped.push({
                matchId: row.id,
                profileId: profile.id,
                profileName: profile.name,
                reason: 'profile_notifications_disabled',
            })
            continue
        }

        if (profile.notification_channel !== 'whatsapp') {
            skipped.push({
                matchId: row.id,
                profileId: profile.id,
                profileName: profile.name,
                notificationChannel: profile.notification_channel,
                reason: 'profile_channel_not_whatsapp',
            })
            continue
        }

        const recipient = getProfileWhatsAppRecipient(profile)

        if (!recipient) {
            skipped.push({
                matchId: row.id,
                profileId: profile.id,
                profileName: profile.name,
                reason: 'missing_profile_whatsapp_recipient',
            })
            continue
        }

        if (job.is_active === false) {
            skipped.push({
                matchId: row.id,
                profileId: profile.id,
                reason: 'inactive_job',
            })
            continue
        }

        if (job.is_canonical === false) {
            skipped.push({
                matchId: row.id,
                profileId: profile.id,
                reason: 'non_canonical_job',
            })
            continue
        }

        if (row.score < profile.min_score) {
            skipped.push({
                matchId: row.id,
                profileId: profile.id,
                score: row.score,
                profileMinScore: profile.min_score,
                reason: 'below_profile_min_score',
            })
            continue
        }

        candidates.push({
            recipient,
            match: row,
            job,
            profile,
        })
    }

    const groups = groupByRecipient(candidates)

    const results: unknown[] = []
    const notifiedMatchIds: string[] = []
    let totalSelected = 0
    let totalSent = 0

    for (const [recipient, group] of groups.entries()) {
        const selected = group
            .slice(0, topMatchesPerRecipient)
            .map((item, index) => ({
                itemNumber: index + 1,
                ...item,
            }))

        if (selected.length === 0) continue

        const sessionId = await createMatchSession({
            recipient,
            selected,
        })

        const body = buildSummaryMessage(selected)

        const sendResult = await sendWhatsAppMessage({
            to: recipient,
            body,
        })

        const selectedMatchIds = selected.map(({ match }) => match.id)

        notifiedMatchIds.push(...selectedMatchIds)
        totalSelected += selected.length
        totalSent += 1

        results.push({
            recipient,
            sessionId,
            selected: selected.length,
            sent: true,
            result: sendResult,
            matches: selected.map(({ itemNumber, match, job, profile }) => ({
                itemNumber,
                matchId: match.id,
                jobId: job.id,
                profileId: profile.id,
                profileName: profile.name,
                title: job.title,
                company: job.company,
                score: match.score,
            })),
        })
    }

    await markMatchesNotified(notifiedMatchIds)

    return {
        ok: true,
        scanned: rows.length,
        selected: totalSelected,
        sent: totalSent,
        results,
        skipped: skipped.slice(0, 50),
        message:
            totalSent > 0
                ? `Se enviaron ${totalSent} resumen(es) por WhatsApp.`
                : 'No hay matches nuevos para notificar.',
        config: {
            minScore,
            topMatchesPerRecipient,
            groupedByProfileRecipient: true,
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