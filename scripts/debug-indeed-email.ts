import { loadEnvConfig } from '@next/env'
import { ImapFlow } from 'imapflow'

loadEnvConfig(process.cwd())

function requireEnv(name: string) {
    const value = process.env[name]

    if (!value) {
        throw new Error(`Missing ${name}`)
    }

    return value
}

function toBool(value: string | undefined, fallback = true) {
    if (value == null) return fallback
    return value.toLowerCase() === 'true'
}

function formatAddressList(addresses: any[] | undefined) {
    return (addresses ?? [])
        .map((address) => {
            const name = address.name ? `${address.name} ` : ''
            return `${name}<${address.address}>`
        })
        .join(', ')
}

async function main() {
    const client = new ImapFlow({
        host: requireEnv('GMAIL_IMAP_HOST'),
        port: Number(process.env.GMAIL_IMAP_PORT ?? 993),
        secure: toBool(process.env.GMAIL_IMAP_SECURE, true),
        auth: {
            user: requireEnv('GMAIL_IMAP_USER'),
            pass: requireEnv('GMAIL_IMAP_PASSWORD'),
        },
        logger: false,
    })

    await client.connect()

    console.log('✅ Conectado a Gmail IMAP')

    console.log('\n📁 Mailboxes disponibles:')
    const mailboxes = await client.list()

    for (const mailbox of mailboxes) {
        console.log(`- ${mailbox.path}`)
    }

    const mailboxName = process.env.INDEED_EMAIL_MAILBOX ?? 'INBOX'

    console.log(`\n📬 Revisando mailbox: ${mailboxName}`)

    const lock = await client.getMailboxLock(mailboxName)

    try {
        const lookbackDays = Number(process.env.INDEED_EMAIL_LOOKBACK_DAYS ?? 14)
        const since = new Date()
        since.setDate(since.getDate() - lookbackDays)

        const searchResult = await client.search({
            since,
        })

        const uids = Array.isArray(searchResult) ? searchResult : []

        console.log(`\n🔎 Correos encontrados desde ${since.toISOString()}: ${uids.length}`)

        const latestUids = uids.slice(-50).reverse()

        console.log('\n🧾 Últimos correos recientes:')
        console.log('----------------------------------------')

        for await (const message of client.fetch(latestUids, {
            envelope: true,
            uid: true,
        })) {
            const from = formatAddressList(message.envelope?.from)
            const subject = message.envelope?.subject ?? '(sin asunto)'
            const date = message.envelope?.date?.toISOString?.() ?? '(sin fecha)'

            const text = `${from} ${subject}`.toLowerCase()
            const maybeIndeed =
                text.includes('indeed') ||
                text.includes('empleo') ||
                text.includes('trabajo') ||
                text.includes('alerta')

            console.log({
                uid: message.uid,
                date,
                from,
                subject,
                maybeIndeed,
            })
        }
    } finally {
        lock.release()
        await client.logout()
    }
}

main().catch((error) => {
    console.error('debug-indeed-email error:', error)
    process.exit(1)
})