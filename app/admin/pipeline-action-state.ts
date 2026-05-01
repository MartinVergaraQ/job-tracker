export type RunPipelineActionStatus = 'idle' | 'success' | 'error'

export type RunPipelineActionState = {
    status: RunPipelineActionStatus
    message: string | null
    durationMs: number | null
    jobsFound: number | null
    jobsProcessed: number | null
    matchesCreated: number | null
    enriched: number | null
    rescored: number | null
    notificationsSent: number | null
    error: string | null
}

export const runPipelineInitialState: RunPipelineActionState = {
    status: 'idle',
    message: null,
    durationMs: null,
    jobsFound: null,
    jobsProcessed: null,
    matchesCreated: null,
    enriched: null,
    rescored: null,
    notificationsSent: null,
    error: null,
}