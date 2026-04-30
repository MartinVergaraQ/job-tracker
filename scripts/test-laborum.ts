import { scrapeLaborumJobs } from '../app/features/jobs/adapters/laborum/scrape-laborum-jobs'

async function main() {
    const jobs = await scrapeLaborumJobs()

    console.log(
        JSON.stringify(
            {
                total: jobs.length,
                sample: jobs.slice(0, 5),
            },
            null,
            2
        )
    )
}

main().catch((error) => {
    console.error('test-laborum error:', error)
    process.exit(1)
})