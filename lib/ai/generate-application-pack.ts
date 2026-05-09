type GenerateApplicationPackParams = {
    job: {
        title: string
        company: string
        location: string | null
        modality: string | null
        seniority: string | null
        salary_text: string | null
        tech_tags: string[] | null
        description: string | null
        url: string
    }
    profile: {
        name: string
        slug: string
    }
    cvProfile: {
        headline: string
        summary: string
        skills: string[] | null
        experience: unknown
        projects: unknown
        education: unknown
        languages: unknown
    } | null
    score: number
    reasons: string[] | null
}

export type GeneratedApplicationPack = {
    recommended_cv_variant: string
    fit_summary: string
    ats_keywords: string[]
    missing_keywords: string[]
    cv_improvements: string[]
    recruiter_message: string
    cover_letter: string
    checklist: Array<{
        label: string
        done: boolean
    }>
}

type GeminiResponse = {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string
            }>
        }
    }>
    error?: {
        message?: string
        code?: number
        status?: string
    }
}

function getRequiredEnv(name: string) {
    const value = process.env[name]?.trim()

    if (!value) {
        throw new Error(`Missing ${name}`)
    }

    return value
}

function extractGeminiText(data: GeminiResponse) {
    return (
        data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text)
            .filter(Boolean)
            .join('\n') ?? ''
    )
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
}

function safeJsonParse(value: string): GeneratedApplicationPack {
    const cleaned = value
        .trim()
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '')
        .trim()

    const parsed = JSON.parse(cleaned) as Partial<GeneratedApplicationPack>

    return {
        recommended_cv_variant:
            parsed.recommended_cv_variant || 'martin_backend_jr',
        fit_summary: parsed.fit_summary || '',
        ats_keywords: Array.isArray(parsed.ats_keywords)
            ? parsed.ats_keywords.map(String).slice(0, 25)
            : [],
        missing_keywords: Array.isArray(parsed.missing_keywords)
            ? parsed.missing_keywords.map(String).slice(0, 15)
            : [],
        cv_improvements: Array.isArray(parsed.cv_improvements)
            ? parsed.cv_improvements.map(String).slice(0, 10)
            : [],
        recruiter_message: parsed.recruiter_message || '',
        cover_letter: parsed.cover_letter || '',
        checklist: Array.isArray(parsed.checklist)
            ? parsed.checklist.slice(0, 8).map((item) => ({
                label: String(item?.label ?? ''),
                done: Boolean(item?.done ?? false),
            }))
            : [],
    }
}

function cleanForbiddenPhrases(value: string) {
    let output = value

    const forbiddenPhrases = [
        'Job Tracker Copilot',
        'Imega Ventus',
        'Adjunto mi CV',
        'adjunto mi CV',
        'Adjunto mi curriculum',
        'adjunto mi curriculum',
        'Adjunto mi currículum',
        'adjunto mi currículum',
        'Anexo mi CV',
        'anexo mi CV',
    ]

    for (const phrase of forbiddenPhrases) {
        output = output.split(phrase).join('')
    }

    return output
        .replace(/\s{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s+\./g, '.')
        .replace(/\s+,/g, ',')
        .trim()
}

function removeUnsupportedTechClaims(params: {
    value: string
    supportedSkills: string[]
    jobTags: string[]
}) {
    let output = params.value

    const unsupportedTechs = ['AWS', 'Java', 'Go', 'Python', 'Docker']

    for (const tech of unsupportedTechs) {
        const normalizedTech = normalizeText(tech)

        const isSupported = params.supportedSkills.some(
            (skill) => normalizeText(skill) === normalizedTech
        )

        if (!isSupported) {
            const regex = new RegExp(`\\b${tech}\\b`, 'gi')
            output = output.replace(regex, '')
        }
    }

    return output
        .replace(/,\s*,/g, ',')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+,/g, ',')
        .trim()
}

function getSupportedSkills(params: GenerateApplicationPackParams) {
    return [
        ...(params.cvProfile?.skills ?? []),
        ...(params.job.tech_tags ?? []),
    ].map(String)
}

function sanitizeGeneratedPack(params: {
    pack: GeneratedApplicationPack
    source: GenerateApplicationPackParams
}): GeneratedApplicationPack {
    const { pack, source } = params

    const supportedSkills = getSupportedSkills(source)
    const jobTags = source.job.tech_tags ?? []

    function clean(value: string) {
        return removeUnsupportedTechClaims({
            value: cleanForbiddenPhrases(value),
            supportedSkills,
            jobTags,
        })
            .replace(/como\s+['"`“”‘’]{2}/gi, '')
            .replace(/como\s+['"`“”‘’]\s*['"`“”‘’]/gi, '')
            .replace(/iniciativas como\s*\./gi, 'proyectos relevantes.')
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+\./g, '.')
            .trim()
    }

    const recruiterMessage = clean(pack.recruiter_message)
        .replace(/para su revisión y quedo atento a sus comentarios\.?/i, 'y quedo atento para conversar.')
        .replace(/quedo atento a sus comentarios\.?/i, 'quedo atento para conversar.')
        .trim()

    const safeRecruiterMessage = [
        'Estimados/as,',
        '',
        `Me interesa postular a la posición de ${source.job.title} en ${source.job.company}.`,
        '',
        'Mi perfil se alinea con la oferta, especialmente por mi experiencia con Node.js, React, Next.js, TypeScript, SQL y PostgreSQL.',
        '',
        'Quedo atento para conversar.',
        '',
        'Saludos,',
        'Martin Vergara',
    ].join('\n')

    const cleanedFitSummary = clean(pack.fit_summary)

    const safeFitSummary =
        cleanedFitSummary.length > 30
            ? cleanedFitSummary
            : [
                `El perfil de Martin calza razonablemente con la oferta de ${source.job.title} en ${source.job.company}.`,
                'La coincidencia principal está en el rol Full Stack Junior y en tecnologías como React, Next.js, Angular, TypeScript, Node.js, SQL y PostgreSQL.',
                'Conviene postular si la oferta no exige experiencia avanzada en tecnologías que no están respaldadas por el CV.',
            ].join(' ')

    return {
        recommended_cv_variant:
            pack.recommended_cv_variant || source.profile.slug || 'martin_backend_jr',
        fit_summary: safeFitSummary,
        ats_keywords: pack.ats_keywords
            .map((keyword) => clean(keyword))
            .filter(Boolean)
            .slice(0, 25),
        missing_keywords: pack.missing_keywords
            .map((keyword) => clean(keyword))
            .filter(Boolean)
            .slice(0, 15),
        cv_improvements: pack.cv_improvements
            .map((item) => clean(item))
            .filter((item) => item.length > 0)
            .filter((item) => !item.includes("''"))
            .slice(0, 10),
        recruiter_message: safeRecruiterMessage,
        cover_letter: clean(pack.cover_letter),
        checklist: pack.checklist
            .map((item) => ({
                label: clean(item.label),
                done: Boolean(item.done),
            }))
            .filter((item) => item.label.length > 0)
            .slice(0, 8),
    }
}

function buildPrompt(params: GenerateApplicationPackParams) {
    return [
        'Eres un asistente experto en postulaciones laborales ATS para Chile.',
        '',
        'Genera un pack de postulación personalizado para el candidato.',
        '',
        'REGLAS CRÍTICAS:',
        '- No inventes empresas, cargos, proyectos, experiencia, años, clientes ni tecnologías.',
        '- Usa EXACTAMENTE el nombre de empresa recibido en job.company.',
        '- Usa EXACTAMENTE el cargo recibido en job.title.',
        '- No cambies el nombre de la empresa por otro nombre.',
        '- No menciones proyectos que no aparezcan explícitamente en cvProfile.',
        '- El proyecto "Job Tracker Copilot" NO debe mencionarse a menos que aparezca explícitamente en cvProfile.',
        '- No digas que el candidato tiene AWS, Java, Go, Python o Docker si no aparece respaldado en cvProfile.skills.',
        '- Si una tecnología aparece en la oferta pero no está respaldada por el CV/perfil, ponla en missing_keywords.',
        '- Las mejoras del CV deben ser sugerencias, no afirmaciones falsas.',
        '- No uses frases como "Adjunto mi CV", porque el sistema todavía no adjunta archivos automáticamente.',
        '- Para el mensaje recruiter usa una frase neutral como "Quedo atento para conversar".',
        '- El mensaje recruiter debe ser breve, honesto y listo para copiar.',
        '- La carta debe ser formal, humana y sin exagerar.',
        '- Devuelve SOLO JSON válido. Sin markdown. Sin explicación.',
        '- Si la oferta está centrada en Java, Spring Boot, Go, .NET, C#, AWS o DevOps y el CV no respalda esas tecnologías, NO digas que es buen ajuste.',
        '- Si faltan tecnologías principales de la oferta, el fit_summary debe decir "calce medio" o "calce bajo", no "buen ajuste".',
        '- El recruiter_message nunca debe firmar como profile.name. Debe firmar como "Martin Vergara".',
        '- No uses "Martin Backend / Full Stack Jr" como nombre del candidato.',
        '- Si sugieres proyectos, menciona solo proyectos existentes en cvProfile.projects. Si no puedes identificar nombres concretos, di "proyectos reales de desarrollo web" sin inventar nombres.',
        '',
        'Formato JSON exacto:',
        JSON.stringify(
            {
                recommended_cv_variant: 'string',
                fit_summary: 'string',
                ats_keywords: ['string'],
                missing_keywords: ['string'],
                cv_improvements: ['string'],
                recruiter_message: 'string',
                cover_letter: 'string',
                checklist: [{ label: 'string', done: false }],
            },
            null,
            2
        ),
        '',
        'Datos oficiales. No inventes nada fuera de estos datos:',
        JSON.stringify(params, null, 2),
    ].join('\n')
}

export async function generateApplicationPackWithAI(
    params: GenerateApplicationPackParams
): Promise<GeneratedApplicationPack> {
    const provider = process.env.AI_PROVIDER?.trim() || 'gemini'

    if (provider !== 'gemini') {
        throw new Error(`Unsupported AI_PROVIDER: ${provider}`)
    }

    const apiKey = getRequiredEnv('GEMINI_API_KEY')
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
    const prompt = buildPrompt(params)

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: prompt,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0,
                    responseMimeType: 'application/json',
                },
            }),
        }
    )

    const data = (await response.json()) as GeminiResponse

    if (!response.ok || data.error) {
        throw new Error(
            data.error?.message || `Gemini request failed with ${response.status}`
        )
    }

    const text = extractGeminiText(data)

    if (!text) {
        throw new Error('Gemini returned empty response')
    }

    const pack = safeJsonParse(text)

    return sanitizeGeneratedPack({
        pack,
        source: params,
    })
}