import { createAdminClient } from '@/lib/supabase/admin'
import { CvBaseList } from './cv-base-list'

type Props = {
    profileId: string
}

function formatStableDate(value: string) {
    const date = new Date(value)

    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const minutes = String(date.getUTCMinutes()).padStart(2, '0')

    return `${day}-${month}-${year} ${hours}:${minutes} UTC`
}

export async function CvBaseListSection({ profileId }: Props) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('cv_profiles')
        .select(`
      id,
      headline,
      summary,
      parsed_by,
      is_active,
      created_at,
      skills,
      experience,
      projects,
      education,
      languages
    `)
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        throw new Error(error.message)
    }

    const items = (data ?? []).map((item) => ({
        id: item.id,
        headline: item.headline ?? '',
        summary: item.summary ?? '',
        parsed_by: item.parsed_by ?? '',
        is_active: Boolean(item.is_active),
        created_at: item.created_at,
        created_at_label: formatStableDate(item.created_at),
        skills: Array.isArray(item.skills) ? item.skills : [],
        experience: Array.isArray(item.experience) ? item.experience : [],
        projects: Array.isArray(item.projects) ? item.projects : [],
        education: Array.isArray(item.education) ? item.education : [],
        languages: Array.isArray(item.languages) ? item.languages : [],
    }))

    return <CvBaseList profileId={profileId} items={items} />
}