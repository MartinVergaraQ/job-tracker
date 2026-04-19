import { createAdminClient } from '@/lib/supabase/admin'
import type { CollectResult } from '@/lib/monitoring/log-scrape-run'
import {
    getRunHealthFromPersistedRun,
    type RunHealth,
} from '@/lib/monitoring/run-health'

type PersistedRunSource = {
    source_name: string
    ok: boolean
    jobs_found: number
}

type PersistedRun = {
    id: string
    status: 'success' | 'error'
    duration_ms: number
    jobs_found: number
    jobs_processed: number
    matches_created: number
    error_message: string | null
    scrape_run_sources?: PersistedRunSource[]
}

type NotifyRunHealthChangeParams = {
    currentRunId: string
    currentHealth: RunHealth
    result?: CollectResult
    errorMessage?: string
}

function getHealthTitle(health: RunHealth) {
    if (health === 'healthy') return '✅ Sistema recuperado'
    if (health === 'degraded') return '⚠️ Sistema degradado'
    return '🚨 Sistema con error'
}

function formatSources(run: PersistedRun) {
    const sources = run.scrape_run_sources ?? []

    if (!sources.length) {
        return 'Fuentes: sin detalle'
    }

    return sources
        .map((source) => {
            const sourceStatus = source.ok ? 'OK' : 'FAIL'
            return `- ${source.source_name}: ${sourceStatus} · ${source.jobs_found} jobs`
        })
        .join('\n')
}

function buildMessage(params: {
    currentRun: PersistedRun
    currentHealth: RunHealth
    previousHealth: RunHealth | null
}) {
    const { currentRun, currentHealth, previousHealth } = params

    return [
        getHealthTitle(currentHealth),
        '',
        `Cambio: ${previousHealth ?? 'sin historial'} -> ${currentHealth}`,
        `Run: ${currentRun.id}`,
        `Estado: ${currentRun.status}`,
        `Duración: ${currentRun.duration_ms} ms`,
        `Jobs encontrados: ${currentRun.jobs_found}`,
        `Jobs procesados: ${currentRun.jobs_processed}`,
        `Matches: ${currentRun.matches_created}`,
        '',
        formatSources(currentRun),
        currentRun.error_message
            ? `\nError: ${currentRun.error_message}`
            : '',
    ]
        .filter(Boolean)
        .join('\n')
}

async function sendTelegramMessage(text: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_OPS_CHAT_ID

    if (!botToken || !chatId) {
        return { sent: false, reason: 'missing_env' as const }
    }

    const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text,
            }),
            cache: 'no-store',
        }
    )

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown Telegram error')
        throw new Error(`Telegram send failed: ${errorText}`)
    }

    return { sent: true as const }
}

export async function notifyRunHealthChange({
    currentRunId,
    currentHealth,
}: NotifyRunHealthChangeParams) {
    const sendRecoveryAlerts =
        process.env.SEND_HEALTH_RECOVERY_ALERTS === 'true'

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('scrape_runs')
        .select(`
      id,
      status,
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
        .order('created_at', { ascending: false })
        .limit(5)

    if (error) {
        throw new Error(`Failed to load recent scrape_runs: ${error.message}`)
    }

    const runs = (data ?? []) as PersistedRun[]

    const currentRun = runs.find((run) => run.id === currentRunId)

    if (!currentRun) {
        return { sent: false, reason: 'current_run_not_found' as const }
    }

    const previousRun = runs.find((run) => run.id !== currentRunId) ?? null
    const previousHealth = previousRun
        ? getRunHealthFromPersistedRun(previousRun)
        : null

    if (previousHealth === currentHealth) {
        return { sent: false, reason: 'no_health_change' as const }
    }

    if (currentHealth === 'healthy' && !sendRecoveryAlerts) {
        return { sent: false, reason: 'recovery_alert_disabled' as const }
    }

    const message = buildMessage({
        currentRun,
        currentHealth,
        previousHealth,
    })

    return sendTelegramMessage(message)
}