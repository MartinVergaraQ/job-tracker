export type CvVariant =
    | 'backend-jr'
    | 'fullstack-jr'
    | 'frontend-react'
    | 'administrativo'
    | 'ventas-atencion'
    | 'general'

export const CV_VARIANTS: Array<{
    value: CvVariant
    label: string
    keywords: string[]
}> = [
        {
            value: 'backend-jr',
            label: 'Backend Jr',
            keywords: [
                'node',
                'node.js',
                'typescript',
                'javascript',
                'api',
                'apis',
                'rest',
                'sql',
                'postgresql',
                'mysql',
                'backend',
                'nest',
                'express',
                'supabase',
                'mongodb',
            ],
        },
        {
            value: 'fullstack-jr',
            label: 'Fullstack Jr',
            keywords: [
                'react',
                'next',
                'next.js',
                'node',
                'typescript',
                'javascript',
                'frontend',
                'backend',
                'fullstack',
                'sql',
                'api',
                'rest',
                'tailwind',
            ],
        },
        {
            value: 'frontend-react',
            label: 'Frontend React',
            keywords: [
                'react',
                'next',
                'next.js',
                'typescript',
                'javascript',
                'frontend',
                'html',
                'css',
                'tailwind',
                'ui',
                'ux',
            ],
        },
        {
            value: 'administrativo',
            label: 'Administrativo',
            keywords: [
                'administrativo',
                'excel',
                'gestión',
                'documentación',
                'atención',
                'coordinación',
                'reportes',
            ],
        },
        {
            value: 'ventas-atencion',
            label: 'Ventas / Atención',
            keywords: [
                'ventas',
                'atención',
                'cliente',
                'comercial',
                'postventa',
                'crm',
                'soporte',
            ],
        },
        {
            value: 'general',
            label: 'General',
            keywords: [],
        },
    ]

export function getCvVariantLabel(value: string | null | undefined) {
    const found = CV_VARIANTS.find((item) => item.value === value)
    return found?.label ?? 'Sin definir'
}

export function suggestCvVariant(params: {
    title: string | null
    description?: string | null
    reasons?: string[]
    profileSlug?: string | null
    company?: string | null
    sourceName?: string | null
}): CvVariant {
    const text = [
        params.title,
        params.description,
        params.profileSlug,
        params.company,
        params.sourceName,
        ...(params.reasons ?? []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

    const scored = CV_VARIANTS.map((variant) => {
        if (variant.value === 'general') {
            return {
                variant: variant.value,
                score: 0,
            }
        }

        const score = variant.keywords.reduce((total, keyword) => {
            return text.includes(keyword.toLowerCase()) ? total + 1 : total
        }, 0)

        return {
            variant: variant.value,
            score,
        }
    }).sort((a, b) => b.score - a.score)

    const best = scored[0]

    if (!best || best.score <= 0) {
        return 'general'
    }

    return best.variant
}