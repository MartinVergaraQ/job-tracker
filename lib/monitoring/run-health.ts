export type RunSourceSummary = {
    source_name: string
    ok: boolean
    jobs_found: number
}

export type RunHealth = 'healthy' | 'degraded' | 'error'

export function getRunHealthFromSources(
    sources: RunSourceSummary[] = []
): RunHealth {
    if (!sources.length) {
        return 'degraded'
    }

    if (sources.some((source) => source.ok === false)) {
        return 'degraded'
    }

    if (sources.some((source) => source.jobs_found === 0)) {
        return 'degraded'
    }

    return 'healthy'
}

export function getRunHealthFromCollectResult(result?: {
    sources?: RunSourceSummary[]
}): RunHealth {
    return getRunHealthFromSources(result?.sources ?? [])
}

export function getRunHealthFromPersistedRun(run: {
    status: string
    scrape_run_sources?: RunSourceSummary[] | null
}): RunHealth {
    if (run.status === 'error') {
        return 'error'
    }

    return getRunHealthFromSources(run.scrape_run_sources ?? [])
}