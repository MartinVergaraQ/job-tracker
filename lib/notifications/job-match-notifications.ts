import { createAdminClient } from '@/lib/supabase/admin'

export type NotificationChannel = 'telegram' | 'email' | 'whatsapp'

type NotificationState = {
    id: string
    job_id: string
    profile_id: string
    channel: NotificationChannel
    recipient: string
    last_sent_score: number
    send_count: number
}

const rawResendScoreDelta = Number(
    process.env.NOTIFICATION_RESEND_SCORE_DELTA ?? 10
)

const RESEND_SCORE_DELTA =
    Number.isFinite(rawResendScoreDelta) && rawResendScoreDelta > 0
        ? rawResendScoreDelta
        : 10

export function normalizeNotificationRecipient(
    value: string,
    channel: NotificationChannel
) {
    const recipient = value.trim()

    if (channel === 'email') {
        return recipient.toLowerCase()
    }

    if (channel === 'whatsapp') {
        const clean = recipient.replace(/\s+/g, '')

        if (clean.startsWith('whatsapp:')) {
            return clean
        }

        return `whatsapp:${clean}`
    }

    return recipient
}

export async function shouldSendNotification(params: {
    jobId: string
    profileId: string
    channel: NotificationChannel
    recipient: string
    currentScore: number
}) {
    const supabase = createAdminClient()
    const recipient = normalizeNotificationRecipient(
        params.recipient,
        params.channel
    )
    const currentScore = Math.round(params.currentScore)

    const { data, error } = await supabase
        .from('job_match_notifications')
        .select(`
      id,
      job_id,
      profile_id,
      channel,
      recipient,
      last_sent_score,
      send_count
    `)
        .eq('job_id', params.jobId)
        .eq('profile_id', params.profileId)
        .eq('channel', params.channel)
        .eq('recipient', recipient)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    const existing = data as NotificationState | null

    if (!existing) {
        return {
            shouldSend: true,
            reason: 'new_match' as const,
            previousScore: null,
            currentScore,
            recipient,
        }
    }

    if (currentScore >= existing.last_sent_score + RESEND_SCORE_DELTA) {
        return {
            shouldSend: true,
            reason: 'score_improved' as const,
            previousScore: existing.last_sent_score,
            currentScore,
            recipient,
        }
    }

    return {
        shouldSend: false,
        reason: 'already_sent' as const,
        previousScore: existing.last_sent_score,
        currentScore,
        recipient,
    }
}

export async function markNotificationSent(params: {
    jobId: string
    profileId: string
    channel: NotificationChannel
    recipient: string
    currentScore: number
}) {
    const supabase = createAdminClient()
    const recipient = normalizeNotificationRecipient(
        params.recipient,
        params.channel
    )
    const now = new Date().toISOString()
    const currentScore = Math.round(params.currentScore)

    const { data: existing, error: existingError } = await supabase
        .from('job_match_notifications')
        .select('id, send_count')
        .eq('job_id', params.jobId)
        .eq('profile_id', params.profileId)
        .eq('channel', params.channel)
        .eq('recipient', recipient)
        .maybeSingle()

    if (existingError) {
        throw new Error(existingError.message)
    }

    if (!existing) {
        const { error: insertError } = await supabase
            .from('job_match_notifications')
            .insert({
                job_id: params.jobId,
                profile_id: params.profileId,
                channel: params.channel,
                recipient,
                last_sent_score: currentScore,
                send_count: 1,
                first_sent_at: now,
                last_sent_at: now,
                updated_at: now,
            })

        if (insertError) {
            throw new Error(insertError.message)
        }

        return
    }

    const { error: updateError } = await supabase
        .from('job_match_notifications')
        .update({
            last_sent_score: currentScore,
            send_count: Number(existing.send_count ?? 0) + 1,
            last_sent_at: now,
            updated_at: now,
        })
        .eq('id', existing.id)

    if (updateError) {
        throw new Error(updateError.message)
    }
}