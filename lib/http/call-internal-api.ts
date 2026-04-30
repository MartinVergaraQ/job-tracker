export async function callInternalApi(url: string, internalSecret: string) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${internalSecret}`,
            'Content-Type': 'application/json',
        },
        cache: 'no-store',
    })

    const contentType = response.headers.get('content-type') ?? ''

    let body: unknown = null

    if (contentType.includes('application/json')) {
        body = await response.json().catch(() => null)
    } else {
        body = {
            ok: false,
            status: response.status,
            text: await response.text().catch(() => ''),
        }
    }

    return {
        ok: response.ok,
        status: response.status,
        body,
    }
}