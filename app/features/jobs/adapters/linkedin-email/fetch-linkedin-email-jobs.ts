import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { parseLinkedInAlertEmail } from './parse-linkedin-alert-email'

export type LinkedInEmailScrapedJob = {
    external_id: string
    title: string
    company: string
    location: string | null
    modality: 'remote' | 'hybrid' | 'onsite' | 'unknown' | null
    seniority: 'trainee' | 'junior' | 'semi-senior' | 'senior' | 'unknown' | null
    url: string
    source_name: 'linkedin_email_alerts'
    published_at: string | null
    description: string | null
    tech_tags: string[]
}

function requireEnv(name: string) {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing ${name}`)
    }
    return value
}

function getMailbox() {
    return process.env.LINKEDIN_EMAIL_MAILBOX ?? 'INBOX'
}

function getFromFilter() {
    return process.env.LINKEDIN_EMAIL_FROM ?? 'jobalerts-noreply@linkedin.com'
}

function getLookbackDays() {
    const value = Number(process.env.LINKEDIN_EMAIL_LOOKBACK_DAYS ?? 3)
    return Number.isFinite(value) && value > 0 ? value : 3
}

function getMaxMessages() {
    const value = Number(process.env.LINKEDIN_EMAIL_MAX_MESSAGES ?? 20)
    return Number.isFinite(value) && value > 0 ? value : 20
}

export async function fetchLinkedInEmailJobs(): Promise<LinkedInEmailScrapedJob[]> {
    const client = new ImapFlow({
        host: requireEnv('GMAIL_IMAP_HOST'),
        port: Number(process.env.GMAIL_IMAP_PORT ?? 993),
        secure: (process.env.GMAIL_IMAP_SECURE ?? 'true') === 'true',
        auth: {
            user: requireEnv('GMAIL_IMAP_USER'),
            pass: requireEnv('GMAIL_IMAP_PASSWORD'),
        },
        logger: false,
    })

    const jobs = new Map<string, LinkedInEmailScrapedJob>()
    const since = new Date()
    since.setDate(since.getDate() - getLookbackDays())

    try {
        await client.connect()

        const lock = await client.getMailboxLock(getMailbox())

        try {
            const searchResult = await client.search({
                since,
                from: getFromFilter(),
            })

            const uids = Array.isArray(searchResult) ? searchResult : []
            const selectedUids = uids.slice(-getMaxMessages())

            if (selectedUids.length === 0) {
                return []
            }

            for await (const message of client.fetch(selectedUids, {
                uid: true,
                envelope: true,
                source: true,
            })) {
                const parsedEmail = await simpleParser(message.source as Buffer)

                const publishedAt =
                    parsedEmail.date?.toISOString() ??
                    message.envelope?.date?.toISOString() ??
                    null

                const emailJobs = parseLinkedInAlertEmail({
                    html: parsedEmail.html ? String(parsedEmail.html) : null,
                    text: parsedEmail.text ? String(parsedEmail.text) : null,
                    publishedAt,
                })

                for (const job of emailJobs) {
                    jobs.set(job.external_id, job)
                }
            }
        } finally {
            lock.release()
        }
    } finally {
        await client.logout().catch(() => null)
    }

    return Array.from(jobs.values())
}