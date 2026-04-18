import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/notifications/telegram'
import { sendEmailNotification } from '@/lib/notifications/email'

type SearchProfileRow = {
    id: string
    name: string
    slug: string
    notification_channel: string | null
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
}

type JobMatchRow = {
    id: string
    score: number
    reasons: string[] | null
    is_match: boolean
    notified_at: string | null
    jobs: JobRow | JobRow[] | null
    search_profiles: SearchProfileRow | SearchProfileRow[] | null
}

function unauthorized() {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

function getRelationObject<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null
    }

    return value ?? null
}

function buildTelegramText(match: JobMatchRow, job: JobRow, profile: SearchProfileRow) {
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

function buildEmailContent(match: JobMatchRow, job: JobRow, profile: SearchProfileRow) {
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

    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Nuevo trabajo para ${profile.name}</h2>
        <p>Encontramos un nuevo trabajo que hace match con este perfil.</p>

        <ul>
            <li><strong>Cargo:</strong> ${job.title}</li>
            <li><strong>Empresa:</strong> ${job.company ?? 'Sin empresa'}</li>
            <li><strong>Ubicación:</strong> ${job.location ?? 'Sin ubicación'}</li>
            <li><strong>Fuente:</strong> ${job.source_name ?? 'Sin fuente'}</li>
            <li><strong>Score:</strong> ${match.score}</li>
        </ul>

        <p><strong>Motivos:</strong></p>
        <ul>
            ${reasons.length
            ? reasons.map((reason) => `<li>${reason}</li>`).join('')
            : '<li>Sin razones detalladas</li>'
        }
        </ul>

        <p>
            <a href="${job.url ?? '#'}" target="_blank" rel="noopener noreferrer">
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

    const { data, error } = await supabase
        .from('job_matches')
        .select(`
        id,
        score,
        reasons,
        is_match,
        notified_at,
        jobs (
            id,
            title,
            company,
            location,
            url,
            source_name
        ),
        search_profiles (
            id,
            name,
            slug,
            notification_channel,
            telegram_chat_id,
            notification_email
        )
        `)
        .eq('is_match', true)
        .is('notified_at', null)
        .limit(100)

    if (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
        )
    }

    const rows = (data ?? []) as JobMatchRow[]
    const sentIds: string[] = []
    const failures: Array<{ matchId: string; error: string }> = []

    for (const row of rows) {
        const job = getRelationObject(row.jobs)
        const profile = getRelationObject(row.search_profiles)

        if (!job || !profile) continue
        try {
            if (profile.notification_channel === 'telegram') {
                if (!profile.telegram_chat_id) continue

                const text = buildTelegramText(row, job, profile)

                await sendTelegramMessage({
                    chatId: profile.telegram_chat_id,
                    text,
                })

                sentIds.push(row.id)
                continue
            }

            if (profile.notification_channel === 'email') {
                if (!profile.notification_email) continue

                const { subject, text, html } = buildEmailContent(row, job, profile)

                await sendEmailNotification({
                    to: profile.notification_email,
                    subject,
                    text,
                    html,
                })

                sentIds.push(row.id)
                continue
            }
        } catch (err) {
            failures.push({
                matchId: row.id,
                error: err instanceof Error ? err.message : 'Unknown notification error',
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
                    sent: sentIds.length,
                    failures,
                },
                { status: 500 }
            )
        }
    }

    return NextResponse.json({
        ok: true,
        scanned: rows.length,
        sent: sentIds.length,
        failures,
    })
}