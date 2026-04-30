import { NextRequest } from 'next/server'

export function getBaseUrl(request: NextRequest) {
    return new URL(request.url).origin
}