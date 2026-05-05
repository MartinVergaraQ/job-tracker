import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    clearApplicationFollowUp,
    saveRecommendedApplicationKit,
    scheduleApplicationFollowUp,
    setJobApplicationStatus,
    updateApplicationCvVariant,
    updateApplicationNotes,
} from '../../actions'
import {
    buildApplicationAssistant,
    CV_VARIANTS,
    type CvVariantValue,
} from '@/lib/jobs/application-assistant'

type JobRow = {
    id: string
    title: string
    company: string | null
    location: string | null
    url: string | null
    source_name: string | null
    published_at: string | null
    description: string | null
    tech_tags: string[] | null
    modality: string | null
    seniority: string | null
    salary_text: string | null
}

type SearchProfileRow = {
    id: string
    name: string
    slug: string
}

type JobMatchRow = {
    id: string
    score: number
    reasons: string[] | null
    is_match: boolean
    jobs: JobRow | JobRow[] | null
    search_profiles: SearchProfileRow | SearchProfileRow[] | null
}

type JobApplicationRow = {
    id: string
    job_id: string
    profile_id: string
    status: 'saved' | 'applied' | 'interview' | 'rejected' | 'offer'
    applied_at: string | null
    follow_up_at: string | null
    notes: string | null
    cv_variant: string | null
}

function getRelationObject<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

function formatDate(value: string | null) {
    if (!value) return 'Sin fecha'

    return new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(value))
}

function getStatusLabel(status: string | null | undefined) {
    if (status === 'saved') return 'Guardada'
    if (status === 'applied') return 'Postulé'
    if (status === 'interview') return 'Entrevista'
    if (status === 'rejected') return 'Rechazada'
    if (status === 'offer') return 'Oferta'
    return 'Pendiente'
}

function getSourceClasses(sourceName: string | null) {
    if (sourceName === 'duolaboral') return 'bg-purple-100 text-purple-700'
    if (sourceName === 'linkedin_email_alerts') return 'bg-blue-100 text-blue-700'
    if (sourceName === 'chiletrabajos') return 'bg-orange-100 text-orange-700'
    if (sourceName === 'getonboard') return 'bg-green-100 text-green-700'
    if (sourceName === 'computrabajo_email_alerts') return 'bg-cyan-100 text-cyan-700'
    return 'bg-neutral-100 text-neutral-700'
}

function DetailSkeleton() {
    return (
        <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-2xl border p-5">
                    <div className="h-5 w-64 animate-pulse rounded bg-neutral-900" />
                    <div className="mt-4 h-24 animate-pulse rounded-xl bg-neutral-950" />
                </div>
            ))}
        </div>
    )
}

function CopyBox({
    title,
    value,
}: {
    title: string
    value: string
}) {
    return (
        <div className="rounded-2xl border bg-neutral-950 p-4">
            <p className="text-sm font-medium">{title}</p>
            <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                {value}
            </pre>
        </div>
    )
}

function StatusButton({
    jobId,
    profileId,
    status,
    label,
}: {
    jobId: string
    profileId: string
    status: string
    label: string
}) {
    return (
        <form action={setJobApplicationStatus}>
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="profile_id" value={profileId} />
            <button
                type="submit"
                name="status"
                value={status}
                className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
            >
                {label}
            </button>
        </form>
    )
}

async function getDetailData(jobId: string, profileId: string) {
    const supabase = createAdminClient()

    const [matchResponse, applicationResponse] = await Promise.all([
        supabase
            .from('job_matches')
            .select(`
                id,
                score,
                reasons,
                is_match,
                jobs!inner (
                    id,
                    title,
                    company,
                    location,
                    url,
                    source_name,
                    published_at,
                    description,
                    tech_tags,
                    modality,
                    seniority,
                    salary_text
                ),
                search_profiles!inner (
                    id,
                    name,
                    slug
                )
            `)
            .eq('job_id', jobId)
            .eq('profile_id', profileId)
            .maybeSingle(),

        supabase
            .from('job_applications')
            .select(`
                id,
                job_id,
                profile_id,
                status,
                applied_at,
                follow_up_at,
                notes,
                cv_variant
            `)
            .eq('job_id', jobId)
            .eq('profile_id', profileId)
            .maybeSingle(),
    ])

    if (matchResponse.error) {
        throw new Error(matchResponse.error.message)
    }

    if (applicationResponse.error) {
        throw new Error(applicationResponse.error.message)
    }

    const match = matchResponse.data as JobMatchRow | null
    const application = applicationResponse.data as JobApplicationRow | null

    return {
        match,
        application,
    }
}

async function DetailContent({
    params,
}: {
    params: Promise<{ jobId: string; profileId: string }>
}) {
    await connection()

    const { jobId, profileId } = await params
    const { match, application } = await getDetailData(jobId, profileId)

    if (!match) {
        notFound()
    }

    const job = getRelationObject(match.jobs)
    const profile = getRelationObject(match.search_profiles)

    if (!job || !profile) {
        notFound()
    }

    const assistant = buildApplicationAssistant({
        job,
        profile,
        score: match.score,
        reasons: match.reasons ?? [],
        currentCvVariant: application?.cv_variant,
    })

    const autoNotes = [
        `Preparación sugerida`,
        ``,
        `CV recomendado: ${assistant.recommendedCvLabel}`,
        `Fit: ${assistant.fitLevel}`,
        `Score: ${match.score}`,
        ``,
        `Checklist:`,
        ...assistant.checklist.map((item) => `- ${item}`),
        ``,
        `Mensaje recruiter:`,
        assistant.recruiterMessage,
        ``,
        `Follow-up:`,
        assistant.followUpMessage,
    ].join('\n')

    return (
        <div className="space-y-6">
            <section className="rounded-3xl border bg-gradient-to-br from-neutral-950 to-neutral-900 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${getSourceClasses(
                                    job.source_name
                                )}`}
                            >
                                {job.source_name ?? 'sin fuente'}
                            </span>

                            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                                Score {match.score}
                            </span>

                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                                {assistant.fitLevel}
                            </span>

                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                {getStatusLabel(application?.status)}
                            </span>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold">{job.title}</h2>
                            <p className="mt-1 text-sm text-neutral-400">
                                {job.company ?? 'Sin empresa'} ·{' '}
                                {job.location ?? 'Sin ubicación'}
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                                Perfil: {profile.name} · Publicado:{' '}
                                {formatDate(job.published_at)}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {job.url ? (
                            <a
                                href={job.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
                            >
                                Abrir oferta
                            </a>
                        ) : null}

                        <Link
                            href="/admin/top-matches"
                            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                        >
                            Volver
                        </Link>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border p-5">
                    <p className="text-sm text-neutral-500">CV recomendado</p>
                    <p className="mt-2 text-2xl font-semibold">
                        {assistant.recommendedCvLabel}
                    </p>
                    <p className="mt-2 text-sm text-neutral-400">
                        Actual: {assistant.currentCvLabel}
                    </p>
                </div>

                <div className="rounded-2xl border p-5">
                    <p className="text-sm text-neutral-500">Estado</p>
                    <p className="mt-2 text-2xl font-semibold">
                        {getStatusLabel(application?.status)}
                    </p>
                    <p className="mt-2 text-sm text-neutral-400">
                        Postulación: {formatDate(application?.applied_at ?? null)}
                    </p>
                </div>

                <div className="rounded-2xl border p-5">
                    <p className="text-sm text-neutral-500">Seguimiento</p>
                    <p className="mt-2 text-2xl font-semibold">
                        {application?.follow_up_at ? 'Programado' : 'Sin programar'}
                    </p>
                    <p className="mt-2 text-sm text-neutral-400">
                        {formatDate(application?.follow_up_at ?? null)}
                    </p>
                </div>
            </section>

            <section className="rounded-2xl border p-5">
                <h2 className="text-lg font-semibold">Acciones rápidas</h2>

                <div className="mt-4 flex flex-wrap gap-2">
                    <StatusButton
                        jobId={job.id}
                        profileId={profile.id}
                        status="saved"
                        label="Guardar"
                    />

                    <StatusButton
                        jobId={job.id}
                        profileId={profile.id}
                        status="applied"
                        label="Marcar postulado"
                    />

                    <StatusButton
                        jobId={job.id}
                        profileId={profile.id}
                        status="interview"
                        label="Entrevista"
                    />

                    <StatusButton
                        jobId={job.id}
                        profileId={profile.id}
                        status="offer"
                        label="Oferta"
                    />

                    <StatusButton
                        jobId={job.id}
                        profileId={profile.id}
                        status="rejected"
                        label="Descartar"
                    />

                    <form action={scheduleApplicationFollowUp}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="profile_id" value={profile.id} />
                        <input type="hidden" name="days" value="5" />
                        <button
                            type="submit"
                            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                        >
                            Seguimiento +5 días
                        </button>
                    </form>

                    <form action={clearApplicationFollowUp}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="profile_id" value={profile.id} />
                        <button
                            type="submit"
                            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
                        >
                            Limpiar seguimiento
                        </button>
                    </form>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border p-5">
                    <h2 className="text-lg font-semibold">Preparación ATS</h2>

                    <div className="mt-4 space-y-3">
                        {assistant.checklist.map((item, index) => (
                            <div
                                key={index}
                                className="rounded-xl bg-neutral-950 p-3 text-sm text-neutral-300"
                            >
                                {index + 1}. {item}
                            </div>
                        ))}
                    </div>

                    {assistant.atsKeywords.length ? (
                        <div className="mt-5">
                            <p className="text-sm text-neutral-500">Keywords detectadas</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {assistant.atsKeywords.map((keyword) => (
                                    <span
                                        key={keyword}
                                        className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"
                                    >
                                        {keyword}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {assistant.warnings.length ? (
                        <div className="mt-5 rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">
                            <p className="font-medium">Ojo antes de postular</p>
                            <ul className="mt-2 space-y-1">
                                {assistant.warnings.map((warning, index) => (
                                    <li key={index}>• {warning}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>

                <div className="rounded-2xl border p-5">
                    <h2 className="text-lg font-semibold">Guardar preparación</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                        Esto deja la postulación lista para trabajarla desde tu dashboard.
                    </p>

                    <form action={saveRecommendedApplicationKit} className="mt-4 space-y-4">
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="profile_id" value={profile.id} />
                        <input
                            type="hidden"
                            name="cv_variant"
                            value={assistant.recommendedCvVariant}
                        />

                        <textarea
                            name="notes"
                            defaultValue={application?.notes ?? autoNotes}
                            rows={14}
                            className="w-full rounded-2xl border bg-transparent p-4 text-sm outline-none focus:border-neutral-500"
                        />

                        <button
                            type="submit"
                            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
                        >
                            Guardar kit sugerido
                        </button>
                    </form>
                </div>
            </section>

            <section className="rounded-2xl border p-5">
                <h2 className="text-lg font-semibold">CV a usar</h2>

                <form action={updateApplicationCvVariant} className="mt-4 space-y-4">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="profile_id" value={profile.id} />

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {CV_VARIANTS.map((variant) => (
                            <label
                                key={variant.value}
                                className="cursor-pointer rounded-2xl border p-4 hover:bg-neutral-950"
                            >
                                <div className="flex items-start gap-3">
                                    <input
                                        type="radio"
                                        name="cv_variant"
                                        value={variant.value}
                                        defaultChecked={
                                            (application?.cv_variant ??
                                                assistant.recommendedCvVariant) ===
                                            variant.value
                                        }
                                        className="mt-1"
                                    />
                                    <div>
                                        <p className="font-medium">{variant.label}</p>
                                        <p className="mt-1 text-sm text-neutral-500">
                                            {variant.description}
                                        </p>
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>

                    <button
                        type="submit"
                        className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                    >
                        Guardar CV elegido
                    </button>
                </form>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
                <CopyBox title="Mensaje corto para recruiter" value={assistant.recruiterMessage} />
                <CopyBox title="Carta breve" value={assistant.coverLetter} />
            </section>

            <section className="rounded-2xl border p-5">
                <h2 className="text-lg font-semibold">Respuestas para formularios</h2>

                <div className="mt-4 grid gap-4">
                    {assistant.formAnswers.map((item) => (
                        <div key={item.question} className="rounded-2xl bg-neutral-950 p-4">
                            <p className="text-sm font-medium">{item.question}</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-300">
                                {item.answer}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            <CopyBox title="Mensaje de seguimiento" value={assistant.followUpMessage} />

            <section className="rounded-2xl border p-5">
                <h2 className="text-lg font-semibold">Notas manuales</h2>

                <form action={updateApplicationNotes} className="mt-4 space-y-4">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="profile_id" value={profile.id} />

                    <textarea
                        name="notes"
                        defaultValue={application?.notes ?? ''}
                        rows={8}
                        placeholder="Notas sobre esta postulación, contacto, sueldo, estado, pruebas técnicas, etc."
                        className="w-full rounded-2xl border bg-transparent p-4 text-sm outline-none focus:border-neutral-500"
                    />

                    <button
                        type="submit"
                        className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                    >
                        Guardar notas
                    </button>
                </form>
            </section>

            {job.description ? (
                <section className="rounded-2xl border p-5">
                    <h2 className="text-lg font-semibold">Descripción original</h2>
                    <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-neutral-950 p-4 text-sm leading-6 text-neutral-300">
                        {job.description}
                    </div>
                </section>
            ) : null}
        </div>
    )
}

export default function TopMatchDetailPage({
    params,
}: {
    params: Promise<{ jobId: string; profileId: string }>
}) {
    return (
        <main className="space-y-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Detalle de Match</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Preparación asistida para postular mejor y más rápido.
                    </p>
                </div>

                <Link
                    href="/admin/today"
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Acciones de hoy
                </Link>
            </div>

            <Suspense fallback={<DetailSkeleton />}>
                <DetailContent params={params} />
            </Suspense>
        </main>
    )
}