import { createAdminClient } from '@/lib/supabase/admin'
import { parseDuolaboralDetailHtml } from './parse-duolaboral-detail-html'

type EnrichResult = {
    scanned: number
    enriched: number
    failures: Array<{ job_id: string; url: string; error: string }>
}

function inferSeniority(experienceText: string | null) {
    if (!experienceText) return null

    const value = experienceText.toLowerCase()

    if (value.includes('sin experiencia')) return 'entry'
    if (value.includes('0 a 2')) return 'junior'
    if (value.includes('2 a 5')) return 'junior'
    if (value.includes('5 a 10')) return 'semi-senior'

    return null
}

export async function enrichDuolaboralJobs(limit = 20): Promise<EnrichResult> {
    const supabase = createAdminClient()

    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('id, url, source_name, description, salary_text, published_at, location, seniority')
        .eq('source_name', 'duolaboral')
        .order('published_at', { ascending: false })
        .limit(limit * 3)

    if (error) {
        throw new Error(error.message)
    }

    const candidates = (jobs ?? [])
        .filter((job) => {
            const missingDescription = !job.description || !job.description.trim()
            const missingSalary = !job.salary_text || !job.salary_text.trim()

            return missingDescription || missingSalary
        })
        .slice(0, limit)

    const failures: Array<{ job_id: string; url: string; error: string }> = []
    let enriched = 0

    for (const job of candidates) {
        try {
            const response = await fetch(job.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 JobStracker/1.0',
                },
                cache: 'no-store',
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            const html = await response.text()
            const detail = parseDuolaboralDetailHtml(html)
            const inferredSeniority = inferSeniority(detail.experience_text)

            const updatePayload: Record<string, unknown> = {
                description: detail.description ?? job.description,
                salary_text: detail.salary_text ?? job.salary_text,
                location: detail.location ?? job.location,
                published_at: detail.published_at ?? job.published_at,
                last_seen_at: new Date().toISOString(),
            }

            if (inferredSeniority) {
                updatePayload.seniority = inferredSeniority
            }

            const { error: updateError } = await supabase
                .from('jobs')
                .update(updatePayload)
                .eq('id', job.id)

            if (updateError) {
                throw new Error(updateError.message)
            }

            enriched += 1
        } catch (error) {
            failures.push({
                job_id: job.id,
                url: job.url,
                error: error instanceof Error ? error.message : 'Unknown enrich error',
            })
        }
    }

    return {
        scanned: candidates.length,
        enriched,
        failures,
    }
}