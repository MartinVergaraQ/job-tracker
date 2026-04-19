import { load } from 'cheerio'

type DuolaboralJobDetail = {
    published_at: string | null
    location: string | null
    salary_text: string | null
    description: string | null
    experience_text: string | null
    careers_text: string | null
    contract_text: string | null
    work_area: string | null
    role_type: string | null
}

function cleanText(value: string | null | undefined) {
    return value?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
}

function capture(text: string, regex: RegExp) {
    return cleanText(text.match(regex)?.[1] ?? null) || null
}

function parseSpanishDateToIso(value: string | null) {
    if (!value) return null

    const monthMap: Record<string, number> = {
        ene: 0,
        feb: 1,
        mar: 2,
        abr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        ago: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dic: 11,
    }

    const match = value
        .toLowerCase()
        .match(/(\d{1,2})\s+de\s+([a-záéíóú]+),?\s+(\d{4})/i)

    if (!match) return null

    const day = Number(match[1])
    const monthRaw = match[2]
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .slice(0, 3)
    const year = Number(match[3])
    const month = monthMap[monthRaw]

    if (month === undefined) return null

    const date = new Date(Date.UTC(year, month, day, 12, 0, 0))
    return date.toISOString()
}

export function parseDuolaboralDetailHtml(html: string): DuolaboralJobDetail {
    const $ = load(html)

    const bodyText = cleanText($('body').text())

    const publishedText = capture(
        bodyText,
        /Publicado el\s+(.+?)\s+Detalles/i
    )

    const location = capture(
        bodyText,
        /Ubicación\s+(.+?)\s+Área de trabajo/i
    )

    const workArea = capture(
        bodyText,
        /Área de trabajo\s+(.+?)\s+Tipo de cargo/i
    )

    const roleType = capture(
        bodyText,
        /Tipo de cargo\s+(.+?)\s+Jornada/i
    )

    const contractText = capture(
        bodyText,
        /Contrato\s+(.+?)\s+Sueldo ofrecido/i
    )

    const salaryText = capture(
        bodyText,
        /Sueldo ofrecido\s+(.+?)\s+Requisitos/i
    )

    const experienceText = capture(
        bodyText,
        /Experiencia:\s+(.+?)\s+Carrera\(s\):/i
    )

    const careersText = capture(
        bodyText,
        /Carrera\(s\):\s+(.+?)\s+Descripción del puesto/i
    )

    const description = capture(
        bodyText,
        /Descripción del puesto\s+(.+?)\s+Postular/i
    )

    return {
        published_at: parseSpanishDateToIso(publishedText),
        location,
        salary_text: salaryText,
        description,
        experience_text: experienceText,
        careers_text: careersText,
        contract_text: contractText,
        work_area: workArea,
        role_type: roleType,
    }
}