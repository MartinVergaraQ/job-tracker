import { sendWhatsAppCloudMessage } from '@/lib/notifications/send-whatsapp-cloud-message'
import {
    shouldSendNotification,
    markNotificationSent,
} from '@/lib/notifications/job-match-notifications'

type NotifyJobMatchWhatsAppParams = {
    jobId: string
    profileId: string
    recipient: string
    score: number
    body: string
}

export async function notifyJobMatchWhatsApp({
    jobId,
    profileId,
    recipient,
    score,
    body,
}: NotifyJobMatchWhatsAppParams) {
    const decision = await shouldSendNotification({
        jobId,
        profileId,
        channel: 'whatsapp',
        recipient,
        currentScore: score,
    })

    if (!decision.shouldSend) {
        return {
            sent: false,
            reason: decision.reason,
            previousScore: decision.previousScore,
            currentScore: decision.currentScore,
        }
    }

    const result = await sendWhatsAppCloudMessage({
        to: decision.recipient,
        body,
    })

    await markNotificationSent({
        jobId,
        profileId,
        channel: 'whatsapp',
        recipient: decision.recipient,
        currentScore: score,
    })

    return {
        sent: true,
        reason: decision.reason,
        previousScore: decision.previousScore,
        currentScore: decision.currentScore,
        result,
    }
}