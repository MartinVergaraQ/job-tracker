'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_STATUSES = new Set([
    'saved',
    'applied',
    'interview',
    'rejected',
    'offer',
] as const)

const VALID_CV_VARIANTS = new Set([
    'backend-jr',
    'fullstack-jr',
    'frontend-react',
    'administrativo',
    'ventas-atencion',
    'general',
] as const)

type ApplicationStatus =
    | 'saved'
    | 'applied'
    | 'interview'
    | 'rejected'
    | 'offer'

type CvVariant =
    | 'backend-jr'
    | 'fullstack-jr'
    | 'frontend-react'
    | 'administrativo'
    | 'ventas-atencion'
    | 'general'

function isValidStatus(value: string): value is ApplicationStatus {
    return VALID_STATUSES.has(value as ApplicationStatus)
}

function isValidCvVariant(value: string): value is CvVariant {
    return VALID_CV_VARIANTS.has(value as CvVariant)
}

async function getExistingApplication(params: {
    jobId: string
    profileId: string
}) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('job_applications')
        .select('id, status, applied_at, follow_up_at, notes, cv_variant')
        .eq('job_id', params.jobId)
        .eq('profile_id', params.profileId)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    return data
}

function getDefaultFollowUpDate() {
    return new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
}

function revalidateTopMatchesPages() {
    revalidatePath('/admin/top-matches')
    revalidatePath('/admin/jobs')
    revalidatePath('/admin')
    revalidatePath('/admin/today')
}

export async function setJobApplicationStatus(formData: FormData) {
    const jobId = String(formData.get('job_id') ?? '').trim()
    const profileId = String(formData.get('profile_id') ?? '').trim()
    const status = String(formData.get('status') ?? '').trim()

    if (!jobId || !profileId || !isValidStatus(status)) {
        throw new Error('Invalid application payload')
    }

    const supabase = createAdminClient()
    const existing = await getExistingApplication({ jobId, profileId })
    const now = new Date().toISOString()

    const appliedAt =
        status === 'applied'
            ? existing?.applied_at ?? now
            : existing?.applied_at ?? null

    const followUpAt =
        status === 'applied'
            ? existing?.follow_up_at ?? getDefaultFollowUpDate()
            : existing?.follow_up_at ?? null

    if (!existing) {
        const { error } = await supabase.from('job_applications').insert({
            job_id: jobId,
            profile_id: profileId,
            status,
            applied_at: appliedAt,
            follow_up_at: followUpAt,
            notes: null,
            cv_variant: null,
            updated_at: now,
        })

        if (error) {
            throw new Error(error.message)
        }
    } else {
        const { error } = await supabase
            .from('job_applications')
            .update({
                status,
                applied_at: appliedAt,
                follow_up_at: followUpAt,
                updated_at: now,
            })
            .eq('id', existing.id)

        if (error) {
            throw new Error(error.message)
        }
    }

    revalidateTopMatchesPages()
}

export async function saveJobApplicationNotes(formData: FormData) {
    const jobId = String(formData.get('job_id') ?? '').trim()
    const profileId = String(formData.get('profile_id') ?? '').trim()
    const notes = String(formData.get('notes') ?? '').trim()

    if (!jobId || !profileId) {
        throw new Error('Invalid notes payload')
    }

    const supabase = createAdminClient()
    const existing = await getExistingApplication({ jobId, profileId })
    const now = new Date().toISOString()

    if (!existing) {
        const { error } = await supabase.from('job_applications').insert({
            job_id: jobId,
            profile_id: profileId,
            status: 'saved',
            applied_at: null,
            follow_up_at: null,
            notes: notes || null,
            cv_variant: null,
            updated_at: now,
        })

        if (error) {
            throw new Error(error.message)
        }
    } else {
        const { error } = await supabase
            .from('job_applications')
            .update({
                notes: notes || null,
                updated_at: now,
            })
            .eq('id', existing.id)

        if (error) {
            throw new Error(error.message)
        }
    }

    revalidateTopMatchesPages()
}

export async function saveJobApplicationCvVariant(formData: FormData) {
    const jobId = String(formData.get('job_id') ?? '').trim()
    const profileId = String(formData.get('profile_id') ?? '').trim()
    const cvVariant = String(formData.get('cv_variant') ?? '').trim()

    if (!jobId || !profileId) {
        throw new Error('Invalid CV variant payload')
    }

    if (cvVariant && !isValidCvVariant(cvVariant)) {
        throw new Error('Invalid CV variant')
    }

    const supabase = createAdminClient()
    const existing = await getExistingApplication({ jobId, profileId })
    const now = new Date().toISOString()

    if (!existing) {
        const { error } = await supabase.from('job_applications').insert({
            job_id: jobId,
            profile_id: profileId,
            status: 'saved',
            applied_at: null,
            follow_up_at: null,
            notes: null,
            cv_variant: cvVariant || null,
            updated_at: now,
        })

        if (error) {
            throw new Error(error.message)
        }
    } else {
        const { error } = await supabase
            .from('job_applications')
            .update({
                cv_variant: cvVariant || null,
                updated_at: now,
            })
            .eq('id', existing.id)

        if (error) {
            throw new Error(error.message)
        }
    }

    revalidateTopMatchesPages()
}