import { after, NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/notifications/send-whatsapp-message'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateApplicationPackWithAI } from '@/lib/ai/generate-application-pack'

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
    | 'cvdoc'
    | 'link'
    | 'deshacer'
    itemNumber: number
}

type PackCommandMode = 'pack' | 'mensaje' | 'cv' | 'carta'


type ApplicationRow = {
    id: string
    status: string
    applied_at: string | null
    updated_at: string
    notes: string | null
    jobs: {
        title: string
        company: string
        url: string
    } | null
    search_profiles: {
        name: string
        slug: string
    } | null
}

function formatDateCL(value: string | null | undefined) {
    if (!value) return null

    try {
        return new Date(value).toLocaleDateString('es-CL')
    } catch {
        return value
    }
}

function buildApplicationLines(rows: ApplicationRow[]) {
    return rows.flatMap((row, index) => {
        const job = row.jobs

        return [
            `${index + 1}. ${job?.title ?? 'Sin cargo'} - ${job?.company ?? 'Empresa no indicada'}`,
            row.applied_at ? `   Postulado: ${formatDateCL(row.applied_at)}` : null,
            `   Actualizado: ${formatDateCL(row.updated_at)}`,
            job?.url ? `   Link: ${job.url}` : null,
        ].filter(Boolean) as string[]
    })
}

async function handleApplicationsCommand(params: {
    recipient: string
}) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('job_applications')
        .select(`
            id,
            status,
            applied_at,
            updated_at,
            notes,
            jobs (
                title,
                company,
                url
            ),
            search_profiles (
                name,
                slug
            )
        `)
        .eq('profile_id', '7fab5bd9-502d-412d-b37e-bace8ed4487f')
        .order('updated_at', { ascending: false })
        .limit(30)

    if (error) {
        throw new Error(error.message)
    }

    const rows = (data ?? []) as unknown as ApplicationRow[]

    if (rows.length === 0) {
        return [
            'Todavía no tienes postulaciones registradas.',
            '',
            'Flujo recomendado:',
            'matches',
            'preparar 1',
            'cvdoc 1',
            'confirmar 1',
            'link 1',
            'aplicado 1',
        ].join('\n')
    }

    const appliedRows = rows.filter((row) => row.status === 'applied').slice(0, 5)
    const approvedRows = rows.filter((row) => row.status === 'approved').slice(0, 5)
    const readyRows = rows.filter((row) => row.status === 'ready').slice(0, 5)
    const savedRows = rows.filter((row) => row.status === 'saved').slice(0, 5)
    const interviewRows = rows.filter((row) => row.status === 'interview').slice(0, 5)
    const offerRows = rows.filter((row) => row.status === 'offer').slice(0, 5)
    const rejectedRows = rows.filter((row) => row.status === 'rejected').slice(0, 5)

    const sections: string[] = ['📌 Tus postulaciones', '']

    if (appliedRows.length > 0) {
        sections.push(`✅ Postuladas (${appliedRows.length})`)
        sections.push(...buildApplicationLines(appliedRows))
        sections.push('')
    }

    if (approvedRows.length > 0) {
        sections.push(`🟡 Aprobadas (${approvedRows.length})`)
        sections.push(...buildApplicationLines(approvedRows))
        sections.push('')
    }

    if (readyRows.length > 0) {
        sections.push(`📄 CV listo (${readyRows.length})`)
        sections.push(...buildApplicationLines(readyRows))
        sections.push('')
    }

    if (savedRows.length > 0) {
        sections.push(`💾 Guardadas (${savedRows.length})`)
        sections.push(...buildApplicationLines(savedRows))
        sections.push('')
    }

    if (interviewRows.length > 0) {
        sections.push(`🎙️ Entrevistas (${interviewRows.length})`)
        sections.push(...buildApplicationLines(interviewRows))
        sections.push('')
    }

    if (offerRows.length > 0) {
        sections.push(`🎉 Ofertas (${offerRows.length})`)
        sections.push(...buildApplicationLines(offerRows))
        sections.push('')
    }

    if (rejectedRows.length > 0) {
        sections.push(`❌ Rechazadas (${rejectedRows.length})`)
        sections.push(...buildApplicationLines(rejectedRows))
        sections.push('')
    }

    sections.push(
        `Resumen: Postuladas ${appliedRows.length} | Aprobadas ${approvedRows.length} | CV listo ${readyRows.length} | Guardadas ${savedRows.length} | Entrevistas ${interviewRows.length} | Ofertas ${offerRows.length} | Rechazadas ${rejectedRows.length}`
    )
    sections.push('')
    sections.push('Comandos útiles:')
    sections.push('matches')
    sections.push('run')

    return sections.join('\n')
}

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

type CvProfileRow = {
    id: string
    profile_id: string
    original_filename: string | null
    raw_text: string
    summary: string
    headline: string
    skills: string[] | null
    experience: unknown
    projects: unknown
    education: unknown
    languages: unknown
    parsed_by: string
    is_active: boolean
}

function parseMatchCommand(command: string): MatchCommand | null {
    const match = command.match(/^(match|preparar|pack|mensaje|cv|carta|confirmar|descartar|aplicado|cvdoc|link|deshacer)\s+(\d+)$/)
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
function normalizeText(value: string | null | undefined) {
    return (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
}

function buildNoActiveSessionMessage() {
    return [
        'No tienes una sesión activa de matches.',
        '',
        'Primero responde:',
        'matches',
        'o vuelve a correr:',
        'run',
    ].join('\n')
}

function buildMatchNotFoundMessage(itemNumber: number) {
    return [
        `No encontré el match ${itemNumber}.`,
        '',
        'Responde:',
        'matches',
        'o vuelve a correr:',
        'run',
    ].join('\n')
}

function buildMatchAlerts(row: SessionItemRow) {
    const job = row.jobs

    if (!job) return []

    const text = normalizeText(
        [
            job.title,
            job.description ?? '',
            ...(job.tech_tags ?? []),
        ].join(' ')
    )

    const alerts: string[] = []

    const offStackSignals = [
        'java',
        'spring',
        'spring boot',
        '.net',
        'dotnet',
        'c#',
        'go',
        'golang',
        'aws',
    ]

    const coreSignals = [
        'node',
        'node.js',
        'react',
        'next',
        'next.js',
        'typescript',
        'javascript',
        'sql',
        'postgresql',
        'php',
        'laravel',
        'supabase',
    ]

    const detectedOffStack = offStackSignals.filter((signal) =>
        text.includes(signal)
    )

    const detectedCore = coreSignals.filter((signal) =>
        text.includes(signal)
    )

    const hasSeniorSignal =
        text.includes('senior') ||
        text.includes('semi senior') ||
        text.includes('semisenior') ||
        text.includes('semi-senior') ||
        text.includes('lead') ||
        text.includes('architect') ||
        text.includes('arquitecto')

    if (detectedOffStack.length >= 3) {
        alerts.push(
            `Stack mixto: aparecen tecnologías fuera de foco principal (${detectedOffStack
                .slice(0, 5)
                .join(', ')}).`
        )
    }

    if (detectedOffStack.length > 0 && detectedCore.length > 0) {
        alerts.push(
            'Revisar si las tecnologías fuera de tu stack son obligatorias o solo deseables.'
        )
    }

    if (hasSeniorSignal) {
        alerts.push(
            'La oferta tiene señales de seniority más alta. Revisa experiencia exigida antes de postular.'
        )
    }

    if (
        text.includes('java') &&
        !text.includes('node') &&
        !text.includes('react') &&
        !text.includes('typescript')
    ) {
        alerts.push(
            'La vacante parece más orientada a Java que a tu stack principal.'
        )
    }

    return alerts.slice(0, 3)
}

function buildMatchDetailMessage(row: SessionItemRow) {
    const job = row.jobs
    const match = row.job_matches
    const profile = row.search_profiles

    if (!job || !match || !profile) {
        return '❌ No pude cargar el detalle de este match.'
    }

    const reasons = normalizeReasons(match.reasons)
    const alerts = buildMatchAlerts(row)

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
        alerts.length > 0 ? '' : null,
        alerts.length > 0 ? 'Alertas:' : null,
        ...alerts.map((alert) => `- ${alert}`),
        '',
        'Link:',
        job.url,
        '',
        'Puedes responder:',
        `preparar ${row.item_number}`,
        `cvdoc ${row.item_number}`,
        `link ${row.item_number}`,
        `descartar ${row.item_number}`,
        `aplicado ${row.item_number}`,
    ]
        .filter(Boolean)
        .join('\n')
}

async function handleLinkCommand(params: {
    recipient: string
    itemNumber: number
}) {
    const result = await getSessionItemByNumber({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!result.ok) {
        if (result.reason === 'no_active_session') {
            return buildNoActiveSessionMessage()
        }

        return buildMatchNotFoundMessage(params.itemNumber)
    }

    const item = result.item
    const job = item.jobs
    const profile = item.search_profiles

    if (!job) {
        return '❌ No pude cargar el link de esta oferta.'
    }

    return [
        `🔗 Link Match ${params.itemNumber}`,
        '',
        `Cargo: ${job.title}`,
        `Empresa: ${job.company}`,
        profile ? `Perfil: ${profile.name}` : null,
        '',
        'Postula aquí:',
        job.url,
        '',
        'Antes de postular revisa:',
        `pack ${params.itemNumber}`,
        `cvdoc ${params.itemNumber}`,
        '',
        'Cuando ya postules:',
        `aplicado ${params.itemNumber}`,
    ]
        .filter(Boolean)
        .join('\n')
}

async function handleCvDocCommand(params: {
    recipient: string
    itemNumber: number
    baseUrl: string
}) {
    const result = await getSessionItemByNumber({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!result.ok) {
        if (result.reason === 'no_active_session') {
            return buildNoActiveSessionMessage()
        }

        return buildMatchNotFoundMessage(params.itemNumber)
    }

    const item = result.item
    const job = item.jobs
    const profile = item.search_profiles

    if (!job || !profile) {
        return '❌ No pude cargar la información del match.'
    }

    const internalSecret = process.env.INTERNAL_API_SECRET

    if (!internalSecret) {
        return '❌ Falta INTERNAL_API_SECRET.'
    }

    const generateResponse = await fetch(`${params.baseUrl}/api/cv/generate`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${internalSecret}`,
            'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
            jobId: item.job_id,
            profileId: item.profile_id,
        }),
    })

    const generateBody = await generateResponse.json().catch(() => null) as {
        ok?: boolean
        source?: 'generated' | 'fallback_existing_pdf'
        warning?: string
        message?: string
        document?: {
            id?: string
            title?: string
            format?: string
            public_url?: string
        }
        error?: string
        errorCode?: string
    } | null

    if (
        generateBody?.ok &&
        generateBody.source === 'fallback_existing_pdf' &&
        generateBody.document?.public_url
    ) {
        const supabase = createAdminClient()

        await supabase
            .from('job_applications')
            .upsert(
                {
                    job_id: item.job_id,
                    profile_id: item.profile_id,
                    status: 'ready',
                    cv_document_id: generateBody.document.id ?? null,
                    cv_public_url: generateBody.document.public_url,
                    notes: 'Se reutilizó CV PDF existente por alta demanda de la IA.',
                    source_notes: 'whatsapp_command:cvdoc:fallback_existing_pdf',
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: 'job_id,profile_id',
                }
            )

        return [
            '⚠️ La IA está con alta demanda en este momento.',
            'Te dejo el último CV generado para esta oferta:',
            '',
            generateBody.document.public_url,
            '',
            'Estado guardado:',
            'ready',
            '',
            'Siguiente paso:',
            `confirmar ${params.itemNumber} → aprobar pack`,
            `aplicado ${params.itemNumber} → marcar como postulado cuando ya postules`,
        ].join('\n')
    }

    if (!generateResponse.ok || !generateBody?.ok || !generateBody.document?.id) {
        return [
            '❌ No pude generar el CV adaptado.',
            '',
            generateBody?.error ? `Error: ${generateBody.error}` : `Status: ${generateResponse.status}`,
        ].join('\n')
    }

    const uploadResponse = await fetch(
        `${params.baseUrl}/api/cv/documents/${generateBody.document.id}/upload-pdf`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${internalSecret}`,
            },
            cache: 'no-store',
        }
    )

    const uploadBody = await uploadResponse.json().catch(() => null) as {
        ok?: boolean
        document?: {
            id?: string
            title?: string
            format?: string
            file_path?: string
            public_url?: string
        }
        error?: string
    } | null

    if (!uploadResponse.ok || !uploadBody?.ok || !uploadBody.document?.public_url) {
        return [
            '❌ Generé el CV, pero no pude subir el PDF.',
            '',
            uploadBody?.error ? `Error: ${uploadBody.error}` : `Status: ${uploadResponse.status}`,
        ].join('\n')
    }
    const supabase = createAdminClient()

    await supabase
        .from('job_applications')
        .upsert(
            {
                job_id: item.job_id,
                profile_id: item.profile_id,
                status: 'ready',
                cv_document_id: uploadBody.document.id,
                cv_public_url: uploadBody.document.public_url,
                notes: 'CV ATS PDF generado desde WhatsApp. Listo para revisar y postular.',
                source_notes: 'whatsapp_command:cvdoc',
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: 'job_id,profile_id',
            }
        )

    return [
        `📄 CV ATS listo para Match ${params.itemNumber}`,
        '',
        `Cargo: ${job.title}`,
        `Empresa: ${job.company}`,
        `Perfil: ${profile.name}`,
        '',
        'Descargar CV:',
        uploadBody.document.public_url,
        '',
        'Estado guardado:',
        'ready',
        '',
        'Siguiente paso:',
        `confirmar ${params.itemNumber} → aprobar CV y pack`,
        `aplicado ${params.itemNumber} → marcar como postulado cuando ya postules`,
    ].join('\n')
}

async function handleUndoCommand(params: {
    recipient: string
    itemNumber: number
}) {
    const result = await getSessionItemByNumber({
        recipient: params.recipient,
        itemNumber: params.itemNumber,
    })

    if (!result.ok) {
        if (result.reason === 'no_active_session') {
            return buildNoActiveSessionMessage()
        }

        return buildMatchNotFoundMessage(params.itemNumber)
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
                status: 'saved',
                applied_at: null,
                notes: 'Estado revertido desde WhatsApp.',
                source_notes: 'whatsapp_command:deshacer',
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
            dismissed: false,
            saved: true,
        })
        .eq('id', item.match_id)

    if (matchError) {
        throw new Error(matchError.message)
    }

    return [
        `↩️ Estado revertido para Match ${params.itemNumber}`,
        '',
        job ? `Cargo: ${job.title}` : null,
        job ? `Empresa: ${job.company}` : null,
        profile ? `Perfil: ${profile.name}` : null,
        '',
        'Nuevo estado:',
        'saved',
        '',
        'Puedes seguir con:',
        `pack ${params.itemNumber}`,
        `cvdoc ${params.itemNumber}`,
        `confirmar ${params.itemNumber}`,
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
            return buildNoActiveSessionMessage()
        }

        return buildMatchNotFoundMessage(params.itemNumber)
    }

    return buildMatchDetailMessage(result.item)
}

type TopMatchRow = {
    id: string
    score: number
    job_id: string
    profile_id: string
    jobs: {
        id: string
        title: string
        company: string
        location: string | null
        modality: string | null
        url: string
    } | null
    search_profiles: {
        id: string
        name: string
        slug: string
    } | null
}

async function handleMatchesCommand(params: {
    recipient: string
    limit?: number
}) {
    const supabase = createAdminClient()
    const limit = params.limit ?? 5
    const profileId = '7fab5bd9-502d-412d-b37e-bace8ed4487f'

    const { data: matches, error } = await supabase
        .from('job_matches')
        .select(`
            id,
            score,
            job_id,
            profile_id,
            jobs (
                id,
                title,
                company,
                location,
                modality,
                url
            ),
            search_profiles (
                id,
                name,
                slug
            )
        `)
        .eq('is_match', true)
        .eq('dismissed', false)
        .eq('profile_id', profileId)
        .gte('score', 120)
        .order('score', { ascending: false })
        .limit(50)

    if (error) {
        throw new Error(error.message)
    }

    const { data: applications, error: applicationsError } = await supabase
        .from('job_applications')
        .select('job_id, status')
        .eq('profile_id', profileId)
        .in('status', ['saved', 'ready', 'approved', 'applied', 'interview', 'offer'])

    if (applicationsError) {
        throw new Error(applicationsError.message)
    }

    const excludedJobIds = new Set((applications ?? []).map((row) => row.job_id))

    const rows = ((matches ?? []) as unknown as TopMatchRow[])
        .filter((row) => row.search_profiles?.slug === 'martin_backend_jr')
        .filter((row) => !excludedJobIds.has(row.job_id))
        .slice(0, limit)

    if (rows.length === 0) {
        return {
            message: [
                'No encontré matches nuevos buenos en este momento.',
                '',
                'Puede pasar porque tus mejores ofertas ya están guardadas o postuladas.',
                '',
                'Puedes revisar:',
                'postulaciones',
                '',
                'o correr:',
                'run',
            ].join('\n'),
        }
    }

    await supabase
        .from('whatsapp_match_sessions')
        .update({
            status: 'closed',
            updated_at: new Date().toISOString(),
        })
        .eq('recipient', params.recipient)
        .eq('status', 'active')

    const { data: session, error: sessionError } = await supabase
        .from('whatsapp_match_sessions')
        .insert({
            recipient: params.recipient,
            status: 'active',
        })
        .select('id')
        .single()

    if (sessionError) {
        throw new Error(sessionError.message)
    }

    const sessionItems = rows.map((row, index) => ({
        session_id: session.id,
        item_number: index + 1,
        match_id: row.id,
        job_id: row.job_id,
        profile_id: row.profile_id,
    }))

    const { error: itemsError } = await supabase
        .from('whatsapp_match_session_items')
        .insert(sessionItems)

    if (itemsError) {
        throw new Error(itemsError.message)
    }

    return {
        sessionId: session.id,
        message: [
            `🚀 Encontré ${rows.length} matches nuevos buenos para revisar`,
            '',
            ...rows.flatMap((row, index) => {
                const job = row.jobs
                const profile = row.search_profiles

                return [
                    `${index + 1}. ${job?.title ?? 'Sin título'}`,
                    `   ${job?.company ?? 'Empresa no indicada'} · ${job?.location ?? 'Ubicación no indicada'} · ${job?.modality ?? 'modalidad no indicada'}`,
                    `   Score ${Math.round(row.score)} · Perfil: ${profile?.name ?? 'Sin perfil'}`,
                ]
            }),
            '',
            'Responde con:',
            'match 1 → ver detalle',
            'preparar 1 → generar pack de postulación',
            'descartar 1 → descartar oferta',
            'aplicado 1 → marcar como postulada',
        ].join('\n'),
    }
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
            return buildNoActiveSessionMessage()
        }

        return buildMatchNotFoundMessage(params.itemNumber)
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
            return buildNoActiveSessionMessage()
        }

        return buildMatchNotFoundMessage(params.itemNumber)
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
    const text = normalizeText(
        [
            job.title,
            job.description ?? '',
            ...(job.tech_tags ?? []),
        ].join(' ')
    )

    const hasOffStack =
        text.includes('java') ||
        text.includes('spring') ||
        text.includes('.net') ||
        text.includes('c#') ||
        text.includes('go') ||
        text.includes('aws')

    const opening = hasOffStack
        ? `Buen calce para ${job.title}, pero con algunas tecnologías fuera del foco principal actual.`
        : `Buen calce para ${job.title}, especialmente por alineación con stack y seniority.`

    return [
        opening,
        '',
        `Perfil evaluado: ${profile.name}`,
        `Score: ${Math.round(match.score)}`,
        '',
        'Señales principales:',
        ...reasons.slice(0, 5).map((reason) => `- ${reason}`),
    ].join('\n')
}

function buildCvImprovements(item: SessionItemRow, cvProfile: CvProfileRow | null) {
    const job = item.jobs
    const jobTags = job?.tech_tags ?? []
    const cvSkills = cvProfile?.skills ?? []

    const normalizedCvSkills = cvSkills.map((skill) => skill.toLowerCase())
    const missingFromCv = jobTags.filter(
        (tag) => !normalizedCvSkills.includes(tag.toLowerCase())
    )

    const improvements: string[] = []

    improvements.push('Ajustar el resumen profesional al cargo y al stack principal de la oferta.')
    improvements.push('Destacar primero Node.js, React, Next.js, TypeScript y SQL si son relevantes para el rol.')
    improvements.push('Agregar logros concretos en experiencia o proyectos, no solo tareas realizadas.')

    if (jobTags.some((tag) => ['react', 'next.js', 'typescript'].includes(tag.toLowerCase()))) {
        improvements.push('Dar más visibilidad a proyectos donde usaste React, Next.js y TypeScript en contexto real.')
    }

    if (jobTags.some((tag) => ['node', 'node.js', 'api rest', 'sql', 'postgresql'].includes(tag.toLowerCase()))) {
        improvements.push('Reforzar experiencia en backend, APIs REST, SQL y PostgreSQL en la sección de experiencia.')
    }

    if (jobTags.some((tag) => ['php', 'laravel'].includes(tag.toLowerCase()))) {
        improvements.push('Mencionar PHP/Laravel solo si realmente aporta a esta vacante específica.')
    }

    if (missingFromCv.length > 0) {
        improvements.push(
            `No agregues estas keywords al CV si no puedes defenderlas en entrevista: ${missingFromCv.slice(0, 6).join(', ')}.`
        )
    }

    return improvements.slice(0, 8)
}

function buildRecruiterMessage(item: SessionItemRow, cvProfile: CvProfileRow | null) {
    const job = item.jobs
    if (!job) return ''

    const headline =
        cvProfile?.headline || 'Desarrollador Backend / Full Stack Junior'

    return [
        `Hola, vi la oferta de ${job.title} en ${job.company} y me interesa postular.`,
        '',
        `Soy ${headline}, con experiencia en desarrollo de productos web, backend y frontend usando principalmente Node.js, React, Next.js, TypeScript y SQL.`,
        '',
        'Adjunto mi CV y quedo atento por si les interesa conversar.',
        '',
        'Saludos,',
        'Martin Vergara',
    ].join('\n')
}

function buildCoverLetter(item: SessionItemRow, cvProfile: CvProfileRow | null) {
    const job = item.jobs

    if (!job) {
        return ''
    }

    const headline =
        cvProfile?.headline || 'Desarrollador Backend / Full Stack Junior'

    const summary =
        cvProfile?.summary ||
        'Mi perfil está orientado al desarrollo de aplicaciones web, backend, APIs y soluciones full stack.'

    const skills = cvProfile?.skills?.slice(0, 8).join(', ')

    return [
        `Estimado equipo de ${job.company}:`,
        '',
        `Me interesa postular al cargo de ${job.title}. Soy ${headline}.`,
        '',
        summary,
        '',
        skills
            ? `Dentro de mi stack principal manejo: ${skills}.`
            : 'Tengo experiencia en desarrollo web, backend, frontend y bases de datos.',
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
        '- Evaluación rápida',
        '- Resumen de calce',
        '- Keywords ATS',
        '- Mejoras sugeridas al CV',
        '- Mensaje para recruiter',
        '- Carta de presentación',
        '- Checklist de postulación',
        '',
        'Siguiente paso recomendado:',
        `pack ${item.item_number} → revisar análisis completo`,
        `cvdoc ${item.item_number} → generar CV ATS en PDF`,
        `confirmar ${item.item_number} → aprobar pack`,
        '',
        `Cuando postules: aplicado ${item.item_number}`,
    ].join('\n')
}

async function getActiveCvProfile(profileId: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('cv_profiles')
        .select(`
            id,
            profile_id,
            original_filename,
            raw_text,
            summary,
            headline,
            skills,
            experience,
            projects,
            education,
            languages,
            parsed_by,
            is_active
        `)
        .eq('profile_id', profileId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    return data as CvProfileRow | null
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
            return buildNoActiveSessionMessage()
        }

        return buildMatchNotFoundMessage(params.itemNumber)
    }

    const item = result.item
    const job = item.jobs
    const profile = item.search_profiles
    const cvProfile = await getActiveCvProfile(item.profile_id)

    if (!job || !profile) {
        return '❌ No pude cargar los datos necesarios para preparar la postulación.'
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const aiEnabled = process.env.APPLICATION_PACK_AI_ENABLED === 'true'

    let generatedPack = null

    if (aiEnabled) {
        generatedPack = await generateApplicationPackWithAI({
            job: {
                title: job.title,
                company: job.company,
                location: job.location,
                modality: job.modality,
                seniority: job.seniority,
                salary_text: job.salary_text,
                tech_tags: job.tech_tags,
                description: job.description,
                url: job.url,
            },
            profile: {
                name: profile.name,
                slug: profile.slug,
            },
            cvProfile: cvProfile
                ? {
                    headline: cvProfile.headline,
                    summary: cvProfile.summary,
                    skills: cvProfile.skills,
                    experience: cvProfile.experience,
                    projects: cvProfile.projects,
                    education: cvProfile.education,
                    languages: cvProfile.languages,
                }
                : null,
            score: item.job_matches?.score ?? 0,
            reasons: item.job_matches?.reasons ?? [],
        })
    }

    const atsKeywords = generatedPack?.ats_keywords ?? buildAtsKeywords(item)
    const fitSummary = generatedPack?.fit_summary ?? buildFitSummary(item)
    const cvImprovements =
        generatedPack?.cv_improvements ?? buildCvImprovements(item, cvProfile)
    const recruiterMessage =
        generatedPack?.recruiter_message ?? buildRecruiterMessage(item, cvProfile)
    const coverLetter =
        generatedPack?.cover_letter ?? buildCoverLetter(item, cvProfile)
    const checklist = generatedPack?.checklist ?? buildChecklist(item)
    const missingKeywords = generatedPack?.missing_keywords ?? []
    const recommendedCvVariant =
        generatedPack?.recommended_cv_variant ??
        (cvProfile?.headline
            ? 'backend_fullstack_jr_cv_profile'
            : 'backend_fullstack_jr')

    const { data: pack, error: packError } = await supabase
        .from('application_packs')
        .upsert(
            {
                job_id: item.job_id,
                profile_id: item.profile_id,
                recommended_cv_variant: recommendedCvVariant,
                fit_summary: fitSummary,
                ats_keywords: atsKeywords,
                missing_keywords: missingKeywords,
                cv_improvements: cvImprovements,
                cover_letter: coverLetter,
                recruiter_message: recruiterMessage,
                form_answers: [],
                checklist,
                generated_by: generatedPack
                    ? 'openai_whatsapp_cv_profile'
                    : cvProfile
                        ? 'rules_whatsapp_cv_profile'
                        : 'rules_whatsapp',
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
                status: 'saved',
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

function buildPackDecisionSummary(item: SessionItemRow) {
    const job = item.jobs
    const reasons = normalizeReasons(item.job_matches?.reasons)

    if (!job) {
        return {
            verdict: 'Revisar',
            strength: 'Sin datos suficientes',
            risk: 'No se pudo analizar la oferta',
        }
    }

    const text = normalizeText(
        [
            job.title,
            job.description ?? '',
            ...(job.tech_tags ?? []),
        ].join(' ')
    )

    const hasOffStack =
        text.includes('java') ||
        text.includes('spring') ||
        text.includes('.net') ||
        text.includes('dotnet') ||
        text.includes('c#') ||
        text.includes('go') ||
        text.includes('aws')

    const hasSeniorSignal =
        text.includes('senior') ||
        text.includes('semi senior') ||
        text.includes('semisenior') ||
        text.includes('semi-senior') ||
        text.includes('lead') ||
        text.includes('architect') ||
        text.includes('arquitecto')

    const verdict = hasSeniorSignal
        ? 'No prioridad'
        : hasOffStack
            ? 'Sí, con cuidado'
            : 'Sí'

    const strength =
        reasons[0] ?? 'Buen calce con stack principal del perfil.'

    const risk = hasSeniorSignal
        ? 'La oferta parece pedir más seniority del ideal.'
        : hasOffStack
            ? 'La oferta menciona tecnologías fuera del foco principal actual.'
            : 'No se detectan alertas fuertes.'

    return {
        verdict,
        strength,
        risk,
    }
}

function buildPackAlerts(item: SessionItemRow) {
    const job = item.jobs
    if (!job) return []

    const text = normalizeText(
        [
            job.title,
            job.description ?? '',
            ...(job.tech_tags ?? []),
        ].join(' ')
    )

    const alerts: string[] = []

    if (
        text.includes('java') ||
        text.includes('spring') ||
        text.includes('.net') ||
        text.includes('c#') ||
        text.includes('aws') ||
        text.includes('go')
    ) {
        alerts.push('Revisar si Java, .NET, Go o AWS son obligatorios o solo deseables.')
    }

    if (
        text.includes('senior') ||
        text.includes('semi senior') ||
        text.includes('semisenior') ||
        text.includes('semi-senior')
    ) {
        alerts.push('La oferta puede tener seniority más alta que tu foco actual.')
    }

    if (
        text.includes('python') &&
        !text.includes('node') &&
        !text.includes('react') &&
        !text.includes('typescript')
    ) {
        alerts.push('La vacante parece cargarse más a otro stack que al tuyo.')
    }

    return alerts.slice(0, 3)
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

    const decision = buildPackDecisionSummary(item)
    const alerts = buildPackAlerts(item)

    return limitText(
        [
            `📦 Pack Match ${item.item_number}`,
            '',
            `Cargo: ${job.title}`,
            `Empresa: ${job.company}`,
            `Perfil: ${profile.name}`,
            `CV recomendado: ${pack.recommended_cv_variant}`,
            '',
            'Evaluación rápida:',
            `- Vale la pena postular: ${decision.verdict}`,
            `- Punto fuerte: ${decision.strength}`,
            `- Riesgo principal: ${decision.risk}`,
            '',
            alerts.length > 0 ? 'Alertas:' : null,
            ...alerts.map((alert) => `- ${alert}`),
            alerts.length > 0 ? '' : null,
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
            `cvdoc ${item.item_number} → generar CV ATS en PDF`,
            `aplicado ${item.item_number} → marcar postulado`,
        ].filter(Boolean).join('\n'),
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
            return buildNoActiveSessionMessage()
        }

        if (result.reason === 'pack_not_found') {
            return [
                `Todavía no existe pack para el match ${params.itemNumber}.`,
                '',
                'Primero responde:',
                `preparar ${params.itemNumber}`,
            ].join('\n')
        }

        return buildMatchNotFoundMessage(params.itemNumber)
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
            return buildNoActiveSessionMessage()
        }

        if (packResult.reason === 'pack_not_found') {
            return [
                `Todavía no existe pack para el match ${params.itemNumber}.`,
                '',
                'Primero responde:',
                `preparar ${params.itemNumber}`,
            ].join('\n')
        }

        return buildMatchNotFoundMessage(params.itemNumber)
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

    const { data: cvDocument } = await supabase
        .from('cv_documents')
        .select('id, public_url, format')
        .eq('job_id', item.job_id)
        .eq('profile_id', item.profile_id)
        .eq('format', 'pdf')
        .not('public_url', 'is', null)
        .maybeSingle()

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
        cvDocument?.public_url
            ? `CV listo:\n${cvDocument.public_url}`
            : `Siguiente paso recomendado:\ncvdoc ${params.itemNumber} → generar CV ATS en PDF`,
        '',
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
        'cvdoc 1 - generar y descargar CV ATS en PDF',
        'confirmar 1 - aprobar pack antes de postular',
        'descartar 1 - descartar match',
        'aplicado 1 - marcar como postulado',
        'link 1 - ver link directo de postulación',
        'postulaciones - ver postulaciones guardadas/aprobadas/postuladas',
        'deshacer 1 - revertir estado de prueba o postulación',
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
                try {
                    const result = await handleMatchesCommand({
                        recipient: incoming.from,
                        limit: 5,
                    })

                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: result.message,
                    })
                } catch (error) {
                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: [
                            '❌ Error cargando matches.',
                            '',
                            error instanceof Error ? error.message : 'Error desconocido',
                        ].join('\n'),
                    })
                }
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

        if (matchCommand?.action === 'cvdoc') {
            after(async () => {
                try {
                    const exists = await getSessionItemByNumber({
                        recipient: incoming.from,
                        itemNumber: matchCommand.itemNumber,
                    })

                    if (!exists.ok) {
                        const message =
                            exists.reason === 'no_active_session'
                                ? buildNoActiveSessionMessage()
                                : buildMatchNotFoundMessage(matchCommand.itemNumber)

                        await sendWhatsAppMessage({
                            to: incoming.from,
                            body: message,
                        })

                        return
                    }

                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: '📄 Generando CV ATS en PDF. Dame unos segundos...',
                    })

                    const message = await handleCvDocCommand({
                        recipient: incoming.from,
                        itemNumber: matchCommand.itemNumber,
                        baseUrl,
                    })

                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: message,
                    })
                } catch (error) {
                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: [
                            '❌ No pude generar el CV ATS en PDF.',
                            '',
                            error instanceof Error ? error.message : 'Error desconocido',
                        ].join('\n'),
                    })
                }
            })

            continue
        }

        if (matchCommand?.action === 'link') {
            after(async () => {
                try {
                    const message = await handleLinkCommand({
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
                            '❌ No pude cargar el link.',
                            '',
                            error instanceof Error ? error.message : 'Error desconocido',
                        ].join('\n'),
                    })
                }
            })

            continue
        }
        if (command === 'postulaciones' || command === 'aplicaciones' || command === 'estado') {
            after(async () => {
                try {
                    const message = await handleApplicationsCommand({
                        recipient: incoming.from,
                    })

                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: message,
                    })
                } catch (error) {
                    await sendWhatsAppMessage({
                        to: incoming.from,
                        body: [
                            '❌ No pude cargar tus postulaciones.',
                            '',
                            error instanceof Error ? error.message : 'Error desconocido',
                        ].join('\n'),
                    })
                }
            })

            continue
        }

        if (matchCommand?.action === 'deshacer') {
            after(async () => {
                try {
                    const message = await handleUndoCommand({
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
                            '❌ No pude revertir el estado.',
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