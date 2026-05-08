import { after, NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/notifications/send-whatsapp-message'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

type PipelineResponse = {
    ok: boolean
    duration_ms?: number
    collect?: {
        ok: boolean
        result?: {
            jobs_found: number
            jobs_processed: number
            matches_created: number
            sources?: Array<{
                source_name: string
                ok: boolean
                jobs_found: number
                skipped?: boolean
                error?: string
            }>
        }
        error?: string
    }
    enrich?: {
        ok: boolean
        result?: {
            scanned?: number
            enriched?: number
        }
        error?: string
    } | null
    rescore?: {
        ok: boolean
        result?: {
            scanned?: number
            rescored?: number
            matches_upserted?: number
        }
        error?: string
    } | null
    notify?: {
        ok: boolean
        scanned?: number
        selected?: number
        sent?: number
        sessionId?: string
        message?: string
        failures?: unknown[]
        skipped?: unknown[]
    } | null
    internal_statuses?: {
        enrich?: number
        rescore?: number
        notify?: number
    }
    error?: string
}

type WhatsAppWebhookPayload = {
    object?: string
    entry?: Array<{
        id?: string
        changes?: Array<{
            field?: string
            value?: {
                messaging_product?: string
                metadata?: {
                    display_phone_number?: string
                    phone_number_id?: string
                }
                contacts?: Array<{
                    profile?: {
                        name?: string
                    }
                    wa_id?: string
                }>
                messages?: Array<{
                    from?: string
                    id?: string
                    timestamp?: string
                    type?: string
                    text?: {
                        body?: string
                    }
                }>
                statuses?: unknown[]
            }
        }>
    }>
}
type MatchCommand = {
    action:
    | 'match'
    | 'preparar'
    | 'pack'
    | 'mensaje'
    | 'cv'
    | 'carta'
    | 'confirmar'
    | 'descartar'
    | 'aplicado'
    itemNumber: number
}

type PackCommandMode = 'pack' | 'mensaje' | 'cv' | 'carta'

function isPackCommandMode(action: MatchCommand['action']): action is PackCommandMode {
    return (
        action === 'pack' ||
        action === 'mensaje' ||
        action === 'cv' ||
        action === 'carta'
    )
}

type SessionItemRow = {
    id: string
    session_id: string
    item_number: number
    match_id: string
    job_id: string
    profile_id: string
    job_matches: {
        id: string
        score: number
        reasons: string[] | null
    } | null
    jobs: {
        id: string
        title: string
        company: string
        location: string | null
        modality: string | null
        seniority: string | null
        salary_text: string | null
        tech_tags: string[] | null
        url: string
        description: string | null
        source_name: string
    } | null
    search_profiles: {
        id: string
        name: string
        slug: string
    } | null
}
type ApplicationPackRow = {
    id: string
    job_id: string
    profile_id: string
    recommended_cv_variant: string
    fit_summary: string
    ats_keywords: string[] | null
    missing_keywords: string[] | null
    cv_improvements: string[] | null
    cover_letter: string
    recruiter_message: string
    form_answers: unknown
    checklist: unknown
    generated_by: string
    created_at: string
    updated_at: string
}

function parseMatchCommand(command: string): MatchCommand | null {
    const match = command.match(
        /^(match|preparar|pack|mensaje|cv|carta|confirmar|descartar|aplicado)\s+(\d+)$/
    )

    if (!match) return null

    const action = match[1] as MatchCommand['action']
    const itemNumber = Number(match[2])

    if (!Number.isInteger(itemNumber) || itemNumber <= 0) {
        return null
    }

    return {
        action,
        itemNumber,
    }
}

function normalizeReasons(reasons: string[] | null | undefined) {
    if (!reasons || reasons.length === 0) {
        return ['Buen calce general con tu perfil.']
    }

    return reasons.slice(0, 6)
}

function formatTags(tags: string[] | null | undefined) {
    if (!tags || tags.length === 0) return 'Sin tags'
    return tags.slice(0, 12).join(', ')
}

function buildMatchDetailMessage(row: SessionItemRow) {
    const job = row.jobs
    const match = row.job_matches
    const profile = row.search_profiles

    if (!job || !match || !profile) {
        return '❌ No pude cargar el detalle de este match.'
    }

    const reasons = normalizeReasons(match.reasons)

    return [
        `🎯 Match ${row.item_number}`,
        '',
        `Cargo: ${job.title}`,
        `Empresa: ${job.company}`,
        `Perfil: ${profile.name}`,
        `Score: ${Math.round(match.score)}`,
        `Ubicación: ${job.location ?? 'No indicada'}`,
        `Modalidad: ${job.modality ?? 'No indicada'}`,
        `Senioridad: ${job.seniority ?? 'No indicada'}`,
        job.salary_text ? `Sueldo: ${job.salary_text}` : null,
        '',
        `Tags: ${formatTags(job.tech_tags)}`,
        '',
        'Por qué calza:',
        ...reasons.map((reason) => `- ${reason}`),
        '',
        'Link:',
        job.url,
        '',
        'Puedes responder:',
        `preparar ${row.item_number}`,
        `descartar ${row.item_number}`,
        `aplicado ${row.item_number}`,
    ]
        .filter(Boolean)
        .join('\n')
}

async function getSessionItemByNumber(params: {
    recipient: string
    itemNumber: number
}) {
    const supabase = createAdminClient()

    const { data: session, error: sessionError } = await supabase
        .from('whatsapp_match_sessions')
        .select('id')
        .eq('recipient', params.recipient)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (sessionError) {
        throw new Error(sessionError.message)
    }

    if (!session) {
        return {
            ok: false as const,
            reason: 'no_active_session' as const,
            item: null,
        }
    }

    const { data: item, error: itemError } = await supabase
        .from('whatsapp_match_session_items')
        .select(`
            id,
            session_id,
            item_number,
            match_id,
            job_id,
            profile_id,
            job_matches (
                id,
                score,
                reasons
            ),
            jobs (
                id,
                title,
                company,
                location,
                modality,
                seniority,
                salary_text,
                tech_tags,
                url,
                description,
                source_name
            ),
            search_profiles (
                id,
                name,
                slug
            )
        `)
        .eq('session_id', session.id)
        .eq('item_number', params.itemNumber)
        .maybeSingle()

    if (itemError) {
        throw new Error(itemError.message)
    }

    if (!item) {
        return {
            ok: false as const,
            reason: 'item_not_found' as const,
            item: null,
        }
    }

    return {
        ok: true as const,
        reason: null,
        item: item as unknown as SessionItemRow,
    }
}

async function handleMatchDetailCommand(params: {
    recipient: string
    itemNumber: number
}) {
    const result = await getSessionItemByNumber({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!result.ok) {
        if (result.reason === 'no_active_session') {
            return [
                'No tienes una sesión activa de matches.',
                '',
                'Primero responde:',
                'run',
            ].join('\n')
        }

        return [
            `No encontré el match ${params.itemNumber}.`,
            '',
            'Responde:',
            'matches',
            'o vuelve a correr:',
            'run',
        ].join('\n')
    }

    return buildMatchDetailMessage(result.item)
}
async function handleDismissCommand(params: {
    recipient: string
    itemNumber: number
}) {
    const result = await getSessionItemByNumber({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!result.ok) {
        if (result.reason === 'no_active_session') {
            return [
                'No tienes una sesión activa de matches.',
                '',
                'Primero responde:',
                'run',
            ].join('\n')
        }

        return `No encontré el match ${params.itemNumber}.`
    }

    const item = result.item
    const job = item.jobs

    const supabase = createAdminClient()

    const { error } = await supabase
        .from('job_matches')
        .update({
            dismissed: true,
        })
        .eq('id', item.match_id)

    if (error) {
        throw new Error(error.message)
    }

    return [
        `🗑️ Match ${params.itemNumber} descartado.`,
        '',
        job ? `${job.title} - ${job.company}` : null,
        '',
        'Puedes revisar otro:',
        'match 2',
        'preparar 2',
        'o correr:',
        'run',
    ]
        .filter(Boolean)
        .join('\n')
}

async function handleAppliedCommand(params: {
    recipient: string
    itemNumber: number
}) {
    const result = await getSessionItemByNumber({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!result.ok) {
        if (result.reason === 'no_active_session') {
            return [
                'No tienes una sesión activa de matches.',
                '',
                'Primero responde:',
                'run',
            ].join('\n')
        }

        return `No encontré el match ${params.itemNumber}.`
    }

    const item = result.item
    const job = item.jobs
    const profile = item.search_profiles
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { error: applicationError } = await supabase
        .from('job_applications')
        .upsert(
            {
                job_id: item.job_id,
                profile_id: item.profile_id,
                status: 'applied',
                applied_at: now,
                notes: 'Marcado como postulado desde WhatsApp.',
                source_notes: 'whatsapp_command:aplicado',
                updated_at: now,
            },
            {
                onConflict: 'job_id,profile_id',
            }
        )

    if (applicationError) {
        throw new Error(applicationError.message)
    }

    const { error: matchError } = await supabase
        .from('job_matches')
        .update({
            saved: true,
        })
        .eq('id', item.match_id)

    if (matchError) {
        throw new Error(matchError.message)
    }

    return [
        `✅ Match ${params.itemNumber} marcado como postulado.`,
        '',
        job ? `Cargo: ${job.title}` : null,
        job ? `Empresa: ${job.company}` : null,
        profile ? `Perfil: ${profile.name}` : null,
        '',
        'Estado guardado en job_applications:',
        'applied',
    ]
        .filter(Boolean)
        .join('\n')
}
function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(
        new Set(
            values
                .filter(Boolean)
                .map((value) => String(value).trim())
                .filter(Boolean)
        )
    )
}

function buildAtsKeywords(item: SessionItemRow) {
    const job = item.jobs
    const match = item.job_matches

    return uniqueStrings([
        ...(job?.tech_tags ?? []),
        ...(match?.reasons ?? [])
            .filter((reason) => reason.toLowerCase().includes('coincide con'))
            .map((reason) => reason.replace(/coincide con/i, '').replace(/"/g, '').trim()),
        job?.modality,
        job?.seniority,
    ]).slice(0, 20)
}

function buildFitSummary(item: SessionItemRow) {
    const job = item.jobs
    const match = item.job_matches
    const profile = item.search_profiles

    if (!job || !match || !profile) {
        return 'Oferta compatible con el perfil seleccionado.'
    }

    const reasons = normalizeReasons(match.reasons)

    return [
        `La oferta "${job.title}" en ${job.company} calza con el perfil "${profile.name}" por su orientación técnica y tecnologías detectadas.`,
        '',
        `Score: ${Math.round(match.score)}.`,
        '',
        'Señales principales:',
        ...reasons.slice(0, 5).map((reason) => `- ${reason}`),
    ].join('\n')
}

function buildCvImprovements(item: SessionItemRow) {
    const job = item.jobs
    const tags = job?.tech_tags ?? []

    const improvements = [
        'Ajustar el resumen profesional para destacar experiencia en desarrollo web full stack/backend.',
        'Agregar logros concretos con tecnologías relacionadas al cargo.',
        'Ordenar el stack técnico por relevancia para esta oferta.',
    ]

    if (tags.includes('node') || tags.includes('node.js')) {
        improvements.push('Destacar experiencia creando APIs REST con Node.js.')
    }

    if (tags.includes('typescript')) {
        improvements.push('Mencionar TypeScript en proyectos recientes y responsabilidades.')
    }

    if (tags.includes('sql') || tags.includes('postgresql')) {
        improvements.push('Destacar experiencia con SQL/PostgreSQL y modelado de datos.')
    }

    if (tags.includes('react') || tags.includes('next.js')) {
        improvements.push('Resaltar experiencia en React/Next.js y componentes reutilizables.')
    }

    return improvements.slice(0, 8)
}

function buildRecruiterMessage(item: SessionItemRow) {
    const job = item.jobs

    if (!job) {
        return ''
    }

    return [
        `Hola, vi la oferta de ${job.title} en ${job.company} y me interesa postular.`,
        '',
        'Tengo experiencia desarrollando soluciones web, APIs y sistemas con tecnologías como Node.js, TypeScript, React/Next.js y bases de datos SQL.',
        '',
        'Me gustaría conversar para contarles cómo mi perfil puede aportar al equipo.',
        '',
        'Saludos,',
        'Martin Vergara',
    ].join('\n')
}

function buildCoverLetter(item: SessionItemRow) {
    const job = item.jobs

    if (!job) {
        return ''
    }

    return [
        `Estimado equipo de ${job.company}:`,
        '',
        `Me interesa postular al cargo de ${job.title}. Mi perfil está orientado al desarrollo de aplicaciones web, backend, APIs y soluciones full stack, con foco en construir sistemas funcionales, mantenibles y alineados a las necesidades del negocio.`,
        '',
        'He trabajado con tecnologías como Node.js, TypeScript, React/Next.js y bases de datos SQL, además de participar en proyectos donde es importante entender requerimientos, resolver problemas y entregar soluciones prácticas.',
        '',
        'Me motiva la posibilidad de aportar al equipo, seguir creciendo profesionalmente y contribuir con responsabilidad desde el primer día.',
        '',
        'Quedo atento a la posibilidad de conversar.',
        '',
        'Saludos,',
        'Martin Vergara',
    ].join('\n')
}

function buildChecklist(item: SessionItemRow) {
    const job = item.jobs

    return [
        {
            label: 'Revisar que el CV destaque las tecnologías principales de la oferta.',
            done: false,
        },
        {
            label: 'Ajustar resumen profesional al cargo.',
            done: false,
        },
        {
            label: 'Copiar mensaje para recruiter o formulario.',
            done: false,
        },
        {
            label: 'Abrir link de postulación.',
            done: false,
        },
        {
            label: job?.url ? `Postular en: ${job.url}` : 'Postular en el link de la oferta.',
            done: false,
        },
    ]
}

function buildPackReadyMessage(params: {
    item: SessionItemRow
    packId: string
}) {
    const { item } = params
    const job = item.jobs
    const profile = item.search_profiles

    if (!job || !profile) {
        return '✅ Pack generado, pero no pude cargar todo el detalle del empleo.'
    }

    return [
        `🧠 Pack de postulación listo para Match ${item.item_number}`,
        '',
        `Cargo: ${job.title}`,
        `Empresa: ${job.company}`,
        `Perfil: ${profile.name}`,
        '',
        'Incluye:',
        '- Resumen de calce',
        '- Keywords ATS',
        '- Mejoras sugeridas al CV',
        '- Mensaje para recruiter',
        '- Carta de presentación',
        '- Checklist de postulación',
        '',
        'Siguiente paso:',
        `match ${item.item_number} → revisar oferta`,
        `aplicado ${item.item_number} → marcar como postulado cuando ya postules`,
        '',
        'Luego podemos agregar:',
        `confirmar ${item.item_number} → aprobar pack antes de postular`,
    ].join('\n')
}

async function handlePrepareCommand(params: {
    recipient: string
    itemNumber: number
}) {
    const result = await getSessionItemByNumber({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!result.ok) {
        if (result.reason === 'no_active_session') {
            return [
                'No tienes una sesión activa de matches.',
                '',
                'Primero responde:',
                'run',
            ].join('\n')
        }

        return `No encontré el match ${params.itemNumber}.`
    }

    const item = result.item
    const job = item.jobs
    const profile = item.search_profiles

    if (!job || !profile) {
        return '❌ No pude cargar los datos necesarios para preparar la postulación.'
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const atsKeywords = buildAtsKeywords(item)
    const fitSummary = buildFitSummary(item)
    const cvImprovements = buildCvImprovements(item)
    const recruiterMessage = buildRecruiterMessage(item)
    const coverLetter = buildCoverLetter(item)
    const checklist = buildChecklist(item)

    const { data: pack, error: packError } = await supabase
        .from('application_packs')
        .upsert(
            {
                job_id: item.job_id,
                profile_id: item.profile_id,
                recommended_cv_variant: 'backend_fullstack_jr',
                fit_summary: fitSummary,
                ats_keywords: atsKeywords,
                missing_keywords: [],
                cv_improvements: cvImprovements,
                cover_letter: coverLetter,
                recruiter_message: recruiterMessage,
                form_answers: [],
                checklist,
                generated_by: 'rules_whatsapp',
                updated_at: now,
            },
            {
                onConflict: 'job_id,profile_id',
            }
        )
        .select('id')
        .single()

    if (packError) {
        throw new Error(packError.message)
    }

    const { error: applicationError } = await supabase
        .from('job_applications')
        .upsert(
            {
                job_id: item.job_id,
                profile_id: item.profile_id,
                status: 'ready',
                cv_variant: 'backend_fullstack_jr',
                notes: 'Pack de postulación generado desde WhatsApp.',
                source_notes: 'whatsapp_command:preparar',
                updated_at: now,
            },
            {
                onConflict: 'job_id,profile_id',
            }
        )

    if (applicationError) {
        throw new Error(applicationError.message)
    }

    const { error: matchError } = await supabase
        .from('job_matches')
        .update({
            saved: true,
        })
        .eq('id', item.match_id)

    if (matchError) {
        throw new Error(matchError.message)
    }

    return buildPackReadyMessage({
        item,
        packId: pack.id,
    })
}
function limitText(value: string, maxLength: number) {
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength - 1)}…`
}

function formatList(values: string[] | null | undefined, fallback: string) {
    if (!values || values.length === 0) {
        return fallback
    }

    return values.slice(0, 10).map((value) => `- ${value}`).join('\n')
}

async function getApplicationPackForSessionItem(params: {
    recipient: string
    itemNumber: number
}) {
    const result = await getSessionItemByNumber({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!result.ok) {
        return {
            ok: false as const,
            reason: result.reason,
            item: null,
            pack: null,
        }
    }

    const item = result.item
    const supabase = createAdminClient()

    const { data: pack, error } = await supabase
        .from('application_packs')
        .select(`
            id,
            job_id,
            profile_id,
            recommended_cv_variant,
            fit_summary,
            ats_keywords,
            missing_keywords,
            cv_improvements,
            cover_letter,
            recruiter_message,
            form_answers,
            checklist,
            generated_by,
            created_at,
            updated_at
        `)
        .eq('job_id', item.job_id)
        .eq('profile_id', item.profile_id)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    if (!pack) {
        return {
            ok: false as const,
            reason: 'pack_not_found' as const,
            item,
            pack: null,
        }
    }

    return {
        ok: true as const,
        reason: null,
        item,
        pack: pack as ApplicationPackRow,
    }
}

function buildPackMessage(params: {
    item: SessionItemRow
    pack: ApplicationPackRow
}) {
    const { item, pack } = params
    const job = item.jobs
    const profile = item.search_profiles

    if (!job || !profile) {
        return '❌ No pude cargar el detalle del pack.'
    }

    return limitText(
        [
            `📦 Pack Match ${item.item_number}`,
            '',
            `Cargo: ${job.title}`,
            `Empresa: ${job.company}`,
            `Perfil: ${profile.name}`,
            `CV recomendado: ${pack.recommended_cv_variant}`,
            '',
            'Resumen de calce:',
            pack.fit_summary || 'Sin resumen generado.',
            '',
            'Keywords ATS:',
            pack.ats_keywords?.length
                ? pack.ats_keywords.slice(0, 15).join(', ')
                : 'Sin keywords.',
            '',
            'Mejoras sugeridas al CV:',
            formatList(pack.cv_improvements, 'Sin mejoras sugeridas.'),
            '',
            'Mensaje recruiter:',
            pack.recruiter_message || 'Sin mensaje generado.',
            '',
            'Comandos:',
            `mensaje ${item.item_number} → ver solo mensaje recruiter`,
            `cv ${item.item_number} → ver mejoras CV`,
            `carta ${item.item_number} → ver carta`,
            `aplicado ${item.item_number} → marcar postulado`,
        ].join('\n'),
        3500
    )
}

function buildRecruiterOnlyMessage(params: {
    item: SessionItemRow
    pack: ApplicationPackRow
}) {
    const job = params.item.jobs

    return limitText(
        [
            `💬 Mensaje recruiter - Match ${params.item.item_number}`,
            '',
            job ? `${job.title} - ${job.company}` : null,
            '',
            params.pack.recruiter_message || 'Sin mensaje generado.',
        ]
            .filter(Boolean)
            .join('\n'),
        3500
    )
}

function buildCvOnlyMessage(params: {
    item: SessionItemRow
    pack: ApplicationPackRow
}) {
    return limitText(
        [
            `🧾 CV sugerido - Match ${params.item.item_number}`,
            '',
            `Variante recomendada: ${params.pack.recommended_cv_variant}`,
            '',
            'Keywords ATS:',
            params.pack.ats_keywords?.length
                ? params.pack.ats_keywords.slice(0, 20).join(', ')
                : 'Sin keywords.',
            '',
            'Mejoras al CV:',
            formatList(params.pack.cv_improvements, 'Sin mejoras sugeridas.'),
            '',
            'Keywords faltantes:',
            formatList(params.pack.missing_keywords, 'Sin keywords faltantes detectadas.'),
        ].join('\n'),
        3500
    )
}

function buildCoverLetterOnlyMessage(params: {
    item: SessionItemRow
    pack: ApplicationPackRow
}) {
    const job = params.item.jobs

    return limitText(
        [
            `📄 Carta - Match ${params.item.item_number}`,
            '',
            job ? `${job.title} - ${job.company}` : null,
            '',
            params.pack.cover_letter || 'Sin carta generada.',
        ]
            .filter(Boolean)
            .join('\n'),
        3500
    )
}

async function handlePackCommand(params: {
    recipient: string
    itemNumber: number
    mode: PackCommandMode
}) {
    const result = await getApplicationPackForSessionItem({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!result.ok) {
        if (result.reason === 'no_active_session') {
            return [
                'No tienes una sesión activa de matches.',
                '',
                'Primero responde:',
                'run',
            ].join('\n')
        }

        if (result.reason === 'pack_not_found') {
            return [
                `Todavía no existe pack para el match ${params.itemNumber}.`,
                '',
                'Primero responde:',
                `preparar ${params.itemNumber}`,
            ].join('\n')
        }

        return `No encontré el match ${params.itemNumber}.`
    }

    if (params.mode === 'mensaje') {
        return buildRecruiterOnlyMessage({
            item: result.item,
            pack: result.pack,
        })
    }

    if (params.mode === 'cv') {
        return buildCvOnlyMessage({
            item: result.item,
            pack: result.pack,
        })
    }

    if (params.mode === 'carta') {
        return buildCoverLetterOnlyMessage({
            item: result.item,
            pack: result.pack,
        })
    }

    return buildPackMessage({
        item: result.item,
        pack: result.pack,
    })
}
async function handleConfirmCommand(params: {
    recipient: string
    itemNumber: number
}) {
    const packResult = await getApplicationPackForSessionItem({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!packResult.ok) {
        if (packResult.reason === 'no_active_session') {
            return [
                'No tienes una sesión activa de matches.',
                '',
                'Primero responde:',
                'run',
            ].join('\n')
        }

        if (packResult.reason === 'pack_not_found') {
            return [
                `Todavía no existe pack para el match ${params.itemNumber}.`,
                '',
                'Primero responde:',
                `preparar ${params.itemNumber}`,
            ].join('\n')
        }

        return `No encontré el match ${params.itemNumber}.`
    }

    const item = packResult.item
    const job = item.jobs
    const profile = item.search_profiles
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { error: applicationError } = await supabase
        .from('job_applications')
        .upsert(
            {
                job_id: item.job_id,
                profile_id: item.profile_id,
                status: 'approved',
                cv_variant: packResult.pack.recommended_cv_variant,
                notes: 'Pack aprobado desde WhatsApp. Listo para postular.',
                source_notes: 'whatsapp_command:confirmar',
                updated_at: now,
            },
            {
                onConflict: 'job_id,profile_id',
            }
        )

    if (applicationError) {
        throw new Error(applicationError.message)
    }

    const { error: matchError } = await supabase
        .from('job_matches')
        .update({
            saved: true,
        })
        .eq('id', item.match_id)

    if (matchError) {
        throw new Error(matchError.message)
    }

    return [
        `✅ Pack aprobado para Match ${params.itemNumber}`,
        '',
        job ? `Cargo: ${job.title}` : null,
        job ? `Empresa: ${job.company}` : null,
        profile ? `Perfil: ${profile.name}` : null,
        '',
        'Estado guardado:',
        'approved',
        '',
        'Siguiente paso:',
        job?.url ? `Postula aquí:\n${job.url}` : 'Abre el link de la oferta desde match.',
        '',
        `Cuando postules, responde: aplicado ${params.itemNumber}`,
    ]
        .filter(Boolean)
        .join('\n')
}

type IncomingCommand = {
    from: string
    body: string
    messageId?: string
}

function getBaseUrl(request: NextRequest) {
    const internalBaseUrl = process.env.INTERNAL_BASE_URL?.trim()
    const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

    if (internalBaseUrl) {
        return internalBaseUrl.replace(/\/$/, '')
    }

    if (publicAppUrl) {
        return publicAppUrl.replace(/\/$/, '')
    }

    return request.nextUrl.origin
}

function normalizeWhatsAppRecipient(value: string) {
    const clean = value.trim().replace(/\s+/g, '')

    if (clean.startsWith('whatsapp:')) {
        return clean
    }

    if (clean.startsWith('+')) {
        return `whatsapp:${clean}`
    }

    return `whatsapp:+${clean}`
}

function normalizeMetaWaId(value: string) {
    return normalizeWhatsAppRecipient(value)
}

function isAllowedSender(from: string | null) {
    const allowed = process.env.WHATSAPP_ALLOWED_FROM?.trim()

    if (!allowed || !from) return false

    return normalizeWhatsAppRecipient(allowed) === normalizeWhatsAppRecipient(from)
}

function normalizeCommand(value: string | null) {
    return (value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function buildHelpMessage() {
    return [
        'Comandos disponibles:',
        '',
        'run - correr pipeline completo',
        'matches - mostrar últimos matches',
        'match 1 - ver detalle del match 1',
        'preparar 1 - generar pack de postulación',
        'pack 1 - ver pack completo',
        'mensaje 1 - ver mensaje para recruiter',
        'cv 1 - ver mejoras sugeridas al CV',
        'carta 1 - ver carta de presentación',
        'confirmar 1 - aprobar pack antes de postular',
        'descartar 1 - descartar match',
        'aplicado 1 - marcar como postulado',
        'ayuda - ver comandos',
        '',
        'Ejemplo:',
        'run',
    ].join('\n')
}

function buildPipelineSummary(result: PipelineResponse) {
    if (!result.ok) {
        const collectError = result.collect?.error
        const enrichError = result.enrich?.error
        const rescoreError = result.rescore?.error
        const notifyFailures = result.notify?.failures?.length ?? 0

        return [
            '❌ Pipeline falló',
            '',
            result.error ? `Error: ${result.error}` : null,
            collectError ? `Collect: ${collectError}` : null,
            enrichError ? `Enrich: ${enrichError}` : null,
            rescoreError ? `Rescore: ${rescoreError}` : null,
            notifyFailures ? `Notify failures: ${notifyFailures}` : null,
        ]
            .filter(Boolean)
            .join('\n')
    }

    const collectResult = result.collect?.result
    const sources = collectResult?.sources ?? []

    return [
        '✅ Pipeline terminado',
        '',
        `Duración: ${Math.round((result.duration_ms ?? 0) / 1000)}s`,
        `Jobs encontrados: ${collectResult?.jobs_found ?? 0}`,
        `Jobs procesados: ${collectResult?.jobs_processed ?? 0}`,
        `Matches creados: ${collectResult?.matches_created ?? 0}`,
        '',
        `Top matches enviados: ${result.notify?.selected ?? 0}`,
        `Mensajes WhatsApp: ${result.notify?.sent ?? 0}`,
        result.notify?.sessionId ? `Sesión: ${result.notify.sessionId.slice(0, 8)}` : null,
        '',
        sources.length ? 'Fuentes:' : null,
        ...sources.slice(0, 8).map((source) => {
            const status = source.ok ? 'OK' : 'FAIL'
            const skipped = source.skipped ? ' / skipped' : ''
            return `- ${source.source_name}: ${status}${skipped} · ${source.jobs_found} jobs`
        }),
        '',
        'Responde:',
        'matches',
        'match 1',
        'preparar 1',
    ]
        .filter(Boolean)
        .join('\n')
}

function extractCommands(payload: WhatsAppWebhookPayload): IncomingCommand[] {
    const commands: IncomingCommand[] = []

    for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
            const value = change.value
            const messages = value?.messages ?? []

            for (const message of messages) {
                if (message.type !== 'text') continue

                const fromWaId = message.from
                const text = message.text?.body

                if (!fromWaId || !text) continue

                commands.push({
                    from: normalizeMetaWaId(fromWaId),
                    body: text,
                    messageId: message.id,
                })
            }
        }
    }

    return commands
}

async function runPipelineFromWebhook(params: {
    baseUrl: string
    replyTo: string
}) {
    const cronSecret = process.env.CRON_SECRET ?? process.env.INTERNAL_API_SECRET

    if (!cronSecret) {
        await sendWhatsAppMessage({
            to: params.replyTo,
            body: '❌ Falta CRON_SECRET o INTERNAL_API_SECRET en variables de entorno.',
        })

        return
    }

    try {
        const response = await fetch(`${params.baseUrl}/api/cron/run-all`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${cronSecret}`,
            },
            cache: 'no-store',
        })

        const body = (await response.json().catch(() => null)) as PipelineResponse | null

        await sendWhatsAppMessage({
            to: params.replyTo,
            body: buildPipelineSummary(
                body ?? {
                    ok: false,
                    error: `Respuesta inválida del pipeline. Status ${response.status}`,
                }
            ),
        })
    } catch (error) {
        await sendWhatsAppMessage({
            to: params.replyTo,
            body: [
                '❌ Error ejecutando pipeline',
                '',
                error instanceof Error ? error.message : 'Error desconocido',
            ].join('\n'),
        })
    }
}

/**
 * GET requerido por Meta para verificar el webhook.
 * Meta envía hub.mode, hub.verify_token y hub.challenge.
 */
export async function GET(request: NextRequest): Promise<Response> {
    const searchParams = request.nextUrl.searchParams

    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

    if (mode === 'subscribe' && token && token === verifyToken && challenge) {
        return new NextResponse(challenge, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
            },
        })
    }

    return new NextResponse('Forbidden', { status: 403 })
}

/**
 * POST usado por Meta para enviar mensajes entrantes y eventos.
 */
export async function POST(request: NextRequest): Promise<Response> {
    const enabled = process.env.WHATSAPP_BOT_ENABLED === 'true'

    if (!enabled) {
        return NextResponse.json({ ok: true, message: 'WhatsApp bot disabled' })
    }

    let payload: WhatsAppWebhookPayload

    try {
        payload = (await request.json()) as WhatsAppWebhookPayload
    } catch {
        return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const commands = extractCommands(payload)

    if (commands.length === 0) {
        return NextResponse.json({ ok: true, message: 'No text commands' })
    }

    const baseUrl = getBaseUrl(request)

    for (const incoming of commands) {
        if (!isAllowedSender(incoming.from)) {
            continue
        }

        const command = normalizeCommand(incoming.body)

        if (command === 'run' || command === 'correr' || command === 'buscar') {
            after(async () => {
                await sendWhatsAppMessage({
                    to: incoming.from,
                    body: '🚀 Ok, estoy corriendo el pipeline. Te aviso cuando termine.',
                })

                await runPipelineFromWebhook({
                    baseUrl,
                    replyTo: incoming.from,
                })
            })

            continue
        }

        if (command === 'ayuda' || command === 'help' || command === 'comandos') {
            after(async () => {
                await sendWhatsAppMessage({
                    to: incoming.from,
                    body: buildHelpMessage(),
                })
            })

            continue
        }

        const matchCommand = parseMatchCommand(command)

        if (matchCommand?.action === 'match') {
            after(async () => {
                const message = await handleMatchDetailCommand({
                    recipient: incoming.from,
                    itemNumber: matchCommand.itemNumber,
                })

                await sendWhatsAppMessage({
                    to: incoming.from,
                    body: message,
                })
            })

            continue
        }
        if (matchCommand?.action === 'descartar') {
            after(async () => {
                try {
                    const message = await handleDismissCommand({
                        recipient: incoming.from,
                        itemNumber: matchCommand.itemNumber,
                    })

                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: message,
                    })
                } catch (error) {
                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: [
                            '❌ No pude descartar el match.',
                            '',
                            error instanceof Error ? error.message : 'Error desconocido',
                        ].join('\n'),
                    })
                }
            })

            continue
        }

        if (matchCommand?.action === 'aplicado') {
            after(async () => {
                try {
                    const message = await handleAppliedCommand({
                        recipient: incoming.from,
                        itemNumber: matchCommand.itemNumber,
                    })

                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: message,
                    })
                } catch (error) {
                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: [
                            '❌ No pude marcar como postulado.',
                            '',
                            error instanceof Error ? error.message : 'Error desconocido',
                        ].join('\n'),
                    })
                }
            })

            continue
        }

        if (command === 'matches') {
            after(async () => {
                await sendWhatsAppMessage({
                    to: incoming.from,
                    body: [
                        'Todavía estamos conectando el comando matches.',
                        '',
                        'Por ahora usa:',
                        'run',
                    ].join('\n'),
                })
            })

            continue
        }
        if (matchCommand?.action === 'preparar') {
            after(async () => {
                try {
                    const message = await handlePrepareCommand({
                        recipient: incoming.from,
                        itemNumber: matchCommand.itemNumber,
                    })

                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: message,
                    })
                } catch (error) {
                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: [
                            '❌ No pude preparar el pack de postulación.',
                            '',
                            error instanceof Error ? error.message : 'Error desconocido',
                        ].join('\n'),
                    })
                }
            })

            continue
        }
        if (matchCommand && isPackCommandMode(matchCommand.action)) {
            const mode = matchCommand.action

            after(async () => {
                try {
                    const message = await handlePackCommand({
                        recipient: incoming.from,
                        itemNumber: matchCommand.itemNumber,
                        mode,
                    })

                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: message,
                    })
                } catch (error) {
                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: [
                            '❌ No pude cargar el pack.',
                            '',
                            error instanceof Error ? error.message : 'Error desconocido',
                        ].join('\n'),
                    })
                }
            })

            continue
        }
        if (matchCommand?.action === 'confirmar') {
            after(async () => {
                try {
                    const message = await handleConfirmCommand({
                        recipient: incoming.from,
                        itemNumber: matchCommand.itemNumber,
                    })

                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: message,
                    })
                } catch (error) {
                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: [
                            '❌ No pude confirmar el pack.',
                            '',
                            error instanceof Error ? error.message : 'Error desconocido',
                        ].join('\n'),
                    })
                }
            })

            continue
        }

        after(async () => {
            await sendWhatsAppMessage({
                to: incoming.from,
                body: [
                    'No entendí ese comando.',
                    '',
                    buildHelpMessage(),
                ].join('\n'),
            })
        })
    }

    return NextResponse.json({ ok: true })
}