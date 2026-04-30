import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CopyButton } from '@/components/copy-button'
import { saveJobApplicationCvVariant } from '../../actions'

type JobRow = {
    id: string
    title: string
    company: string | null
    location: string | null
    url: string | null
    source_name: string | null
    modality: string | null
    seniority: string | null
    salary_text: string | null
    description: string | null
    tech_tags: string[] | null
    published_at: string | null
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
    job_id: string
    profile_id: string
    status: 'saved' | 'applied' | 'interview' | 'rejected' | 'offer'
    applied_at: string | null
    notes: string | null
    cv_variant: string | null
}

function getRelationObject<T>(value: T | T[] | null): T | null {
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

function normalizeText(value: string | null | undefined) {
    return (value ?? '').replace(/\s+/g, ' ').trim()
}

function buildHighlights(params: {
    title: string
    company: string | null
    reasons: string[]
    techTags: string[]
    profileName: string
}) {
    const title = params.title
    const company = params.company ?? 'la empresa'
    const reasons = params.reasons.slice(0, 4)
    const tags = params.techTags.slice(0, 6)

    return [
        `Mi perfil ${params.profileName} tiene alineación directa con el cargo "${title}".`,
        ...reasons.map((reason) => `Punto fuerte: ${reason}.`),
        ...(tags.length ? [`Tecnologías/palabras clave relevantes: ${tags.join(', ')}.`] : []),
        `Vale la pena destacar motivación real por aportar en ${company}.`,
    ]
}

function buildLinkedInMessage(params: {
    title: string
    company: string | null
    profileName: string
    reasons: string[]
}) {
    const company = params.company ?? 'su empresa'
    const reasonText =
        params.reasons.slice(0, 2).join('; ') || 'mi perfil tiene buena alineación con el cargo'

    return `Hola, vi la vacante "${params.title}" en ${company} y me interesó mucho. Mi perfil ${params.profileName} encaja bien por ${reasonText}. Tengo interés en aportar y me gustaría avanzar en el proceso. Quedo atento.`
}

function buildEmailSubject(params: {
    title: string
    company: string | null
}) {
    return `Postulación a ${params.title}${params.company ? ` - ${params.company}` : ''}`
}

function buildEmailBody(params: {
    title: string
    company: string | null
    location: string | null
    profileName: string
    reasons: string[]
}) {
    const company = params.company ?? 'su empresa'
    const locationLine = params.location ? `Ubicación: ${params.location}` : null
    const reasons = params.reasons.slice(0, 4)

    return [
        `Hola,`,
        ``,
        `Les escribo para postular al cargo "${params.title}"${params.company ? ` en ${company}` : ''}.`,
        ``,
        `Considero que mi perfil ${params.profileName} tiene una buena alineación con esta oportunidad por los siguientes puntos:`,
        ...reasons.map((reason) => `- ${reason}`),
        ``,
        `Me interesa especialmente esta vacante porque se ajusta a mi foco actual y a las habilidades que quiero aportar en un rol profesional.`,
        ...(locationLine ? ['', locationLine] : []),
        ``,
        `Quedo atento a cualquier información adicional o a la posibilidad de conversar.`,
        ``,
        `Saludos,`,
    ].join('\n')
}

function extractCvKeywords(job: JobRow, reasons: string[]) {
    const fromTags = job.tech_tags ?? []

    const reasonKeywords = reasons
        .flatMap((reason) => reason.split(/["“”(),.;:·\-]/))
        .map((part) => part.trim())
        .filter((part) => part.length >= 3)

    const raw = [
        job.title,
        job.company,
        job.location,
        job.modality,
        job.seniority,
        ...(job.tech_tags ?? []),
        ...reasonKeywords,
    ]
        .map((value) => normalizeText(value))
        .filter(Boolean)

    return Array.from(new Set([...fromTags, ...raw])).slice(0, 12)
}

async function getMatchDetail(params: { jobId: string; profileId: string }) {
    const supabase = createAdminClient()

    const { data: matchData, error: matchError } = await supabase
        .from('job_matches')
        .select(`
      id,
      score,
      reasons,
      is_match,
      jobs (
        id,
        title,
        company,
        location,
        url,
        source_name,
        modality,
        seniority,
        salary_text,
        description,
        tech_tags,
        published_at
      ),
      search_profiles (
        id,
        name,
        slug
      )
    `)
        .eq('job_id', params.jobId)
        .eq('profile_id', params.profileId)
        .maybeSingle()

    if (matchError) throw new Error(matchError.message)
    if (!matchData) return null

    const { data: applicationData, error: applicationError } = await supabase
        .from('job_applications')
        .select('job_id, profile_id, status, applied_at, notes, cv_variant')
        .eq('job_id', params.jobId)
        .eq('profile_id', params.profileId)
        .maybeSingle()

    if (applicationError) throw new Error(applicationError.message)

    return {
        match: matchData as JobMatchRow,
        application: (applicationData ?? null) as JobApplicationRow | null,
    }
}

function getCvVariantLabel(value: string | null | undefined) {
    if (value === 'backend-jr') return 'Backend Jr'
    if (value === 'fullstack-jr') return 'Fullstack Jr'
    if (value === 'frontend-react') return 'Frontend React'
    if (value === 'administrativo') return 'Administrativo'
    if (value === 'ventas-atencion') return 'Ventas / Atención'
    if (value === 'general') return 'General'
    return 'Sin definir'
}

function DetailSkeleton() {
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border p-5">
                <div className="h-6 w-56 animate-pulse rounded bg-neutral-900" />
                <div className="mt-4 h-4 w-72 animate-pulse rounded bg-neutral-950" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="rounded-xl border p-4">
                        <div className="h-4 w-24 animate-pulse rounded bg-neutral-900" />
                        <div className="mt-3 h-4 w-32 animate-pulse rounded bg-neutral-950" />
                    </div>
                ))}
            </div>
        </div>
    )
}

function InfoCard({
    label,
    value,
}: {
    label: string
    value: string | null | undefined
}) {
    return (
        <div className="rounded-xl border p-4">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-sm">{value && value.trim() ? value : 'Sin dato'}</p>
        </div>
    )
}

function TextBlock({
    title,
    content,
}: {
    title: string
    content: string
}) {
    return (
        <section className="rounded-2xl border p-5">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{title}</h2>
                <CopyButton text={content} />
            </div>

            <textarea
                readOnly
                value={content}
                rows={8}
                className="mt-4 w-full rounded-xl border bg-transparent px-3 py-3 text-sm outline-none"
            />
        </section>
    )
}

function CvVariantForm({
    jobId,
    profileId,
    currentValue,
}: {
    jobId: string
    profileId: string
    currentValue: string | null
}) {
    const options = [
        { value: '', label: 'Sin definir' },
        { value: 'backend-jr', label: 'Backend Jr' },
        { value: 'fullstack-jr', label: 'Fullstack Jr' },
        { value: 'frontend-react', label: 'Frontend React' },
        { value: 'administrativo', label: 'Administrativo' },
        { value: 'ventas-atencion', label: 'Ventas / Atención' },
        { value: 'general', label: 'General' },
    ]

    return (
        <form action={saveJobApplicationCvVariant} className="rounded-2xl border p-5">
            <h2 className="text-lg font-semibold">CV usado</h2>

            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="profile_id" value={profileId} />

            <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[240px]">
                    <label className="mb-2 block text-sm text-neutral-400">Variante de CV</label>

                    <select
                        name="cv_variant"
                        defaultValue={currentValue ?? ''}
                        className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                    >
                        {options.map((option) => (
                            <option key={option.label} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    type="submit"
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Guardar CV
                </button>
            </div>
        </form>
    )
}

async function DetailContent({
    params,
}: {
    params: Promise<{ jobId: string; profileId: string }>
}) {
    await connection()

    const resolvedParams = await params
    const result = await getMatchDetail({
        jobId: resolvedParams.jobId,
        profileId: resolvedParams.profileId,
    })

    if (!result) notFound()

    const job = getRelationObject(result.match.jobs)
    const profile = getRelationObject(result.match.search_profiles)

    if (!job || !profile) notFound()

    const reasons = result.match.reasons ?? []
    const highlights = buildHighlights({
        title: job.title,
        company: job.company,
        reasons,
        techTags: job.tech_tags ?? [],
        profileName: profile.name,
    })

    const linkedinMessage = buildLinkedInMessage({
        title: job.title,
        company: job.company,
        profileName: profile.name,
        reasons,
    })

    const emailSubject = buildEmailSubject({
        title: job.title,
        company: job.company,
    })

    const emailBody = buildEmailBody({
        title: job.title,
        company: job.company,
        location: job.location,
        profileName: profile.name,
        reasons,
    })

    const cvKeywords = extractCvKeywords(job, reasons)

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                                {job.source_name ?? 'sin fuente'}
                            </span>

                            <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                                Score {result.match.score}
                            </span>

                            <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                                Perfil: {profile.name}
                            </span>

                            {result.application?.status ? (
                                <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                                    Estado: {result.application.status}
                                </span>
                            ) : null}
                        </div>

                        <h2 className="mt-4 text-xl font-semibold">{job.title}</h2>
                        <p className="mt-2 text-sm text-neutral-400">
                            {job.company ?? 'Sin empresa'} · {job.location ?? 'Sin ubicación'}
                        </p>

                        <p className="mt-2 text-xs text-neutral-500">
                            Publicado: {formatDate(job.published_at)}
                        </p>
                    </div>

                    {job.url ? (
                        <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                        >
                            Abrir oferta
                        </a>
                    ) : null}
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard label="Empresa" value={job.company} />
                <InfoCard label="Ubicación" value={job.location} />
                <InfoCard label="Modalidad" value={job.modality} />
                <InfoCard label="Seniority" value={job.seniority} />
                <InfoCard label="Fuente" value={job.source_name} />
                <InfoCard label="Salario" value={job.salary_text} />
                <InfoCard label="Estado actual" value={result.application?.status ?? 'pending'} />
                <InfoCard
                    label="Fecha postulación"
                    value={result.application?.applied_at ? formatDate(result.application.applied_at) : 'No postulada'}
                />
                <InfoCard
                    label="CV usado"
                    value={getCvVariantLabel(result.application?.cv_variant)}
                />
            </section>

            <section className="rounded-2xl border p-5">
                <h2 className="text-lg font-semibold">Motivos del match</h2>
                <ul className="mt-4 space-y-2 text-sm text-neutral-300">
                    {reasons.length ? reasons.map((reason, index) => <li key={index}>• {reason}</li>) : <li>• Sin razones detalladas</li>}
                </ul>
            </section>

            <section className="rounded-2xl border p-5">
                <h2 className="text-lg font-semibold">Fortalezas a destacar</h2>
                <ul className="mt-4 space-y-2 text-sm text-neutral-300">
                    {highlights.map((item, index) => <li key={index}>• {item}</li>)}
                </ul>
            </section>

            <section className="rounded-2xl border p-5">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">Palabras clave para adaptar CV</h2>
                    {cvKeywords.length ? <CopyButton text={cvKeywords.join(', ')} label="Copiar keywords" /> : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {cvKeywords.length ? (
                        cvKeywords.map((keyword, index) => (
                            <span
                                key={`${keyword}-${index}`}
                                className="rounded-full border px-3 py-1 text-xs text-neutral-300"
                            >
                                {keyword}
                            </span>
                        ))
                    ) : (
                        <span className="text-sm text-neutral-400">Sin keywords detectadas.</span>
                    )}
                </div>
            </section>

            <CvVariantForm
                jobId={job.id}
                profileId={profile.id}
                currentValue={result.application?.cv_variant ?? null}
            />

            <TextBlock title="Mensaje corto para LinkedIn" content={linkedinMessage} />
            <TextBlock title="Asunto del correo" content={emailSubject} />
            <TextBlock title="Correo de postulación" content={emailBody} />

            <section className="rounded-2xl border p-5">
                <h2 className="text-lg font-semibold">Descripción de la vacante</h2>
                <textarea
                    readOnly
                    value={job.description ?? 'Sin descripción'}
                    rows={14}
                    className="mt-4 w-full rounded-xl border bg-transparent px-3 py-3 text-sm outline-none"
                />
            </section>

            <section className="rounded-2xl border p-5">
                <h2 className="text-lg font-semibold">Notas actuales</h2>
                <textarea
                    readOnly
                    value={result.application?.notes ?? 'Sin notas'}
                    rows={5}
                    className="mt-4 w-full rounded-xl border bg-transparent px-3 py-3 text-sm outline-none"
                />
            </section>
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
                        Material rápido para postular mejor y más rápido.
                    </p>
                </div>

                <Link
                    href="/admin/top-matches"
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Volver
                </Link>
            </div>

            <Suspense fallback={<DetailSkeleton />}>
                <DetailContent params={params} />
            </Suspense>
        </main>
    )
}