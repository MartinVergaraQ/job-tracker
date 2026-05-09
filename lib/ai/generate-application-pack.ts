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
            parsed.recommended_cv_variant || 'backend_fullstack_jr_ai',
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
        '- No cambies "Empresa comercial de Lampa" por otro nombre.',
        '- No menciones proyectos que no aparezcan explícitamente en cvProfile.',
        '- No digas que el candidato tiene AWS, Java, Go, Python o Docker si no aparece respaldado en el CV/perfil.',
        '- Si una tecnología aparece en la oferta pero no está respaldada por el CV/perfil, ponla en missing_keywords.',
        '- Las mejoras del CV deben ser sugerencias, no afirmaciones falsas.',
        '- El mensaje recruiter debe ser breve, honesto y listo para copiar.',
        '- La carta debe ser formal, humana y sin exagerar.',
        '- Devuelve SOLO JSON válido. Sin markdown. Sin explicación.',
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
                    temperature: 0.1,
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

    return safeJsonParse(text)
}