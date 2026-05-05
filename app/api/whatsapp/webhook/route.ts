import { after, NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/notifications/whatsapp'

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
    }
    notify?: {
        ok: boolean
        scanned?: number
        selected?: number
        sent?: number
        skipped?: Array<{
            matchId: string
            reason: string
        }>
    }
    internal_statuses?: {
        enrich: number
        rescore: number
        notify: number
    }
    error?: string
}

function getBaseUrl(request: NextRequest) {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

    if (envUrl) {
        return envUrl.replace(/\/$/, '')
    }

    return request.nextUrl.origin
}

function isAllowedSender(from: string | null) {
    const allowed = process.env.WHATSAPP_ALLOWED_FROM?.trim()

    if (!allowed) return false
    if (!from) return false

    return from === allowed
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
        'run - correr colector completo',
        'ayuda - ver comandos',
        '',
        'Ejemplo:',
        'run',
    ].join('\n')
}

function buildPipelineSummary(result: PipelineResponse) {
    if (!result.ok) {
        return [
            '❌ Pipeline falló',
            '',
            `Error: ${result.error ?? 'Error desconocido'}`,
        ].join('\n')
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
        `Notificaciones enviadas: ${result.notify?.sent ?? 0}`,
        `Ya enviados / omitidos: ${result.notify?.skipped?.length ?? 0}`,
        '',
        'Fuentes:',
        ...sources.map((source) => {
            const status = source.ok ? 'OK' : 'FAIL'
            const skipped = source.skipped ? ' / skipped' : ''
            return `- ${source.source_name}: ${status}${skipped} · ${source.jobs_found} jobs`
        }),
    ].join('\n')
}

async function runPipelineFromWebhook(params: {
    baseUrl: string
    replyTo: string
}) {
    const internalSecret = process.env.INTERNAL_API_SECRET

    if (!internalSecret) {
        await sendWhatsAppMessage({
            to: params.replyTo,
            body: '❌ Falta INTERNAL_API_SECRET en variables de entorno.',
        })

        return
    }

    try {
        const response = await fetch(`${params.baseUrl}/api/cron/run-all`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${internalSecret}`,
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

export async function POST(request: NextRequest): Promise<Response> {
    const enabled = process.env.WHATSAPP_BOT_ENABLED === 'true'

    if (!enabled) {
        return new NextResponse('WhatsApp bot disabled', { status: 200 })
    }

    const formData = await request.formData()

    const from = String(formData.get('From') ?? '')
    const body = String(formData.get('Body') ?? '')

    if (!isAllowedSender(from)) {
        return new NextResponse('Unauthorized sender', { status: 200 })
    }

    const command = normalizeCommand(body)

    if (command === 'run' || command === 'correr' || command === 'buscar') {
        const baseUrl = getBaseUrl(request)

        after(async () => {
            await sendWhatsAppMessage({
                to: from,
                body: '🚀 Ok, estoy corriendo el pipeline. Te aviso cuando termine.',
            })

            await runPipelineFromWebhook({
                baseUrl,
                replyTo: from,
            })
        })

        return new NextResponse('Pipeline started', { status: 200 })
    }

    if (command === 'ayuda' || command === 'help' || command === 'comandos') {
        return new NextResponse(buildHelpMessage(), {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        })
    }

    return new NextResponse(
        [
            'No entendí ese comando.',
            '',
            buildHelpMessage(),
        ].join('\n'),
        {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        }
    )
}