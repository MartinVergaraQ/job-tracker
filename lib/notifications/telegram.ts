type SendTelegramMessageParams = {
    text: string
    chatId?: string
}

type TelegramApiResponse = {
    ok: boolean
    description?: string
    result?: unknown
}

export async function sendTelegramMessage({
    text,
    chatId,
}: SendTelegramMessageParams) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const defaultChatId = process.env.TELEGRAM_CHAT_ID
    const targetChatId = chatId ?? defaultChatId

    if (!token) {
        throw new Error('Missing TELEGRAM_BOT_TOKEN')
    }

    if (!targetChatId) {
        throw new Error('Missing TELEGRAM_CHAT_ID or explicit chatId')
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
            chat_id: targetChatId,
            text,
            disable_web_page_preview: true,
        }),
    })

    const data = (await response.json()) as TelegramApiResponse

    if (!response.ok || !data.ok) {
        throw new Error(data.description || 'Telegram sendMessage failed')
    }

    return data.result
}