'use client'

import { useState } from 'react'

type CopyButtonProps = {
    text: string
    label?: string
}

export function CopyButton({
    text,
    label = 'Copiar',
}: CopyButtonProps) {
    const [copied, setCopied] = useState(false)

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)

            setTimeout(() => {
                setCopied(false)
            }, 1500)
        } catch (error) {
            console.error('Copy failed:', error)
        }
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-950"
        >
            {copied ? 'Copiado' : label}
        </button>
    )
}