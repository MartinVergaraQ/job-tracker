import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
    const { getIndeedEmailJobs } = await import(
        '../app/features/jobs/adapters/indeed-email.adapter'
    )

    const jobs = await getIndeedEmailJobs()

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
    console.error('test-indeed-email error:', error)
    process.exit(1)
})