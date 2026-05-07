type SendWhatsAppCloudMessageParams = {
    to?: string
    body: string
}

type WhatsAppCloudResponse = {
    messaging_product?: string
    contacts?: Array<{
        input: string
        wa_id: string
    }>
    messages?: Array<{
        id: string
        message_status?: string
    }>
    error?: {
        message: string
        type: string
        code: number
        error_subcode?: number
        fbtrace_id?: string
    }
}

function getRequiredEnv(name: string) {
    const value = process.env[name]?.trim()

    if (!value) {
        throw new Error(`Missing ${name}`)
    }

    return value
}

function normalizeWhatsAppCloudTo(value: string) {
    return value
        .trim()
        .replace(/^whatsapp:/, '')
        .replace(/^\+/, '')
        .replace(/[^\d]/g, '')
}

export async function sendWhatsAppCloudMessage({
    to,
    body,
}: SendWhatsAppCloudMessageParams) {
    const token = getRequiredEnv('WHATSAPP_CLOUD_ACCESS_TOKEN')
    const phoneNumberId = getRequiredEnv('WHATSAPP_CLOUD_PHONE_NUMBER_ID')
    const defaultTo = getRequiredEnv('WHATSAPP_TO')

    const targetTo = normalizeWhatsAppCloudTo(to ?? defaultTo)
    const cleanBody = body.trim()

    if (!cleanBody) {
        throw new Error('WhatsApp body is empty')
    }

    const response = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: targetTo,
                type: 'text',
                text: {
                    preview_url: false,
                    body: cleanBody,
                },
            }),
        }
    )

    const data = (await response.json()) as WhatsAppCloudResponse

    if (!response.ok || data.error) {
        throw new Error(
            data.error
                ? `WhatsApp Cloud API failed: ${data.error.message}`
                : `WhatsApp Cloud API failed with status ${response.status}`
        )
    }

    const message = data.messages?.[0]

    return {
        id: message?.id ?? null,
        status: message?.message_status ?? 'accepted',
        to: targetTo,
        raw: data,
    }
}