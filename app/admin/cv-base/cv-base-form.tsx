'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
    importCvBaseAction,
    type CvBaseActionState,
} from './actions'

const cvBaseInitialState: CvBaseActionState = {
    status: 'idle',
    message: '',
    error: null,
    parsed: null,
}

function SubmitButton() {
    const { pending } = useFormStatus()

    return (
        <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-xl border border-neutral-700 bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? 'Procesando CV...' : 'Importar CV como borrador'}
        </button>
    )
}

function StatCard({
    label,
    value,
}: {
    label: string
    value: string | number
}) {
    return (
        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{value}</p>
        </div>
    )
}

export function CvBaseForm() {
    const [state, formAction] = useActionState(
        importCvBaseAction,
        cvBaseInitialState
    )

    const isSuccess = state.status === 'success'
    const isError = state.status === 'error'

    return (
        <section className="rounded-3xl border border-neutral-800 bg-neutral-950/60 p-6 shadow-sm">
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-5">
                    <div>
                        <p className="text-lg font-semibold text-white">Importar CV base</p>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                            Pega tu CV completo en texto plano. El sistema lo parsea por
                            reglas, lo guarda como borrador y no reemplaza automáticamente el
                            CV activo.
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <p className="text-xs uppercase tracking-wide text-neutral-500">
                                Seguro
                            </p>
                            <p className="mt-2 text-sm font-medium text-white">
                                No pisa el CV activo
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <p className="text-xs uppercase tracking-wide text-neutral-500">
                                Rápido
                            </p>
                            <p className="mt-2 text-sm font-medium text-white">
                                Importación en segundos
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <p className="text-xs uppercase tracking-wide text-neutral-500">
                                Reutilizable
                            </p>
                            <p className="mt-2 text-sm font-medium text-white">
                                Base para futuras postulaciones
                            </p>
                        </div>
                    </div>

                    <form action={formAction} className="space-y-4">
                        <input
                            type="hidden"
                            name="profileId"
                            value="7fab5bd9-502d-412d-b37e-bace8ed4487f"
                        />

                        <div className="space-y-2">
                            <label htmlFor="rawText" className="text-sm font-medium text-white">
                                CV completo
                            </label>

                            <textarea
                                id="rawText"
                                name="rawText"
                                rows={24}
                                placeholder="Pega aquí tu CV completo..."
                                className="min-h-[520px] w-full rounded-2xl border border-neutral-800 bg-black/30 p-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-neutral-600"
                                required
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <SubmitButton />
                            <p className="text-xs text-neutral-500">
                                Consejo: pega tu CV master más completo, no uno adaptado a una
                                oferta puntual.
                            </p>
                        </div>
                    </form>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-neutral-800 bg-black/20 p-5">
                        <p className="text-sm font-medium text-white">Qué hace este módulo</p>

                        <div className="mt-4 space-y-3 text-sm text-neutral-400">
                            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                                1. Lee tu CV completo
                            </div>
                            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                                2. Lo convierte a estructura usable
                            </div>
                            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                                3. Lo guarda como borrador
                            </div>
                            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                                4. Tú decides cuál activar como base
                            </div>
                        </div>
                    </div>

                    {state.status !== 'idle' ? (
                        <div
                            className={`rounded-2xl border p-5 ${isSuccess
                                    ? 'border-green-900 bg-green-950/30'
                                    : 'border-red-900 bg-red-950/30'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p
                                        className={`text-sm font-semibold ${isSuccess ? 'text-green-200' : 'text-red-200'
                                            }`}
                                    >
                                        {state.message}
                                    </p>

                                    {state.error ? (
                                        <p className="mt-2 text-xs text-red-300/90">{state.error}</p>
                                    ) : null}
                                </div>

                                <div
                                    className={`rounded-full px-3 py-1 text-xs font-medium ${isSuccess
                                            ? 'border border-green-800 bg-green-950/40 text-green-300'
                                            : 'border border-red-800 bg-red-950/40 text-red-300'
                                        }`}
                                >
                                    {isSuccess ? 'Listo' : 'Error'}
                                </div>
                            </div>

                            {state.parsed ? (
                                <div className="mt-5 space-y-4">
                                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                        <p className="text-xs uppercase tracking-wide text-neutral-400">
                                            Headline detectado
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-white">
                                            {state.parsed.headline}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                        <p className="text-xs uppercase tracking-wide text-neutral-400">
                                            Resumen detectado
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-neutral-200">
                                            {state.parsed.summary || 'Sin resumen'}
                                        </p>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <StatCard label="Skills" value={state.parsed.skillsCount} />
                                        <StatCard
                                            label="Experiencia"
                                            value={state.parsed.experienceCount}
                                        />
                                        <StatCard
                                            label="Proyectos"
                                            value={state.parsed.projectsCount}
                                        />
                                        <StatCard
                                            label="Educación"
                                            value={state.parsed.educationCount}
                                        />
                                        <StatCard
                                            label="Idiomas"
                                            value={state.parsed.languagesCount}
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-neutral-800 bg-black/10 p-5">
                            <p className="text-sm font-medium text-white">Resultado del import</p>
                            <p className="mt-2 text-sm text-neutral-500">
                                Cuando importes un CV, aquí verás el resumen detectado y el
                                conteo de skills, experiencia, proyectos, educación e idiomas.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}