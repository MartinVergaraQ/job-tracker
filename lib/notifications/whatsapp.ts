import twilio from 'twilio'

type SendWhatsAppMessageParams = {
    to: string
    body: string
}

let client: ReturnType<typeof twilio> | null = null

function getTwilioClient() {
    if (client) return client

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN

    if (!accountSid || !authToken) {
        throw new Error('Missing Twilio configuration')
    }

    client = twilio(accountSid, authToken)

    return client
}

export async function sendWhatsAppMessage({
    to,
    body,
}: SendWhatsAppMessageParams) {
    const from = process.env.TWILIO_WHATSAPP_FROM

    if (!from) {
        throw new Error('Missing TWILIO_WHATSAPP_FROM')
    }

    const tx = getTwilioClient()

    return tx.messages.create({
        from,
        to,
        body,
    })
}