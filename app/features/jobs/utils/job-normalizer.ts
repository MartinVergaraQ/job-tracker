type JobLike = {
    source_name: string;
    title: string;
    company?: string;
    location?: string;
    url: string;
    published_at?: string;
    tech_tags?: string[];
};

function normalizeText(value: string | undefined | null): string {
    return (value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanTrackingUrl(url: string): string {
    try {
        const parsed = new URL(url);

        const trackingParams = [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "om",
            "oi",
            "by",
        ];

        for (const param of trackingParams) {
            parsed.searchParams.delete(param);
        }

        return parsed.toString();
    } catch {
        return url;
    }
}

export function normalizeJob<T extends JobLike>(job: T): T {
    return {
        ...job,
        title: job.title.trim(),
        company: job.company?.trim() || "Sin empresa",
        location: job.location?.trim() || "Chile",
        url: cleanTrackingUrl(job.url),
        tech_tags: Array.from(new Set(job.tech_tags ?? [])),
    };
}

export function getJobFingerprint(job: JobLike): string {
    const cleanUrl = cleanTrackingUrl(job.url);

    let urlKey = cleanUrl;

    try {
        const parsed = new URL(cleanUrl);

        // Para Computrabajo, el slug/oferta suele bastar para identificar.
        urlKey = `${parsed.hostname}${parsed.pathname}`;
    } catch {
        urlKey = cleanUrl;
    }

    const title = normalizeText(job.title);
    const company = normalizeText(job.company);
    const location = normalizeText(job.location);

    return `${title}|${company}|${location}|${urlKey}`;
}

export function dedupeJobs<T extends JobLike>(jobs: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];

    for (const job of jobs.map(normalizeJob)) {
        const key = getJobFingerprint(job);

        if (seen.has(key)) continue;

        seen.add(key);
        result.push(job);
    }

    return result;
}

export function sortJobsByDateDesc<T extends JobLike>(jobs: T[]): T[] {
    return [...jobs].sort((a, b) => {
        const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
        const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;

        return dateB - dateA;
    });
}