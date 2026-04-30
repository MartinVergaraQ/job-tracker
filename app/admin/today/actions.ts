'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

function revalidateTodayPages() {
    revalidatePath('/admin/today')
    revalidatePath('/admin/top-matches')
    revalidatePath('/admin/jobs')
    revalidatePath('/admin')
}

function addDays(days: number) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

export async function scheduleFollowUp(formData: FormData) {
    const applicationId = String(formData.get('application_id') ?? '').trim()
    const days = Number(formData.get('days') ?? 5)

    if (!applicationId) {
        throw new Error('Missing application id')
    }

    const safeDays = Number.isFinite(days) && days > 0 ? days : 5

    const supabase = createAdminClient()

    const { error } = await supabase
        .from('job_applications')
        .update({
            follow_up_at: addDays(safeDays),
            updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId)

    if (error) {
        throw new Error(error.message)
    }

    revalidateTodayPages()
}

export async function clearFollowUp(formData: FormData) {
    const applicationId = String(formData.get('application_id') ?? '').trim()

    if (!applicationId) {
        throw new Error('Missing application id')
    }

    const supabase = createAdminClient()

    const { error } = await supabase
        .from('job_applications')
        .update({
            follow_up_at: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId)

    if (error) {
        throw new Error(error.message)
    }

    revalidateTodayPages()
}