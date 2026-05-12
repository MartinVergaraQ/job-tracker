'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseMasterCv } from '@/lib/ai/parse-master-cv'

export type CvBaseActionState = {
    status: 'idle' | 'success' | 'error'
    message: string
    error?: string | null
    parsed?: {
        headline: string
        summary: string
        skillsCount: number
        experienceCount: number
        projectsCount: number
        educationCount: number
        languagesCount: number
    } | null
}

export type ActivateCvBaseActionState = {
    status: 'idle' | 'success' | 'error'
    message: string
    error?: string | null
}

const DEFAULT_PROFILE_ID = '7fab5bd9-502d-412d-b37e-bace8ed4487f'

function ensureArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
        return value as T[]
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? (parsed as T[]) : []
        } catch {
            return []
        }
    }

    return []
}

export async function importCvBaseAction(
    _prevState: CvBaseActionState,
    formData: FormData
): Promise<CvBaseActionState> {
    try {
        const rawText = String(formData.get('rawText') ?? '').trim()
        const profileId = String(
            formData.get('profileId') ?? DEFAULT_PROFILE_ID
        ).trim()

        if (!rawText) {
            return {
                status: 'error',
                message: 'Falta el contenido del CV.',
                error: 'Pega el CV completo antes de procesar.',
                parsed: null,
            }
        }

        if (rawText.length < 200) {
            return {
                status: 'error',
                message: 'El contenido es demasiado corto.',
                error: 'Pega un CV más completo para obtener mejores resultados.',
                parsed: null,
            }
        }

        const supabase = createAdminClient()
        const parsed = await parseMasterCv({ rawText })

        const normalizedSkills = ensureArray<string>(parsed.skills)
        const normalizedExperience = ensureArray<{
            company: string
            role: string
            start_date: string | null
            end_date: string | null
            stack: string[]
            bullets: string[]
        }>(parsed.experience)

        const normalizedProjects = ensureArray<{
            name: string
            description: string
            stack: string[]
            bullets: string[]
            status?: string | null
        }>(parsed.projects)

        const normalizedEducation = ensureArray<{
            institution: string
            degree: string
            start_date: string | null
            end_date: string | null
        }>(parsed.education)

        const normalizedLanguages = ensureArray<{
            name: string
            level: string
        }>(parsed.languages)

        const { error } = await supabase.from('cv_profiles').insert({
            profile_id: profileId,
            original_filename: null,
            raw_text: rawText,
            summary: parsed.summary,
            headline: parsed.headline,
            skills: normalizedSkills,
            experience: normalizedExperience,
            projects: normalizedProjects,
            education: normalizedEducation,
            languages: normalizedLanguages,
            parsed_by: 'rules_cv_base_import_preview',
            is_active: false,
        })

        if (error) {
            throw new Error(error.message)
        }

        revalidatePath('/admin/cv-base')
        revalidatePath('/admin')
        revalidatePath('/admin/top-matches')

        return {
            status: 'success',
            message: 'CV importado como borrador correctamente.',
            error: null,
            parsed: {
                headline: parsed.headline,
                summary: parsed.summary,
                skillsCount: normalizedSkills.length,
                experienceCount: normalizedExperience.length,
                projectsCount: normalizedProjects.length,
                educationCount: normalizedEducation.length,
                languagesCount: normalizedLanguages.length,
            },
        }
    } catch (error) {
        return {
            status: 'error',
            message: 'No pude importar el CV base.',
            error: error instanceof Error ? error.message : 'Error desconocido',
            parsed: null,
        }
    }
}

export async function activateCvBaseAction(
    _prevState: ActivateCvBaseActionState,
    formData: FormData
): Promise<ActivateCvBaseActionState> {
    try {
        const cvProfileId = String(formData.get('cvProfileId') ?? '').trim()
        const profileId = String(
            formData.get('profileId') ?? DEFAULT_PROFILE_ID
        ).trim()

        if (!cvProfileId) {
            return {
                status: 'error',
                message: 'Falta el ID del CV.',
                error: 'No pude identificar el CV a activar.',
            }
        }

        const supabase = createAdminClient()

        const { error: deactivateError } = await supabase
            .from('cv_profiles')
            .update({
                is_active: false,
            })
            .eq('profile_id', profileId)

        if (deactivateError) {
            throw new Error(deactivateError.message)
        }

        const { error: activateError } = await supabase
            .from('cv_profiles')
            .update({
                is_active: true,
            })
            .eq('id', cvProfileId)
            .eq('profile_id', profileId)

        if (activateError) {
            throw new Error(activateError.message)
        }

        revalidatePath('/admin/cv-base')
        revalidatePath('/admin')
        revalidatePath('/admin/top-matches')

        return {
            status: 'success',
            message: 'CV base activado correctamente.',
            error: null,
        }
    } catch (error) {
        return {
            status: 'error',
            message: 'No pude activar el CV base.',
            error: error instanceof Error ? error.message : 'Error desconocido',
        }
    }
}