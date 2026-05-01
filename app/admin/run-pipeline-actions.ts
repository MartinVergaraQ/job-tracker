'use server'

import { revalidatePath } from 'next/cache'
import type { RunPipelineActionState } from './pipeline-action-state'

type RunAllResponse = {
    ok: boolean
    duration_ms?: number
    error?: string
    collect?: {
        ok: boolean
        result?: {
            jobs_found: number
            jobs_processed: number
            matches_created: number
        }
        error?: string
    }
    enrich?: {
        ok: boolean
        result?: {
            scanned: number
            enriched: number
        }
        error?: string
    } | null
    rescore?: {
        ok: boolean
        result?: {
            scanned: number
            rescored: number
            matches_upserted: number
        }
        error?: string
    } | null
    notify?: {
        ok: boolean
        scanned: number
        selected: number
        sent: number
        failures: unknown[]
        skipped: unknown[]
    } | null
}

function getBaseUrl() {
    const internalBaseUrl = process.env.INTERNAL_BASE_URL?.trim()
    const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

    if (internalBaseUrl) return internalBaseUrl.replace(/\/$/, '')
    if (publicAppUrl) return publicAppUrl.replace(/\/$/, '')

    return 'http://localhost:3000'
}

function getCronSecret() {
    return process.env.CRON_SECRET ?? process.env.INTERNAL_API_SECRET ?? null
}

export async function runPipelineAction(
    _previousState: RunPipelineActionState,
    _formData: FormData
): Promise<RunPipelineActionState> {
    const startedAt = Date.now()
    const baseUrl = getBaseUrl()
    const secret = getCronSecret()

    if (!secret) {
        return {
            status: 'error',
            message: 'Falta CRON_SECRET o INTERNAL_API_SECRET.',
            durationMs: Date.now() - startedAt,
            jobsFound: null,
            jobsProcessed: null,
            matchesCreated: null,
            enriched: null,
            rescored: null,
            notificationsSent: null,
            error: 'Missing CRON_SECRET or INTERNAL_API_SECRET',
        }
    }

    try {
        const response = await fetch(`${baseUrl}/api/cron/run-all`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${secret}`,
            },
            cache: 'no-store',
        })

        const body = (await response.json().catch(() => null)) as RunAllResponse | null

        if (!response.ok || !body?.ok) {
            const message =
                body?.error ??
                body?.collect?.error ??
                `Pipeline falló con status ${response.status}`

            return {
                status: 'error',
                message,
                durationMs: Date.now() - startedAt,
                jobsFound: body?.collect?.result?.jobs_found ?? null,
                jobsProcessed: body?.collect?.result?.jobs_processed ?? null,
                matchesCreated: body?.collect?.result?.matches_created ?? null,
                enriched: body?.enrich?.result?.enriched ?? null,
                rescored: body?.rescore?.result?.rescored ?? null,
                notificationsSent: body?.notify?.sent ?? null,
                error: message,
            }
        }

        revalidatePath('/admin')
        revalidatePath('/admin/jobs')
        revalidatePath('/admin/top-matches')
        revalidatePath('/admin/today')
        revalidatePath('/admin/conversion')
        revalidatePath('/admin/runs')

        return {
            status: 'success',
            message: 'Pipeline ejecutado correctamente.',
            durationMs: body.duration_ms ?? Date.now() - startedAt,
            jobsFound: body.collect?.result?.jobs_found ?? null,
            jobsProcessed: body.collect?.result?.jobs_processed ?? null,
            matchesCreated: body.collect?.result?.matches_created ?? null,
            enriched: body.enrich?.result?.enriched ?? null,
            rescored: body.rescore?.result?.rescored ?? null,
            notificationsSent: body.notify?.sent ?? null,
            error: null,
        }
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Unknown pipeline error'

        return {
            status: 'error',
            message,
            durationMs: Date.now() - startedAt,
            jobsFound: null,
            jobsProcessed: null,
            matchesCreated: null,
            enriched: null,
            rescored: null,
            notificationsSent: null,
            error: message,
        }
    }
}