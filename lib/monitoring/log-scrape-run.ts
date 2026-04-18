import { createAdminClient } from '@/lib/supabase/admin'

type ScrapeSourceResult = {
    source_name: string
    ok: boolean
    jobs_found: number
}

type CollectResult = {
    jobs_found: number
    jobs_processed: number
    matches_created: number
    sources?: ScrapeSourceResult[]
}

type LogScrapeRunParams = {
    status: 'success' | 'error'
    startedAt: Date
    finishedAt: Date
    result?: CollectResult
    errorMessage?: string
}

export async function logScrapeRun({
    status,
    startedAt,
    finishedAt,
    result,
    errorMessage,
}: LogScrapeRunParams) {
    const supabase = createAdminClient()

    const { data: run, error: runError } = await supabase
        .from('scrape_runs')
        .insert({
            status,
            started_at: startedAt.toISOString(),
            finished_at: finishedAt.toISOString(),
            jobs_found: result?.jobs_found ?? 0,
            jobs_inserted: result?.jobs_processed ?? 0,
            error_message: errorMessage ?? null,
        })
        .select('id')
        .single()

    if (runError) {
        throw new Error(`Failed to insert scrape_runs: ${runError.message}`)
    }

    const sources = result?.sources ?? []

    if (!sources.length) return

    const { error: sourcesError } = await supabase
        .from('scrape_run_sources')
        .insert(
            sources.map((source) => ({
                scrape_run_id: run.id,
                source_name: source.source_name,
                ok: source.ok,
                jobs_found: source.jobs_found,
            }))
        )

    if (sourcesError) {
        // La tabla scrape_run_sources puede no existir aún — solo logueamos el error
        console.warn('scrape_run_sources insert failed (run migration?):', sourcesError.message)
    }
}