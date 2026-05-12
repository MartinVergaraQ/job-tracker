'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
    activateCvBaseAction,
    type ActivateCvBaseActionState,
} from './actions'

type CvProfileListItem = {
    id: string
    headline: string
    summary: string
    parsed_by: string
    is_active: boolean
    created_at: string
    created_at_label: string
    skills: string[]
    experience: unknown[]
    projects: unknown[]
    education: unknown[]
    languages: unknown[]
}

type Props = {
    profileId: string
    items: CvProfileListItem[]
}

const activateInitialState: ActivateCvBaseActionState = {
    status: 'idle',
    message: '',
    error: null,
}

function ActivateButton({ isActive }: { isActive: boolean }) {
    const { pending } = useFormStatus()

    return (
        <button
            type="submit"
            disabled={pending || isActive}
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${isActive
                    ? 'border border-green-800 bg-green-950/40 text-green-300'
                    : 'border border-neutral-700 bg-white text-black hover:bg-neutral-200'
                }`}
        >
            {isActive ? 'Activo' : pending ? 'Activando...' : 'Activar como base'}
        </button>
    )
}

function ActivateCvForm({
    profileId,
    cvProfileId,
    isActive,
}: {
    profileId: string
    cvProfileId: string
    isActive: boolean
}) {
    const [state, formAction] = useActionState(
        activateCvBaseAction,
        activateInitialState
    )

    return (
        <div className="space-y-2">
            <form action={formAction}>
                <input type="hidden" name="profileId" value={profileId} />
                <input type="hidden" name="cvProfileId" value={cvProfileId} />
                <ActivateButton isActive={isActive} />
            </form>

            {state.status !== 'idle' ? (
                <p
                    className={`text-xs ${state.status === 'success' ? 'text-green-400' : 'text-red-400'
                        }`}
                >
                    {state.message}
                    {state.error ? ` — ${state.error}` : ''}
                </p>
            ) : null}
        </div>
    )
}

function MetricChip({
    label,
    value,
}: {
    label: string
    value: number
}) {
    return (
        <div className="rounded-full border border-neutral-700 bg-neutral-900/70 px-3 py-1 text-xs text-neutral-300">
            {label}: <span className="font-medium text-white">{value}</span>
        </div>
    )
}

export function CvBaseList({ profileId, items }: Props) {
    if (items.length === 0) {
        return (
            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/60 p-6 shadow-sm">
                <p className="text-lg font-semibold text-white">CVs guardados</p>
                <p className="mt-2 text-sm text-neutral-500">
                    Todavía no hay borradores ni CVs base guardados.
                </p>
            </div>
        )
    }

    return (
        <section className="rounded-3xl border border-neutral-800 bg-neutral-950/60 p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-lg font-semibold text-white">CVs guardados</p>
                    <p className="mt-1 text-sm text-neutral-400">
                        Revisa tus borradores importados y activa el que quieras usar como
                        CV base del sistema.
                    </p>
                </div>

                <div className="rounded-full border border-neutral-700 bg-neutral-900/70 px-3 py-1 text-xs text-neutral-300">
                    {items.length} versiones disponibles
                </div>
            </div>

            <div className="space-y-4">
                {items.map((item) => (
                    <article
                        key={item.id}
                        className={`rounded-2xl border p-5 transition ${item.is_active
                                ? 'border-green-900 bg-green-950/10'
                                : 'border-neutral-800 bg-black/20'
                            }`}
                    >
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0 flex-1 space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold text-white">
                                        {item.headline || 'Sin headline'}
                                    </p>

                                    {item.is_active ? (
                                        <span className="rounded-full border border-green-800 bg-green-950/40 px-2.5 py-1 text-xs font-medium text-green-300">
                                            Activo
                                        </span>
                                    ) : (
                                        <span className="rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-1 text-xs font-medium text-neutral-400">
                                            Borrador
                                        </span>
                                    )}
                                </div>

                                <p className="max-w-4xl text-sm leading-6 text-neutral-300">
                                    {item.summary || 'Sin resumen'}
                                </p>

                                <div className="flex flex-wrap gap-2">
                                    <MetricChip label="Skills" value={item.skills?.length ?? 0} />
                                    <MetricChip
                                        label="Experiencia"
                                        value={item.experience?.length ?? 0}
                                    />
                                    <MetricChip
                                        label="Proyectos"
                                        value={item.projects?.length ?? 0}
                                    />
                                    <MetricChip
                                        label="Educación"
                                        value={item.education?.length ?? 0}
                                    />
                                    <MetricChip
                                        label="Idiomas"
                                        value={item.languages?.length ?? 0}
                                    />
                                </div>

                                <div className="grid gap-2 text-xs text-neutral-500 sm:grid-cols-2 lg:grid-cols-3">
                                    <p>
                                        <span className="text-neutral-400">Origen:</span>{' '}
                                        {item.parsed_by}
                                    </p>
                                    <p>
                                        <span className="text-neutral-400">Creado:</span>{' '}
                                        {item.created_at_label}
                                    </p>
                                    <p className="truncate">
                                        <span className="text-neutral-400">ID:</span> {item.id}
                                    </p>
                                </div>
                            </div>

                            <div className="xl:w-[220px]">
                                <ActivateCvForm
                                    profileId={profileId}
                                    cvProfileId={item.id}
                                    isActive={item.is_active}
                                />
                            </div>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    )
}