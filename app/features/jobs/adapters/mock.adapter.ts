import type { NormalizedJob } from '../types/job'

export async function getMockJobs(): Promise<NormalizedJob[]> {
    const now = new Date().toISOString()

    return [
        {
            source_name: 'mock-board',
            source_type: 'mock',
            external_id: 'dev-001',
            url: 'https://example.com/jobs/dev-001',
            title: 'Desarrollador Full Stack Junior',
            company: 'Acme Tech',
            location: 'Santiago, Chile',
            modality: 'hybrid',
            seniority: 'junior',
            salary_text: null,
            description:
                'Buscamos desarrollador con React, Next.js, TypeScript, Node.js y SQL.',
            tech_tags: ['react', 'next.js', 'typescript', 'node.js', 'sql'],
            published_at: now,
            scraped_at: now,
        },
        {
            source_name: 'mock-board',
            source_type: 'mock',
            external_id: 'sales-001',
            url: 'https://example.com/jobs/sales-001',
            title: 'Vendedora Integral Retail',
            company: 'Retail Demo',
            location: 'San Bernardo, Santiago',
            modality: 'onsite',
            seniority: 'unknown',
            salary_text: null,
            description:
                'Atención al cliente, reposición, caja y ventas en tienda.',
            tech_tags: ['ventas', 'retail', 'caja', 'reposicion'],
            published_at: now,
            scraped_at: now,
        },
    ]
}