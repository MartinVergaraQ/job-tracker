import twilio from 'twilio'

type SendWhatsAppMessageParams = {
    to?: string
    body: string
}

function getRequiredEnv(name: string) {
    const value = process.env[name]?.trim()

    if (!value) {
        throw new Error(`Missing ${name}`)
    }

    return value
}

export async function sendWhatsAppMessage({
    to,
    body,
}: SendWhatsAppMessageParams) {
    const accountSid = getRequiredEnv('TWILIO_ACCOUNT_SID')
    const authToken = getRequiredEnv('TWILIO_AUTH_TOKEN')
    const from = getRequiredEnv('TWILIO_WHATSAPP_FROM')
    const defaultTo = getRequiredEnv('WHATSAPP_TO')

    const client = twilio(accountSid, authToken)

    const message = await client.messages.create({
        from,
        to: to ?? defaultTo,
        body,
    })

    return {
        sid: message.sid,
        status: message.status,
    }
}