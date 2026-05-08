import { after, NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/notifications/send-whatsapp-message'

export const maxDuration = 300

type PipelineResponse = {
    ok: boolean
    duration_ms?: number
    collect?: {
        ok: boolean
        result?: {
            jobs_found: number
            jobs_processed: number
            matches_created: number
            sources?: Array<{
                source_name: string
                ok: boolean
                jobs_found: number
                skipped?: boolean
                error?: string
            }>
        }
        error?: string
    }
    enrich?: {
        ok: boolean
        result?: {
            scanned?: number
            enriched?: number
        }
        error?: string
    } | null
    rescore?: {
        ok: boolean
        result?: {
            scanned?: number
            rescored?: number
            matches_upserted?: number
        }
        error?: string
    } | null
    notify?: {
        ok: boolean
        scanned?: number
        selected?: number
        sent?: number
        sessionId?: string
        message?: string
        failures?: unknown[]
        skipped?: unknown[]
    } | null
    internal_statuses?: {
        enrich?: number
        rescore?: number
        notify?: number
    }
    error?: string
}

type WhatsAppWebhookPayload = {
    object?: string
    entry?: Array<{
        id?: string
        changes?: Array<{
            field?: string
            value?: {
                messaging_product?: string
                metadata?: {
                    display_phone_number?: string
                    phone_number_id?: string
                }
                contacts?: Array<{
                    profile?: {
                        name?: string
                    }
                    wa_id?: string
                }>
                messages?: Array<{
                    from?: string
                    id?: string
                    timestamp?: string
                    type?: string
                    text?: {
                        body?: string
                    }
                }>
                statuses?: unknown[]
            }
        }>
    }>
}

type IncomingCommand = {
    from: string
    body: string
    messageId?: string
}

function getBaseUrl(request: NextRequest) {
    const internalBaseUrl = process.env.INTERNAL_BASE_URL?.trim()
    const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

    if (internalBaseUrl) {
        return internalBaseUrl.replace(/\/$/, '')
    }

    if (publicAppUrl) {
        return publicAppUrl.replace(/\/$/, '')
    }

    return request.nextUrl.origin
}

function normalizeWhatsAppRecipient(value: string) {
    const clean = value.trim().replace(/\s+/g, '')

    if (clean.startsWith('whatsapp:')) {
        return clean
    }

    if (clean.startsWith('+')) {
        return `whatsapp:${clean}`
    }

    return `whatsapp:+${clean}`
}

function normalizeMetaWaId(value: string) {
    return normalizeWhatsAppRecipient(value)
}

function isAllowedSender(from: string | null) {
    const allowed = process.env.WHATSAPP_ALLOWED_FROM?.trim()

    if (!allowed || !from) return false

    return normalizeWhatsAppRecipient(allowed) === normalizeWhatsAppRecipient(from)
}

function normalizeCommand(value: string | null) {
    return (value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function buildHelpMessage() {
    return [
        'Comandos disponibles:',
        '',
        'run - correr pipeline completo',
        'matches - mostrar últimos matches',
        'match 1 - ver detalle del match 1',
        'preparar 1 - generar pack de postulación',
        'descartar 1 - descartar match',
        'aplicado 1 - marcar como postulado',
        'ayuda - ver comandos',
        '',
        'Ejemplo:',
        'run',
    ].join('\n')
}

function buildPipelineSummary(result: PipelineResponse) {
    if (!result.ok) {
        const collectError = result.collect?.error
        const enrichError = result.enrich?.error
        const rescoreError = result.rescore?.error
        const notifyFailures = result.notify?.failures?.length ?? 0

        return [
            '❌ Pipeline falló',
            '',
            result.error ? `Error: ${result.error}` : null,
            collectError ? `Collect: ${collectError}` : null,
            enrichError ? `Enrich: ${enrichError}` : null,
            rescoreError ? `Rescore: ${rescoreError}` : null,
            notifyFailures ? `Notify failures: ${notifyFailures}` : null,
        ]
            .filter(Boolean)
            .join('\n')
    }

    const collectResult = result.collect?.result
    const sources = collectResult?.sources ?? []

    return [
        '✅ Pipeline terminado',
        '',
        `Duración: ${Math.round((result.duration_ms ?? 0) / 1000)}s`,
        `Jobs encontrados: ${collectResult?.jobs_found ?? 0}`,
        `Jobs procesados: ${collectResult?.jobs_processed ?? 0}`,
        `Matches creados: ${collectResult?.matches_created ?? 0}`,
        '',
        `Top matches enviados: ${result.notify?.selected ?? 0}`,
        `Mensajes WhatsApp: ${result.notify?.sent ?? 0}`,
        result.notify?.sessionId ? `Sesión: ${result.notify.sessionId.slice(0, 8)}` : null,
        '',
        sources.length ? 'Fuentes:' : null,
        ...sources.slice(0, 8).map((source) => {
            const status = source.ok ? 'OK' : 'FAIL'
            const skipped = source.skipped ? ' / skipped' : ''
            return `- ${source.source_name}: ${status}${skipped} · ${source.jobs_found} jobs`
        }),
        '',
        'Responde:',
        'matches',
        'match 1',
        'preparar 1',
    ]
        .filter(Boolean)
        .join('\n')
}

function extractCommands(payload: WhatsAppWebhookPayload): IncomingCommand[] {
    const commands: IncomingCommand[] = []

    for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
            const value = change.value
            const messages = value?.messages ?? []

            for (const message of messages) {
                if (message.type !== 'text') continue

                const fromWaId = message.from
                const text = message.text?.body

                if (!fromWaId || !text) continue

                commands.push({
                    from: normalizeMetaWaId(fromWaId),
                    body: text,
                    messageId: message.id,
                })
            }
        }
    }

    return commands
}

async function runPipelineFromWebhook(params: {
    baseUrl: string
    replyTo: string
}) {
    const cronSecret = process.env.CRON_SECRET ?? process.env.INTERNAL_API_SECRET

    if (!cronSecret) {
        await sendWhatsAppMessage({
            to: params.replyTo,
            body: '❌ Falta CRON_SECRET o INTERNAL_API_SECRET en variables de entorno.',
        })

        return
    }

    try {
        const response = await fetch(`${params.baseUrl}/api/cron/run-all`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${cronSecret}`,
            },
            cache: 'no-store',
        })

        const body = (await response.json().catch(() => null)) as PipelineResponse | null

        await sendWhatsAppMessage({
            to: params.replyTo,
            body: buildPipelineSummary(
                body ?? {
                    ok: false,
                    error: `Respuesta inválida del pipeline. Status ${response.status}`,
                }
            ),
        })
    } catch (error) {
        await sendWhatsAppMessage({
            to: params.replyTo,
            body: [
                '❌ Error ejecutando pipeline',
                '',
                error instanceof Error ? error.message : 'Error desconocido',
            ].join('\n'),
        })
    }
}

/**
 * GET requerido por Meta para verificar el webhook.
 * Meta envía hub.mode, hub.verify_token y hub.challenge.
 */
export async function GET(request: NextRequest): Promise<Response> {
    const searchParams = request.nextUrl.searchParams

    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

    if (mode === 'subscribe' && token && token === verifyToken && challenge) {
        return new NextResponse(challenge, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
            },
        })
    }

    return new NextResponse('Forbidden', { status: 403 })
}

/**
 * POST usado por Meta para enviar mensajes entrantes y eventos.
 */
export async function POST(request: NextRequest): Promise<Response> {
    const enabled = process.env.WHATSAPP_BOT_ENABLED === 'true'

    if (!enabled) {
        return NextResponse.json({ ok: true, message: 'WhatsApp bot disabled' })
    }

    let payload: WhatsAppWebhookPayload

    try {
        payload = (await request.json()) as WhatsAppWebhookPayload
    } catch {
        return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const commands = extractCommands(payload)

    if (commands.length === 0) {
        return NextResponse.json({ ok: true, message: 'No text commands' })
    }

    const baseUrl = getBaseUrl(request)

    for (const incoming of commands) {
        if (!isAllowedSender(incoming.from)) {
            continue
        }

        const command = normalizeCommand(incoming.body)

        if (command === 'run' || command === 'correr' || command === 'buscar') {
            after(async () => {
                await sendWhatsAppMessage({
                    to: incoming.from,
                    body: '🚀 Ok, estoy corriendo el pipeline. Te aviso cuando termine.',
                })

                await runPipelineFromWebhook({
                    baseUrl,
                    replyTo: incoming.from,
                })
            })

            continue
        }

        if (command === 'ayuda' || command === 'help' || command === 'comandos') {
            after(async () => {
                await sendWhatsAppMessage({
                    to: incoming.from,
                    body: buildHelpMessage(),
                })
            })

            continue
        }

        if (command === 'matches') {
            after(async () => {
                await sendWhatsAppMessage({
                    to: incoming.from,
                    body: [
                        'Todavía estamos conectando el comando matches.',
                        '',
                        'Por ahora usa:',
                        'run',
                    ].join('\n'),
                })
            })

            continue
        }

        after(async () => {
            await sendWhatsAppMessage({
                to: incoming.from,
                body: [
                    'No entendí ese comando.',
                    '',
                    buildHelpMessage(),
                ].join('\n'),
            })
        })
    }

    return NextResponse.json({ ok: true })
}