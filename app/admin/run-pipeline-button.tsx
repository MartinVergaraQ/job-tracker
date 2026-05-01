'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { runPipelineAction } from '@/app/admin/run-pipeline-actions'
import { runPipelineInitialState } from '@/app/admin/pipeline-action-state'

function formatDuration(ms: number | null) {
    if (!ms) return null

    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60

    if (minutes <= 0) return `${remainingSeconds}s`

    return `${minutes}m ${remainingSeconds}s`
}

function SubmitButton() {
    const { pending } = useFormStatus()

    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? 'Ejecutando pipeline...' : 'Ejecutar pipeline ahora'}
        </button>
    )
}

export function RunPipelineButton() {
    const [state, formAction] = useActionState(
        runPipelineAction,
        runPipelineInitialState
    )

    const duration = formatDuration(state.durationMs)

    return (
        <div className="rounded-2xl border bg-neutral-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="font-medium">Pipeline laboral</p>
                    <p className="mt-1 text-sm text-neutral-500">
                        Corre collect, enrich, rescore y notificaciones.
                    </p>
                </div>

                <form action={formAction}>
                    <SubmitButton />
                </form>
            </div>

            {state.status !== 'idle' ? (
                <div
                    className={`mt-4 rounded-xl border p-4 text-sm ${state.status === 'success'
                        ? 'border-green-900 bg-green-950/30 text-green-200'
                        : 'border-red-900 bg-red-950/30 text-red-200'
                        }`}
                >
                    <p className="font-medium">{state.message}</p>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <p>Jobs: {state.jobsFound ?? '-'}</p>
                        <p>Procesados: {state.jobsProcessed ?? '-'}</p>
                        <p>Matches: {state.matchesCreated ?? '-'}</p>
                        <p>Duración: {duration ?? '-'}</p>
                        <p>Enriched: {state.enriched ?? '-'}</p>
                        <p>Rescored: {state.rescored ?? '-'}</p>
                        <p>Notificaciones: {state.notificationsSent ?? '-'}</p>
                    </div>

                    {state.error ? (
                        <p className="mt-3 text-xs opacity-80">{state.error}</p>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}