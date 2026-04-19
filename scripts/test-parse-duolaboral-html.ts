import fs from 'node:fs/promises'
import path from 'node:path'
import { parseDuolaboralHtml } from '../app/features/jobs/adapters/duolaboral/parse-duolaboral-html'

async function main() {
    const filePath =
        process.argv[2] ??
        path.join(process.cwd(), 'tmp/duolaboral-list.html')

    const html = await fs.readFile(filePath, 'utf-8')
    const jobs = parseDuolaboralHtml(html)

    console.log(JSON.stringify({
        total: jobs.length,
        first: jobs[0] ?? null,
        sample: jobs.slice(0, 5),
    }, null, 2))
}

main().catch((error) => {
    console.error('test-parse-duolaboral-html error:', error)
    process.exit(1)
})