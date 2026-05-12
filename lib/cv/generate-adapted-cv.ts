type GenerateAdaptedCvParams = {
  job: {
    title: string
    company: string
    location: string | null
    modality: string | null
    seniority: string | null
    description: string | null
    tech_tags: string[] | null
    url: string
  }
  profile: {
    name: string
    slug: string
  }
  cvProfile: {
    headline?: string | null
    summary?: string | null
    skills?: string[] | null
    experience?: unknown
    projects?: unknown
    education?: unknown
    languages?: unknown
  } | null
  applicationPack?: {
    fit_summary?: string | null
    ats_keywords?: string[] | null
    missing_keywords?: string[] | null
    cv_improvements?: string[] | null
  } | null
}

export type AdaptedCvResult = {
  title: string
  html: string
  contentJson: {
    candidate_name: string
    headline: string
    target_role: string
    target_company: string
    summary: string
    skills: string[]
    experience: unknown
    projects: unknown
    education: unknown
    languages: unknown
    ats_keywords: string[]
    missing_keywords: string[]
  }
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

function cleanJsonText(value: string) {
  return value
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function asStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback

  return value
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40)
}

function buildPrompt(params: GenerateAdaptedCvParams) {
  return [
    'Eres un experto en CV ATS para postulaciones tech en Chile.',
    '',
    'Debes adaptar el CV base del candidato a la oferta laboral indicada.',
    '',
    'REGLAS DE REDACCIÓN:',
    '- No uses frases genéricas como "calce medio", "perfil sólido" o "demuestra su capacidad" dentro del CV.',
    '- No incluyas una sección visible llamada "Keywords ATS priorizadas".',
    '- PHP debe aparecer solo como experiencia práctica/proyecto, no como especialidad principal del candidato.',
    '- El foco principal del candidato es Node.js, SQL, Supabase, React, Next.js, Angular y TypeScript.',
    '- El idioma inglés debe redactarse como "Lectura técnica básica", no como A2.',
    '- El CV debe sonar humano, directo y profesional, no como texto generado por IA.',
    '- Prioriza experiencia real, proyectos reales y tecnologías respaldadas.',
    '',
    'REGLAS CRÍTICAS:',
    '- No inventes experiencia, años, empresas, certificaciones, métricas ni tecnologías.',
    '- No digas que el candidato domina una tecnología si no aparece respaldada en cvProfile.skills, cvProfile.experience o cvProfile.projects.',
    '- Puedes reordenar, resumir y mejorar redacción, pero no crear hechos falsos.',
    '- Si una tecnología aparece en la oferta pero no está respaldada, ponla en missing_keywords.',
    '- El CV debe ser ATS friendly: claro, simple, sin tablas complejas, sin emojis.',
    '- El candidato se llama Martin Vergara.',
    '- No firmes ni nombres al candidato como profile.name.',
    '- Puedes usar "Job Tracker / Job Application Copilot" solo si aparece en cvProfile.projects.',
    '- Devuelve SOLO JSON válido. Sin markdown.',
    '- El CV final debe caber idealmente en 2 páginas.',
    '- Usa máximo 4 bullets para experiencia laboral.',
    '- Usa máximo 4 proyectos destacados.',
    '- Usa máximo 3 bullets por proyecto.',
    '- Prioriza proyectos relacionados con la oferta y elimina proyectos menos relevantes si sobra contenido.',
    '- No incluyas tecnologías no respaldadas como skills principales; si aparecen solo en la oferta, van a missing_keywords.',
    '',
    'REGLAS DE ESTILO DEL CV:',
    '- El CV debe sonar humano, directo y profesional, no como texto genérico de IA.',
    '- El perfil profesional debe tener máximo 3 oraciones.',
    '- La sección de habilidades debe priorizar solo tecnologías realmente fuertes o relevantes para la oferta.',
    '- No incluyas una sección visible llamada "Keywords ATS" o similar dentro del CV.',
    '- No agregues tecnologías no respaldadas solo porque aparezcan en la oferta.',
    '- No uses palabras como "experto", "especialista" o "dominio avanzado".',
    '- Los proyectos deben mostrarse con máximo 3 bullets por proyecto.',
    '- Cada bullet debe ser corto, concreto y orientado a impacto o funcionalidad real.',
    '- Prioriza proyectos reales en uso o con valor directo para el cargo.',
    '- Si la oferta menciona tecnologías fuera del foco principal del candidato, no las metas en skills; solo pueden quedar en missing_keywords.',
    '- El CV debe verse como una postulación real de perfil junior, no como un documento académico ni como una plantilla robótica.',
    '- El resumen profesional debe tener máximo 3 oraciones.',
    '- La sección de habilidades debe mostrarse compacta y enfocada en el stack principal.',
    '- Evita repetir tecnologías demasiadas veces entre resumen, skills y proyectos.',
    '',
    'Formato JSON exacto:',
    JSON.stringify(
      {
        candidate_name: 'Martin Vergara',
        headline: 'Desarrollador Full Stack Junior | Node.js, React, TypeScript, SQL',
        target_role: 'string',
        target_company: 'string',
        summary: 'string',
        skills: ['string'],
        experience: [
          {
            role: 'string',
            company: 'string',
            period: 'string',
            stack: ['string'],
            bullets: ['string']
          }
        ],
        projects: [
          {
            name: 'string',
            stack: ['string'],
            bullets: ['string']
          }
        ],
        education: [
          {
            degree: 'string',
            institution: 'string',
            period: 'string'
          }
        ],
        languages: [
          {
            name: 'string',
            level: 'string'
          }
        ],
        ats_keywords: ['string'],
        missing_keywords: ['string']
      },
      null,
      2
    ),
    '',
    'Datos oficiales:',
    JSON.stringify(params, null, 2),
  ].join('\n')
}
function takeCleanStrings(value: unknown, limit: number) {
  if (!Array.isArray(value)) return []

  return value
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function renderList(items: string[], limit = 4) {
  return items
    .slice(0, limit)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')
}

function renderExperience(value: unknown) {
  if (!Array.isArray(value)) return ''

  return value
    .slice(0, 3)
    .map((item) => {
      const role = String(item?.role ?? '').trim()
      const company = String(item?.company ?? '').trim()
      const period = String(item?.period ?? '').trim()
      const stack = Array.isArray(item?.stack) ? item.stack.map(String).slice(0, 8) : []
      const bullets = Array.isArray(item?.bullets) ? item.bullets.map(String).slice(0, 4) : []

      return `
              <article class="entry">
                <h3>${escapeHtml(role)}${company ? ` | ${escapeHtml(company)}` : ''}</h3>
                ${period ? `<p class="muted">${escapeHtml(period)}</p>` : ''}
                ${stack.length ? `<p class="stack"><strong>Stack:</strong> ${escapeHtml(stack.join(' · '))}</p>` : ''}
                ${bullets.length ? `<ul>${renderList(bullets)}</ul>` : ''}
              </article>
            `
    })
    .join('')
}

function renderProjects(value: unknown) {
  if (!Array.isArray(value)) return ''

  return value
    .slice(0, 4)
    .map((item) => {
      const name = String(item?.name ?? '').trim()
      const stack = Array.isArray(item?.stack) ? item.stack.map(String).slice(0, 8) : []
      const bullets = Array.isArray(item?.bullets) ? item.bullets.map(String).slice(0, 3) : []

      return `
              <article class="entry">
                <h3>${escapeHtml(name)}</h3>
                ${stack.length ? `<p class="stack"><strong>Stack:</strong> ${escapeHtml(stack.join(' · '))}</p>` : ''}
                ${bullets.length ? `<ul>${renderList(bullets)}</ul>` : ''}
              </article>
            `
    })
    .join('')
}

function renderEducation(value: unknown) {
  if (!Array.isArray(value)) return ''

  return value
    .slice(0, 2)
    .map((item) => {
      const degree = String(item?.degree ?? '').trim()
      const institution = String(item?.institution ?? '').trim()
      const period = String(item?.period ?? '').trim()
      const status = String(item?.status ?? '').trim()

      return `
        <article>
          <p>
            <strong>${escapeHtml(degree)}</strong>
            ${status ? ` (${escapeHtml(status)})` : ''}
            ${institution ? ` · ${escapeHtml(institution)}` : ''}
            ${period ? ` · ${escapeHtml(period)}` : ''}
          </p>
        </article>
      `
    })
    .join('')
}

function renderLanguages(value: unknown) {
  if (!Array.isArray(value)) return ''

  const items = value
    .slice(0, 2)
    .map((item) => {
      const name = String(item?.name ?? '').trim()
      const level = String(item?.level ?? '').trim()
      return `${name}: ${level}`
    })
    .filter(Boolean)

  return `<p>${escapeHtml(items.join(' · '))}</p>`
}

function buildHtml(content: AdaptedCvResult['contentJson']) {
  const skillsText = content.skills
    .slice(0, 14)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .join(' · ')

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(content.candidate_name)} - CV ATS</title>
<style>
  * {
    box-sizing: border-box;
  }

  body {
    font-family: Arial, sans-serif;
    color: #111827;
    line-height: 1.28;
    max-width: 820px;
    margin: 0 auto;
    padding: 0;
    font-size: 11.5px;
  }

  header {
    margin-bottom: 8px;
  }

  h1 {
    font-size: 22px;
    margin: 0 0 2px;
    line-height: 1.1;
  }

  h2 {
    font-size: 14px;
    margin: 11px 0 5px;
    border-bottom: 1px solid #d1d5db;
    padding-bottom: 2px;
    line-height: 1.15;
  }

  h3 {
    font-size: 12.5px;
    margin: 7px 0 2px;
    line-height: 1.15;
  }

  p {
    margin: 3px 0;
  }

  ul {
    margin: 3px 0 6px 16px;
    padding: 0;
  }

  li {
    margin-bottom: 2px;
  }

  article {
    margin-bottom: 5px;
  }

  .muted {
    color: #4b5563;
  }

  .compact-line {
    margin: 4px 0 6px;
  }

  .summary {
    text-align: justify;
  }

  @page {
    size: A4;
    margin: 12mm;
  }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(content.candidate_name)}</h1>
    <p class="headline">${escapeHtml(content.headline)}</p>
    <p class="muted">San Bernardo, Santiago, Chile | +56 9 2629 3006 | martinvergara452@gmail.com</p>
    <p class="muted">GitHub: github.com/MartinVergaraQ | LinkedIn: linkedin.com/in/martin-ignacio-vergara-quiroz-b8042a251</p>
  </header>

  <section>
    <h2>Perfil profesional</h2>
    <p>${escapeHtml(content.summary)}</p>
  </section>

<section>
  <h2>Habilidades técnicas</h2>
  <p class="compact-line">${escapeHtml(skillsText)}</p>
</section>

  <section>
    <h2>Experiencia</h2>
    ${renderExperience(content.experience)}
  </section>

  <section>
    <h2>Proyectos destacados</h2>
    ${renderProjects(content.projects)}
  </section>

  <section>
    <h2>Educación</h2>
    ${renderEducation(content.education)}
  </section>

  <section>
    <h2>Idiomas</h2>
    ${renderLanguages(content.languages)}
  </section>
</body>
</html>`
}

export async function generateAdaptedCv(
  params: GenerateAdaptedCvParams
): Promise<AdaptedCvResult> {
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
            parts: [{ text: prompt }],
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
    throw new Error(data.error?.message || `Gemini request failed with ${response.status}`)
  }

  const text = extractGeminiText(data)

  if (!text) {
    throw new Error('Gemini returned empty response')
  }

  const parsed = JSON.parse(cleanJsonText(text)) as Partial<AdaptedCvResult['contentJson']>

  const contentJson: AdaptedCvResult['contentJson'] = {
    candidate_name: 'Martin Vergara',
    headline:
      parsed.headline ||
      params.cvProfile?.headline ||
      'Desarrollador Full Stack Jr. | Foco Backend',
    target_role: params.job.title,
    target_company: params.job.company,
    summary: parsed.summary || params.cvProfile?.summary || '',
    skills: asStringArray(parsed.skills, params.cvProfile?.skills ?? []),
    experience: parsed.experience ?? params.cvProfile?.experience ?? {},
    projects: parsed.projects ?? params.cvProfile?.projects ?? {},
    education: parsed.education ?? params.cvProfile?.education ?? {},
    languages: parsed.languages ?? params.cvProfile?.languages ?? {},
    ats_keywords: asStringArray(parsed.ats_keywords, params.applicationPack?.ats_keywords ?? []),
    missing_keywords: asStringArray(parsed.missing_keywords, params.applicationPack?.missing_keywords ?? []),
  }

  return {
    title: `CV Martin Vergara - ${params.job.title}`,
    html: buildHtml(contentJson),
    contentJson,
  }
}