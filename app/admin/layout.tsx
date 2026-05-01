import { Suspense } from 'react'
import { AdminShell } from './admin-shell'

function AdminShellFallback({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-50">
            <div className="flex min-h-screen">
                <aside className="hidden w-72 border-r border-white/10 bg-neutral-950/80 p-4 lg:block">
                    <div className="h-10 w-40 animate-pulse rounded-xl bg-white/10" />

                    <div className="mt-8 space-y-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div
                                key={index}
                                className="h-11 animate-pulse rounded-xl bg-white/10"
                            />
                        ))}
                    </div>
                </aside>

                <div className="min-w-0 flex-1">
                    <div className="border-b border-white/10 bg-neutral-950/70 p-4">
                        <div className="h-8 w-56 animate-pulse rounded-xl bg-white/10" />
                    </div>

                    <div>{children}</div>
                </div>
            </div>
        </div>
    )
}

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <Suspense fallback={<AdminShellFallback>{children}</AdminShellFallback>}>
            <AdminShell>{children}</AdminShell>
        </Suspense>
    )
}