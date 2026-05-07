import twilio from 'twilio'
import { sendWhatsAppCloudMessage } from '@/lib/notifications/send-whatsapp-cloud-message'

type SendWhatsAppMessageParams = {
    to?: string
    body: string
}

let client: ReturnType<typeof twilio> | null = null

function getRequiredEnv(name: string) {
    const value = process.env[name]?.trim()

    if (!value) {
        throw new Error(`Missing ${name}`)
    }

    return value
}

function normalizeWhatsAppNumber(value: string) {
    const clean = value.trim().replace(/\s+/g, '')

    if (clean.startsWith('whatsapp:')) {
        return clean
    }

    return `whatsapp:${clean}`
}

function getTwilioClient() {
    if (client) return client

    const accountSid = getRequiredEnv('TWILIO_ACCOUNT_SID')
    const authToken = getRequiredEnv('TWILIO_AUTH_TOKEN')

    client = twilio(accountSid, authToken)

    return client
}

async function sendTwilioWhatsAppMessage({
    to,
    body,
}: SendWhatsAppMessageParams) {
    const from = normalizeWhatsAppNumber(getRequiredEnv('TWILIO_WHATSAPP_FROM'))
    const defaultTo = normalizeWhatsAppNumber(getRequiredEnv('WHATSAPP_TO'))

    const targetTo = normalizeWhatsAppNumber(to ?? defaultTo)
    const cleanBody = body.trim()

    if (!cleanBody) {
        throw new Error('WhatsApp body is empty')
    }

    const tx = getTwilioClient()

    const message = await tx.messages.create({
        from,
        to: targetTo,
        body: cleanBody,
    })

    return {
        provider: 'twilio' as const,
        sid: message.sid,
        id: message.sid,
        status: message.status,
        to: targetTo,
    }
}

export async function sendWhatsAppMessage(params: SendWhatsAppMessageParams) {
    const provider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase()

    if (provider === 'meta') {
        const result = await sendWhatsAppCloudMessage(params)

        return {
            provider: 'meta' as const,
            sid: result.id,
            id: result.id,
            status: result.status,
            to: result.to,
            raw: result.raw,
        }
    }

    return sendTwilioWhatsAppMessage(params)
}