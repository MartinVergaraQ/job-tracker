import { Suspense } from 'react'
import { CvBaseForm } from './cv-base-form'
import { CvBaseListSection } from '@/app/admin/cv-base/cv-base-list-section'

const DEFAULT_PROFILE_ID = '7fab5bd9-502d-412d-b37e-bace8ed4487f'

function CvBaseListFallback() {
    return (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-950/60 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-lg font-semibold text-white">CVs guardados</p>
                    <p className="mt-1 text-sm text-neutral-400">
                        Cargando borradores y CV base...
                    </p>
                </div>

                <div className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-400">
                    Cargando
                </div>
            </div>

            <div className="mt-6 space-y-4">
                <div className="h-28 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/70" />
                <div className="h-28 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/70" />
            </div>
        </div>
    )
}

export default function CvBasePage() {
    return (
        <div className="space-y-8">
            <section className="rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-3 inline-flex rounded-full border border-neutral-700 bg-neutral-900/80 px-3 py-1 text-xs font-medium text-neutral-300">
                            Administración de CV base
                        </div>

                        <h1 className="text-3xl font-semibold tracking-tight text-white">
                            CV Base
                        </h1>

                        <p className="mt-3 text-sm leading-6 text-neutral-400">
                            Importa tu CV completo, guárdalo como borrador estructurado y
                            activa la versión que quieras usar como base para futuras
                            postulaciones, packs y CVs ATS.
                        </p>
                    </div>

                    <div className="grid gap-3 rounded-2xl border border-neutral-800 bg-black/20 p-4 text-sm text-neutral-300 sm:grid-cols-3 lg:min-w-[420px]">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-neutral-500">
                                Paso 1
                            </p>
                            <p className="mt-1 font-medium text-white">Pega tu CV</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-neutral-500">
                                Paso 2
                            </p>
                            <p className="mt-1 font-medium text-white">Guárdalo como borrador</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-neutral-500">
                                Paso 3
                            </p>
                            <p className="mt-1 font-medium text-white">Actívalo como base</p>
                        </div>
                    </div>
                </div>
            </section>

            <CvBaseForm />

            <Suspense fallback={<CvBaseListFallback />}>
                <CvBaseListSection profileId={DEFAULT_PROFILE_ID} />
            </Suspense>
        </div>
    )
}