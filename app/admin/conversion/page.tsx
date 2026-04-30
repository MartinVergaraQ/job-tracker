import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

type JobRow = {
    id: string
    source_name: string | null
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

type FilterSearchParams = {
    profile?: string
    source?: string
    cvVariant?: string
}

const CV_VARIANTS = [
    { value: 'backend-jr', label: 'Backend Jr' },
    { value: 'fullstack-jr', label: 'Fullstack Jr' },
    { value: 'frontend-react', label: 'Frontend React' },
    { value: 'administrativo', label: 'Administrativo' },
    { value: 'ventas-atencion', label: 'Ventas / Atención' },
    { value: 'general', label: 'General' },
] as const

function getRelationObject<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null
    }

    return value ?? null
}

function buildQueryString(params: Record<string, string | undefined>) {
    const searchParams = new URLSearchParams()

    for (const [key, value] of Object.entries(params)) {
        if (value && value.trim()) {
            searchParams.set(key, value)
        }
    }

    const result = searchParams.toString()
    return result ? `?${result}` : ''
}

function formatPercent(value: number) {
    return `${value.toFixed(1)}%`
}

function safeRate(numerator: number, denominator: number) {
    if (!denominator) return 0
    return (numerator / denominator) * 100
}

function getCvVariantLabel(value: string | null | undefined) {
    const found = CV_VARIANTS.find((item) => item.value === value)
    return found?.label ?? 'Sin definir'
}

function getEffectiveCvVariant(application: JobApplicationRow | undefined) {
    return application?.cv_variant ?? 'unassigned'
}

async function getConversionData(filters: FilterSearchParams) {
    const supabase = createAdminClient()

    const lookbackDays = Number(process.env.CONVERSION_LOOKBACK_DAYS ?? 30)
    const since = new Date(
        Date.now() - lookbackDays * 24 * 60 * 60 * 1000
    ).toISOString()

    const { data: matchData, error: matchError } = await supabase
        .from('job_matches')
        .select(`
      id,
      score,
      is_match,
      jobs (
        id,
        source_name,
        published_at
      ),
      search_profiles (
        id,
        name,
        slug
      )
    `)
        .eq('is_match', true)
        .gte('jobs.published_at', since)
        .limit(1000)

    if (matchError) {
        throw new Error(matchError.message)
    }

    const matchRows = (matchData ?? []) as JobMatchRow[]

    const keys = matchRows
        .map((row) => {
            const job = getRelationObject(row.jobs)
            const profile = getRelationObject(row.search_profiles)

            if (!job || !profile) return null

            return {
                job_id: job.id,
                profile_id: profile.id,
            }
        })
        .filter(Boolean) as Array<{ job_id: string; profile_id: string }>

    const uniqueJobIds = Array.from(new Set(keys.map((item) => item.job_id)))
    const uniqueProfileIds = Array.from(new Set(keys.map((item) => item.profile_id)))

    let applications: JobApplicationRow[] = []

    if (uniqueJobIds.length > 0 && uniqueProfileIds.length > 0) {
        const { data: appData, error: appError } = await supabase
            .from('job_applications')
            .select('job_id, profile_id, status, applied_at, notes, cv_variant')
            .in('job_id', uniqueJobIds)
            .in('profile_id', uniqueProfileIds)

        if (appError) {
            throw new Error(appError.message)
        }

        applications = (appData ?? []) as JobApplicationRow[]
    }

    const appMap = new Map<string, JobApplicationRow>()

    for (const app of applications) {
        appMap.set(`${app.job_id}|${app.profile_id}`, app)
    }

    const filteredRows = matchRows.filter((row) => {
        const job = getRelationObject(row.jobs)
        const profile = getRelationObject(row.search_profiles)

        if (!job || !profile) return false

        const application = appMap.get(`${job.id}|${profile.id}`)
        const currentCvVariant = getEffectiveCvVariant(application)

        if (filters.profile && profile.slug !== filters.profile) {
            return false
        }

        if (filters.source && job.source_name !== filters.source) {
            return false
        }

        if (filters.cvVariant && currentCvVariant !== filters.cvVariant) {
            return false
        }

        return true
    })

    const totals = {
        matches: filteredRows.length,
        saved: 0,
        applied: 0,
        interview: 0,
        rejected: 0,
        offer: 0,
        unassignedCv: 0,
    }

    const sourceStats = new Map<
        string,
        {
            source: string
            matches: number
            applied: number
            interview: number
            offer: number
        }
    >()

    const cvStats = new Map<
        string,
        {
            cvVariant: string
            label: string
            matches: number
            applied: number
            interview: number
            offer: number
        }
    >()

    for (const row of filteredRows) {
        const job = getRelationObject(row.jobs)
        const profile = getRelationObject(row.search_profiles)

        if (!job || !profile) continue

        const application = appMap.get(`${job.id}|${profile.id}`)
        const source = job.source_name ?? 'sin_fuente'
        const cvVariant = getEffectiveCvVariant(application)
        const cvLabel =
            cvVariant === 'unassigned'
                ? 'Sin definir'
                : getCvVariantLabel(cvVariant)

        if (!sourceStats.has(source)) {
            sourceStats.set(source, {
                source,
                matches: 0,
                applied: 0,
                interview: 0,
                offer: 0,
            })
        }

        if (!cvStats.has(cvVariant)) {
            cvStats.set(cvVariant, {
                cvVariant,
                label: cvLabel,
                matches: 0,
                applied: 0,
                interview: 0,
                offer: 0,
            })
        }

        const sourceBucket = sourceStats.get(source)!
        const cvBucket = cvStats.get(cvVariant)!

        sourceBucket.matches += 1
        cvBucket.matches += 1

        if (!application?.cv_variant) {
            totals.unassignedCv += 1
        }

        if (application?.status === 'saved') {
            totals.saved += 1
        }

        if (application?.status === 'applied') {
            totals.applied += 1
            sourceBucket.applied += 1
            cvBucket.applied += 1
        }

        if (application?.status === 'interview') {
            totals.interview += 1
            sourceBucket.interview += 1
            cvBucket.interview += 1
        }

        if (application?.status === 'rejected') {
            totals.rejected += 1
        }

        if (application?.status === 'offer') {
            totals.offer += 1
            sourceBucket.offer += 1
            cvBucket.offer += 1
        }
    }

    const profiles = Array.from(
        new Map(
            filteredRows
                .map((row) => getRelationObject(row.search_profiles))
                .filter(Boolean)
                .map((profile) => [profile!.slug, profile!])
        ).values()
    )

    const sources = Array.from(
        new Set(
            filteredRows
                .map((row) => getRelationObject(row.jobs)?.source_name)
                .filter(
                    (value): value is string =>
                        typeof value === 'string' && value.trim().length > 0
                )
        )
    ).sort()

    return {
        totals,
        profiles,
        sources,
        sourceRows: Array.from(sourceStats.values()).sort(
            (a, b) => b.matches - a.matches
        ),
        cvRows: Array.from(cvStats.values()).sort((a, b) => b.matches - a.matches),
        meta: {
            lookbackDays,
        },
    }
}

function KpiCard({
    label,
    value,
    helper,
}: {
    label: string
    value: string | number
    helper?: string
}) {
    return (
        <div className="rounded-2xl border p-4">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
            {helper ? <p className="mt-2 text-xs text-neutral-500">{helper}</p> : null}
        </div>
    )
}

function FiltersBar({
    selectedProfile,
    selectedSource,
    selectedCvVariant,
    profiles,
    sources,
}: {
    selectedProfile?: string
    selectedSource?: string
    selectedCvVariant?: string
    profiles: SearchProfileRow[]
    sources: string[]
}) {
    return (
        <section className="rounded-2xl border p-4 space-y-4">
            <div>
                <p className="mb-2 text-sm text-neutral-500">Perfil</p>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href={buildQueryString({
                            source: selectedSource,
                            cvVariant: selectedCvVariant,
                        })}
                        className={`rounded-xl border px-3 py-2 text-sm ${!selectedProfile ? 'bg-neutral-900' : ''
                            }`}
                    >
                        Todos
                    </Link>

                    {profiles.map((profile) => (
                        <Link
                            key={profile.id}
                            href={buildQueryString({
                                profile: profile.slug,
                                source: selectedSource,
                                cvVariant: selectedCvVariant,
                            })}
                            className={`rounded-xl border px-3 py-2 text-sm ${selectedProfile === profile.slug ? 'bg-neutral-900' : ''
                                }`}
                        >
                            {profile.name}
                        </Link>
                    ))}
                </div>
            </div>

            <div>
                <p className="mb-2 text-sm text-neutral-500">Fuente</p>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href={buildQueryString({
                            profile: selectedProfile,
                            cvVariant: selectedCvVariant,
                        })}
                        className={`rounded-xl border px-3 py-2 text-sm ${!selectedSource ? 'bg-neutral-900' : ''
                            }`}
                    >
                        Todas
                    </Link>

                    {sources.map((source) => (
                        <Link
                            key={source}
                            href={buildQueryString({
                                profile: selectedProfile,
                                source,
                                cvVariant: selectedCvVariant,
                            })}
                            className={`rounded-xl border px-3 py-2 text-sm ${selectedSource === source ? 'bg-neutral-900' : ''
                                }`}
                        >
                            {source}
                        </Link>
                    ))}
                </div>
            </div>

            <div>
                <p className="mb-2 text-sm text-neutral-500">CV</p>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href={buildQueryString({
                            profile: selectedProfile,
                            source: selectedSource,
                        })}
                        className={`rounded-xl border px-3 py-2 text-sm ${!selectedCvVariant ? 'bg-neutral-900' : ''
                            }`}
                    >
                        Todos
                    </Link>

                    <Link
                        href={buildQueryString({
                            profile: selectedProfile,
                            source: selectedSource,
                            cvVariant: 'unassigned',
                        })}
                        className={`rounded-xl border px-3 py-2 text-sm ${selectedCvVariant === 'unassigned' ? 'bg-neutral-900' : ''
                            }`}
                    >
                        Sin definir
                    </Link>

                    {CV_VARIANTS.map((variant) => (
                        <Link
                            key={variant.value}
                            href={buildQueryString({
                                profile: selectedProfile,
                                source: selectedSource,
                                cvVariant: variant.value,
                            })}
                            className={`rounded-xl border px-3 py-2 text-sm ${selectedCvVariant === variant.value ? 'bg-neutral-900' : ''
                                }`}
                        >
                            {variant.label}
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    )
}

function ConversionTableBySource({
    rows,
}: {
    rows: Array<{
        source: string
        matches: number
        applied: number
        interview: number
        offer: number
    }>
}) {
    if (!rows.length) return null

    return (
        <section className="rounded-2xl border p-5">
            <h2 className="text-lg font-semibold">Conversión por fuente</h2>

            <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="text-left text-neutral-500">
                        <tr className="border-b">
                            <th className="px-3 py-2 font-medium">Fuente</th>
                            <th className="px-3 py-2 font-medium">Matches</th>
                            <th className="px-3 py-2 font-medium">Postulé</th>
                            <th className="px-3 py-2 font-medium">Entrevista</th>
                            <th className="px-3 py-2 font-medium">Oferta</th>
                            <th className="px-3 py-2 font-medium">Match → Postulé</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.source} className="border-b last:border-b-0">
                                <td className="px-3 py-3">{row.source}</td>
                                <td className="px-3 py-3">{row.matches}</td>
                                <td className="px-3 py-3">{row.applied}</td>
                                <td className="px-3 py-3">{row.interview}</td>
                                <td className="px-3 py-3">{row.offer}</td>
                                <td className="px-3 py-3">
                                    {formatPercent(safeRate(row.applied, row.matches))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

function ConversionTableByCv({
    rows,
}: {
    rows: Array<{
        cvVariant: string
        label: string
        matches: number
        applied: number
        interview: number
        offer: number
    }>
}) {
    if (!rows.length) return null

    return (
        <section className="rounded-2xl border p-5">
            <h2 className="text-lg font-semibold">Conversión por CV</h2>

            <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="text-left text-neutral-500">
                        <tr className="border-b">
                            <th className="px-3 py-2 font-medium">CV</th>
                            <th className="px-3 py-2 font-medium">Matches</th>
                            <th className="px-3 py-2 font-medium">Postulé</th>
                            <th className="px-3 py-2 font-medium">Entrevista</th>
                            <th className="px-3 py-2 font-medium">Oferta</th>
                            <th className="px-3 py-2 font-medium">Match → Postulé</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.cvVariant} className="border-b last:border-b-0">
                                <td className="px-3 py-3">{row.label}</td>
                                <td className="px-3 py-3">{row.matches}</td>
                                <td className="px-3 py-3">{row.applied}</td>
                                <td className="px-3 py-3">{row.interview}</td>
                                <td className="px-3 py-3">{row.offer}</td>
                                <td className="px-3 py-3">
                                    {formatPercent(safeRate(row.applied, row.matches))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

export default async function AdminConversionPage({
    searchParams,
}: {
    searchParams: Promise<FilterSearchParams>
}) {
    const filters = await searchParams
    const { totals, profiles, sources, sourceRows, cvRows, meta } =
        await getConversionData(filters)

    return (
        <main className="space-y-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Conversión laboral</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Seguimiento real de match → postulación → entrevista → oferta.
                    </p>
                </div>

                <Link
                    href="/admin/top-matches"
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-950"
                >
                    Ver top matches
                </Link>
            </div>

            <div className="rounded-2xl border p-4 text-sm text-neutral-400">
                Ventana: últimos {meta.lookbackDays} días
            </div>

            <FiltersBar
                selectedProfile={filters.profile}
                selectedSource={filters.source}
                selectedCvVariant={filters.cvVariant}
                profiles={profiles}
                sources={sources}
            />

            <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <KpiCard label="Matches" value={totals.matches} />
                <KpiCard
                    label="Postulé"
                    value={totals.applied}
                    helper={formatPercent(safeRate(totals.applied, totals.matches))}
                />
                <KpiCard
                    label="Entrevista"
                    value={totals.interview}
                    helper={formatPercent(safeRate(totals.interview, totals.matches))}
                />
                <KpiCard
                    label="Oferta"
                    value={totals.offer}
                    helper={formatPercent(safeRate(totals.offer, totals.matches))}
                />
                <KpiCard label="Guardadas" value={totals.saved} />
                <KpiCard label="CV sin definir" value={totals.unassignedCv} />
            </section>

            <ConversionTableBySource rows={sourceRows} />
            <ConversionTableByCv rows={cvRows} />
        </main>
    )
}