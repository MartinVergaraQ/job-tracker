'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

type ApplicationStatus = 'saved' | 'applied' | 'interview' | 'rejected' | 'offer'

function getRequiredString(formData: FormData, key: string) {
    const value = String(formData.get(key) ?? '').trim()

    if (!value) {
        throw new Error(`Missing ${key}`)
    }

    return value
}

function getOptionalString(formData: FormData, key: string) {
    const value = String(formData.get(key) ?? '').trim()
    return value.length > 0 ? value : null
}

function getStatus(value: string): ApplicationStatus {
    const allowed: ApplicationStatus[] = [
        'saved',
        'applied',
        'interview',
        'rejected',
        'offer',
    ]

    if (!allowed.includes(value as ApplicationStatus)) {
        throw new Error('Invalid application status')
    }

    return value as ApplicationStatus
}

function revalidateJobViews(jobId?: string, profileId?: string) {
    revalidatePath('/admin')
    revalidatePath('/admin/today')
    revalidatePath('/admin/conversion')
    revalidatePath('/admin/top-matches')

    if (jobId && profileId) {
        revalidatePath(`/admin/top-matches/${jobId}/${profileId}`)
    }
}

async function upsertApplication(params: {
    jobId: string
    profileId: string
    status?: ApplicationStatus
    cvVariant?: string | null
    notes?: string | null
    followUpAt?: string | null
    clearFollowUp?: boolean
}) {
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const payload: Record<string, unknown> = {
        job_id: params.jobId,
        profile_id: params.profileId,
        updated_at: now,
    }

    if (params.status) {
        payload.status = params.status

        if (params.status === 'applied') {
            payload.applied_at = now
        }
    }

    if ('cvVariant' in params) {
        payload.cv_variant = params.cvVariant
    }

    if ('notes' in params) {
        payload.notes = params.notes
    }

    if ('followUpAt' in params) {
        payload.follow_up_at = params.followUpAt
    }

    if (params.clearFollowUp) {
        payload.follow_up_at = null
    }

    const { error } = await supabase
        .from('job_applications')
        .upsert(payload, {
            onConflict: 'job_id,profile_id',
            ignoreDuplicates: false,
        })

    if (error) {
        throw new Error(error.message)
    }

    revalidateJobViews(params.jobId, params.profileId)
}

export async function setJobApplicationStatus(formData: FormData) {
    const jobId = getRequiredString(formData, 'job_id')
    const profileId = getRequiredString(formData, 'profile_id')
    const status = getStatus(getRequiredString(formData, 'status'))

    await upsertApplication({
        jobId,
        profileId,
        status,
    })
}

export async function updateApplicationCvVariant(formData: FormData) {
    const jobId = getRequiredString(formData, 'job_id')
    const profileId = getRequiredString(formData, 'profile_id')
    const cvVariant = getOptionalString(formData, 'cv_variant')

    await upsertApplication({
        jobId,
        profileId,
        cvVariant,
    })
}

export async function updateApplicationNotes(formData: FormData) {
    const jobId = getRequiredString(formData, 'job_id')
    const profileId = getRequiredString(formData, 'profile_id')
    const notes = getOptionalString(formData, 'notes')

    await upsertApplication({
        jobId,
        profileId,
        notes,
    })
}

export async function saveRecommendedApplicationKit(formData: FormData) {
    const jobId = getRequiredString(formData, 'job_id')
    const profileId = getRequiredString(formData, 'profile_id')
    const cvVariant = getOptionalString(formData, 'cv_variant')
    const notes = getOptionalString(formData, 'notes')

    await upsertApplication({
        jobId,
        profileId,
        status: 'saved',
        cvVariant,
        notes,
    })
}

export async function scheduleApplicationFollowUp(formData: FormData) {
    const jobId = getRequiredString(formData, 'job_id')
    const profileId = getRequiredString(formData, 'profile_id')
    const days = Number(formData.get('days') ?? 5)

    const safeDays = Number.isFinite(days) && days > 0 ? days : 5

    const followUpAt = new Date(
        Date.now() + safeDays * 24 * 60 * 60 * 1000
    ).toISOString()

    await upsertApplication({
        jobId,
        profileId,
        followUpAt,
    })
}

export async function clearApplicationFollowUp(formData: FormData) {
    const jobId = getRequiredString(formData, 'job_id')
    const profileId = getRequiredString(formData, 'profile_id')

    await upsertApplication({
        jobId,
        profileId,
        clearFollowUp: true,
    })
}