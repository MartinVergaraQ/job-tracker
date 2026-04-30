import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
    const { getComputrabajoEmailJobs } = await import(
        '../app/features/jobs/adapters/computrabajo-email.adapter'
    )

    const jobs = await getComputrabajoEmailJobs()

    console.log(
        JSON.stringify(
            {
                total: jobs.length,
                sample: jobs.slice(0, 10).map((job) => ({
                    source_name: job.source_name,
                    title: job.title,
                    company: job.company,
                    location: job.location,
                    url: job.url,
                    published_at: job.published_at,
                    tech_tags: job.tech_tags,
                })),
            },
            null,
            2
        )
    )
}

main().catch((error) => {
    console.error('test-computrabajo-email error:', error)
    process.exit(1)
})