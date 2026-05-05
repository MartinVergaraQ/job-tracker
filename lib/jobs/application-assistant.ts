export type CvVariantValue =
    | 'backend-jr'
    | 'fullstack-jr'
    | 'frontend-react'
    | 'administrativo'
    | 'ventas-atencion'
    | 'general'

export type ApplicationAssistantJob = {
    title: string
    company: string | null
    location: string | null
    source_name: string | null
    description: string | null
    tech_tags: string[] | null
    modality?: string | null
    seniority?: string | null
    salary_text?: string | null
}

export type ApplicationAssistantProfile = {
    name: string
    slug: string
}

export const CV_VARIANTS: Array<{
    value: CvVariantValue
    label: string
    description: string
}> = [
        {
            value: 'backend-jr',
            label: 'Backend Jr',
            description: 'Node.js, TypeScript, SQL, APIs REST y backend.',
        },
        {
            value: 'fullstack-jr',
            label: 'Fullstack Jr',
            description: 'Backend + frontend React/Next.js.',
        },
        {
            value: 'frontend-react',
            label: 'Frontend React',
            description: 'React, Next.js, UI, componentes y experiencia web.',
        },
        {
            value: 'administrativo',
            label: 'Administrativo',
            description: 'Excel, gestión, soporte administrativo y orden operacional.',
        },
        {
            value: 'ventas-atencion',
            label: 'Ventas / Atención',
            description: 'Atención al cliente, ventas, soporte y comunicación.',
        },
        {
            value: 'general',
            label: 'General',
            description: 'CV base para postulaciones amplias.',
        },
    ]

function normalize(value: string | null | undefined) {
    return (value ?? '').toLowerCase()
}

function includesAny(text: string, words: string[]) {
    return words.some((word) => text.includes(word.toLowerCase()))
}

function getJobText(job: ApplicationAssistantJob) {
    return [
        job.title,
        job.company,
        job.location,
        job.source_name,
        job.description,
        ...(job.tech_tags ?? []),
        job.modality,
        job.seniority,
        job.salary_text,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

function getCvVariantLabel(value: CvVariantValue) {
    return CV_VARIANTS.find((item) => item.value === value)?.label ?? 'General'
}

export function recommendCvVariant(job: ApplicationAssistantJob): CvVariantValue {
    const text = getJobText(job)

    const backend = includesAny(text, [
        'backend',
        'back-end',
        'node',
        'node.js',
        'nestjs',
        'express',
        'api',
        'rest',
        'sql',
        'postgres',
        'mysql',
        'mongodb',
        'supabase',
        'typescript',
    ])

    const frontend = includesAny(text, [
        'frontend',
        'front-end',
        'react',
        'next',
        'next.js',
        'javascript',
        'typescript',
        'tailwind',
        'html',
        'css',
        'ui',
    ])

    const admin = includesAny(text, [
        'administrativo',
        'administrativa',
        'excel',
        'oficina',
        'documentación',
        'documentacion',
        'backoffice',
        'operaciones',
        'asistente',
    ])

    const sales = includesAny(text, [
        'ventas',
        'cliente',
        'atención',
        'atencion',
        'comercial',
        'call center',
        'soporte',
        'post venta',
        'postventa',
    ])

    if (backend && frontend) return 'fullstack-jr'
    if (backend) return 'backend-jr'
    if (frontend) return 'frontend-react'
    if (admin) return 'administrativo'
    if (sales) return 'ventas-atencion'

    return 'general'
}

export function detectAtsKeywords(job: ApplicationAssistantJob) {
    const text = getJobText(job)

    const keywords = [
        'Node.js',
        'TypeScript',
        'JavaScript',
        'React',
        'Next.js',
        'SQL',
        'PostgreSQL',
        'MySQL',
        'MongoDB',
        'APIs REST',
        'Git',
        'Supabase',
        'Laravel',
        'PHP',
        'Excel',
        'Atención al cliente',
        'Ventas',
        'Remoto',
        'Híbrido',
        'Junior',
        'Soporte',
    ]

    return keywords.filter((keyword) => text.includes(keyword.toLowerCase()))
}

export function buildApplicationAssistant(params: {
    job: ApplicationAssistantJob
    profile: ApplicationAssistantProfile
    score: number
    reasons: string[]
    currentCvVariant?: string | null
}) {
    const { job, profile, score, reasons, currentCvVariant } = params

    const recommendedCvVariant = recommendCvVariant(job)
    const recommendedCvLabel = getCvVariantLabel(recommendedCvVariant)
    const currentCvLabel = currentCvVariant
        ? getCvVariantLabel(currentCvVariant as CvVariantValue)
        : 'Sin definir'

    const atsKeywords = detectAtsKeywords(job)

    const fitLevel =
        score >= 85
            ? 'Muy buen match'
            : score >= 70
                ? 'Buen match'
                : score >= 60
                    ? 'Match aceptable'
                    : 'Match débil'

    const company = job.company ?? 'la empresa'
    const title = job.title
    const location = job.location ?? 'Sin ubicación informada'

    const checklist = [
        `Usar CV: ${recommendedCvLabel}.`,
        'Asegurar que el CV tenga un título claro alineado al cargo.',
        atsKeywords.length
            ? `Incluir keywords visibles: ${atsKeywords.slice(0, 8).join(', ')}.`
            : 'Agregar keywords relevantes del aviso antes de postular.',
        'Revisar que el resumen profesional tenga 2–3 líneas directas.',
        'Priorizar proyectos reales, tecnologías usadas y resultados concretos.',
        'Postular y guardar el estado como “Postulé”.',
        'Programar seguimiento en 5 a 7 días.',
    ]

    const recruiterMessage = [
        `Hola, mi nombre es Martin Vergara.`,
        `Vi la vacante de ${title} en ${company} y me interesa postular.`,
        `Tengo experiencia trabajando con desarrollo web, backend, bases de datos y proyectos reales usando tecnologías como Node.js, TypeScript, React, SQL y Supabase.`,
        `Me gustaría aportar en el equipo y quedo atento a la posibilidad de conversar.`,
        `Saludos.`,
    ].join('\n')

    const coverLetter = [
        `Hola equipo de ${company},`,
        ``,
        `Me interesa postular al cargo de ${title}. Mi perfil combina desarrollo web, backend, frontend y trabajo práctico en proyectos reales, con foco en construir soluciones funcionales, ordenadas y mantenibles.`,
        ``,
        `He trabajado con tecnologías como Node.js, TypeScript, React, SQL, Supabase y APIs REST, además de experiencia resolviendo problemas reales de integración, automatización y mejora de sistemas. Me motiva especialmente participar en equipos donde pueda seguir creciendo, aportar rápido y aprender con responsabilidad.`,
        ``,
        `Creo que esta oportunidad calza con mi búsqueda actual porque combina tecnología, aprendizaje y ejecución práctica. Quedo atento a una posible entrevista.`,
        ``,
        `Saludos,`,
        `Martin Vergara`,
    ].join('\n')

    const formAnswers = [
        {
            question: '¿Por qué te interesa este cargo?',
            answer: `Me interesa porque el cargo de ${title} se alinea con mi experiencia en desarrollo web, backend, APIs y bases de datos. Además, busco una oportunidad donde pueda aportar con proyectos reales y seguir creciendo profesionalmente.`,
        },
        {
            question: '¿Cuál es tu experiencia relevante?',
            answer: `Tengo experiencia construyendo proyectos con Node.js, TypeScript, React, SQL, Supabase y APIs REST. También he trabajado en integración de sistemas, lógica de negocio, dashboards y automatización de procesos.`,
        },
        {
            question: '¿Disponibilidad?',
            answer: `Tengo disponibilidad para conversar y avanzar en el proceso. Puedo adaptarme según la modalidad indicada por la empresa.`,
        },
        {
            question: 'Pretensión de renta',
            answer: `Estoy abierto a conversar según las responsabilidades del cargo, modalidad y beneficios ofrecidos.`,
        },
        {
            question: 'Modalidad preferida',
            answer: `Tengo preferencia por modalidad remota o híbrida, pero puedo evaluar según la oportunidad.`,
        },
    ]

    const followUpMessage = [
        `Hola, espero que estés bien.`,
        `Quería consultar si hubo algún avance respecto a mi postulación para el cargo de ${title}.`,
        `Sigo interesado en la oportunidad y quedo atento a cualquier información del proceso.`,
        `Saludos,`,
        `Martin Vergara`,
    ].join('\n')

    const warnings = []

    if (!job.description || job.description.trim().length < 80) {
        warnings.push('El aviso tiene poca descripción. Conviene abrir el link y revisar requisitos antes de postular.')
    }

    if (score < 70) {
        warnings.push('El score no es tan alto. Postula solo si el cargo realmente calza con tu objetivo.')
    }

    if (currentCvVariant && currentCvVariant !== recommendedCvVariant) {
        warnings.push(`El CV actual es “${currentCvLabel}”, pero el sistema recomienda “${recommendedCvLabel}”.`)
    }

    return {
        fitLevel,
        recommendedCvVariant,
        recommendedCvLabel,
        currentCvLabel,
        atsKeywords,
        checklist,
        recruiterMessage,
        coverLetter,
        formAnswers,
        followUpMessage,
        warnings,
        summary: {
            title,
            company,
            location,
            profile: profile.name,
            score,
            reasons: reasons.slice(0, 6),
        },
    }
}