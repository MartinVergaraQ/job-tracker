import crypto from 'crypto'
import type { NormalizedJob } from '../../types/job'

export function createFingerprint(
    job: Pick<NormalizedJob, 'title' | 'company' | 'location' | 'source_name'>
) {
    const raw = [
        job.title.trim().toLowerCase(),
        job.company.trim().toLowerCase(),
        (job.location ?? '').trim().toLowerCase(),
        job.source_name.trim().toLowerCase(),
    ].join('|')

    return crypto.createHash('sha256').update(raw).digest('hex')
}