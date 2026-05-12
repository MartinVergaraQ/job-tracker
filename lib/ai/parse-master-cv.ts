type ParsedCvResult = {
    headline: string
    summary: string
    skills: string[]
    experience: Array<{
        company: string
        role: string
        start_date: string | null
        end_date: string | null
        stack: string[]
        bullets: string[]
    }>
    projects: Array<{
        name: string
        description: string
        stack: string[]
        bullets: string[]
        status?: string | null
    }>
    education: Array<{
        institution: string
        degree: string
        start_date: string | null
        end_date: string | null
    }>
    languages: Array<{
        name: string
        level: string
    }>
}

function cleanText(value: string) {
    return value.replace(/\r/g, '').trim()
}

function splitLines(value: string) {
    return cleanText(value)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
}

function extractSection(rawText: string, startTitle: string, endTitles: string[]) {
    const text = cleanText(rawText)
    const startIndex = text.indexOf(startTitle)

    if (startIndex === -1) return ''

    const fromStart = text.slice(startIndex + startTitle.length)
    let endIndex = fromStart.length

    for (const endTitle of endTitles) {
        const idx = fromStart.indexOf(endTitle)
        if (idx !== -1 && idx < endIndex) {
            endIndex = idx
        }
    }

    return fromStart.slice(0, endIndex).trim()
}

function parseHeadline(rawText: string) {
    const lines = splitLines(rawText)
    return lines[1] ?? ''
}

function parseSummary(rawText: string, skills: string[]) {
    const summary = extractSection(rawText, 'PERFIL', [
        'HABILIDADES TÉCNICAS',
        'EXPERIENCIA',
        'PROYECTOS DESTACADOS',
        'EDUCACIÓN',
        'IDIOMAS',
    ])

    if (summary) {
        return summary.replace(/\s+/g, ' ').trim()
    }

    const topSkills = skills.slice(0, 6).join(', ')
    return `Desarrollador Full Stack Jr. con foco en backend y experiencia en ${topSkills}.`
}

function parseSkills(rawText: string) {
    const section = extractSection(rawText, 'HABILIDADES TÉCNICAS', [
        'EXPERIENCIA',
        'PROYECTOS DESTACADOS',
        'EDUCACIÓN',
        'IDIOMAS',
    ])

    if (!section) return []

    const text = section
        .replace(/Frontend:/gi, '')
        .replace(/Backend\s*\/\s*APIs:/gi, '')
        .replace(/Bases de datos:/gi, '')
        .replace(/Deploy y herramientas:/gi, '')
        .replace(/\n/g, ',')
        .replace(/\s·\s/g, ',')
        .replace(/,\s*,/g, ',')

    const items = text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

    return Array.from(new Set(items)).slice(0, 40)
}

function isBullet(line: string) {
    return /^[-•●▪◦]/.test(line)
}

function removeBulletPrefix(line: string) {
    return line.replace(/^[-•●▪◦]\s*/, '').trim()
}

function parseExperience(rawText: string): ParsedCvResult['experience'] {
    const section = extractSection(rawText, 'EXPERIENCIA', [
        'PROYECTOS DESTACADOS',
        'EDUCACIÓN',
        'IDIOMAS',
    ])

    if (!section) return []

    const lines = splitLines(section)
    const items: ParsedCvResult['experience'] = []

    let i = 0
    while (i < lines.length) {
        const line = lines[i]

        if (
            line.includes('|') &&
            !line.toLowerCase().startsWith('stack:') &&
            !isBullet(line)
        ) {
            const [rolePart, companyPart] = line.split('|').map((x) => x.trim())
            const nextLine = lines[i + 1] ?? ''
            let start_date: string | null = null
            let end_date: string | null = null
            let stack: string[] = []
            const bullets: string[] = []

            if (nextLine.includes('|')) {
                const [datePart, stackPart] = nextLine.split('|').map((x) => x.trim())
                const dateMatch = datePart.split('-').map((x) => x.trim())
                start_date = dateMatch[0] ?? null
                end_date = dateMatch[1] ?? null
                stack = stackPart
                    .split(/[·,]/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                i += 2
            } else {
                i += 1
            }

            while (i < lines.length) {
                const current = lines[i]

                if (
                    current.includes('|') &&
                    !current.toLowerCase().startsWith('stack:') &&
                    !isBullet(current)
                ) {
                    break
                }

                if (isBullet(current)) {
                    bullets.push(removeBulletPrefix(current))
                } else if (
                    current &&
                    !current.toUpperCase().includes('PROYECTOS DESTACADOS') &&
                    !current.toUpperCase().includes('EDUCACIÓN') &&
                    !current.toUpperCase().includes('IDIOMAS')
                ) {
                    bullets.push(current)
                }

                i += 1
            }

            items.push({
                company: companyPart || '',
                role: rolePart || '',
                start_date,
                end_date,
                stack: stack.slice(0, 8),
                bullets: bullets.slice(0, 5),
            })

            continue
        }

        i += 1
    }

    return items
}

function parseProjects(rawText: string): ParsedCvResult['projects'] {
    const section = extractSection(rawText, 'PROYECTOS DESTACADOS', [
        'EDUCACIÓN',
        'IDIOMAS',
    ])

    if (!section) return []

    const lines = splitLines(section)
    const projects: ParsedCvResult['projects'] = []

    let i = 0

    while (i < lines.length) {
        const line = lines[i]
        const nextLine = lines[i + 1] ?? ''

        const looksLikeProjectTitle =
            !isBullet(line) &&
            !line.toLowerCase().startsWith('stack:') &&
            !line.includes('Frontend:') &&
            !line.includes('Backend / APIs:') &&
            !line.includes('Bases de datos:') &&
            !line.includes('Deploy y herramientas:')

        const looksLikeStackLine =
            nextLine.toLowerCase().startsWith('stack:') ||
            /^[A-Za-z0-9.js+\-#/()\s·,:]+$/.test(nextLine)

        if (looksLikeProjectTitle && looksLikeStackLine) {
            const name = line.trim()

            let stackLine = nextLine.trim()
            if (stackLine.toLowerCase().startsWith('stack:')) {
                stackLine = stackLine.replace(/^stack:\s*/i, '')
            }

            const stack = stackLine
                .split(/[·,]/)
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 8)

            const bullets: string[] = []
            const descriptionParts: string[] = []

            i += 2

            while (i < lines.length) {
                const current = lines[i]
                const upcoming = lines[i + 1] ?? ''

                const nextLooksLikeProjectTitle =
                    !isBullet(current) &&
                    !current.toLowerCase().startsWith('stack:') &&
                    upcoming &&
                    (upcoming.toLowerCase().startsWith('stack:') ||
                        /^[A-Za-z0-9.js+\-#/()\s·,:]+$/.test(upcoming))

                if (nextLooksLikeProjectTitle) {
                    break
                }

                if (isBullet(current)) {
                    bullets.push(removeBulletPrefix(current))
                } else {
                    descriptionParts.push(current)
                }

                i += 1
            }

            projects.push({
                name,
                description: descriptionParts.join(' ').trim(),
                stack,
                bullets: bullets.slice(0, 5),
                status: null,
            })

            continue
        }

        i += 1
    }

    return projects
}

function parseEducation(rawText: string): ParsedCvResult['education'] {
    const section = extractSection(rawText, 'EDUCACIÓN', ['IDIOMAS'])

    if (!section) return []

    const lines = splitLines(section)
    const items: ParsedCvResult['education'] = []

    for (const line of lines) {
        const parts = line.split('|').map((x) => x.trim())

        if (parts.length >= 3) {
            const degree = parts[0] ?? ''
            const institution = parts[1] ?? ''
            const datePart = parts[2] ?? ''

            const splitDates = datePart.split('-').map((x) => x.trim())

            items.push({
                degree,
                institution,
                start_date: splitDates[0] ?? null,
                end_date: splitDates[1] ?? null,
            })
        }
    }

    return items
}

function parseLanguages(rawText: string): ParsedCvResult['languages'] {
    const section = extractSection(rawText, 'IDIOMAS', [])

    if (!section) return []

    return splitLines(section)
        .map((line) => {
            const [name, level] = line.split(':').map((x) => x.trim())
            if (!name || !level) return null
            return { name, level }
        })
        .filter(Boolean) as ParsedCvResult['languages']
}

export async function parseMasterCv(params: {
    rawText: string
}): Promise<ParsedCvResult> {
    const rawText = cleanText(params.rawText)
    const headline = parseHeadline(rawText)
    const skills = parseSkills(rawText)

    return {
        headline,
        summary: parseSummary(rawText, skills),
        skills,
        experience: parseExperience(rawText),
        projects: parseProjects(rawText),
        education: parseEducation(rawText),
        languages: parseLanguages(rawText),
    }
}