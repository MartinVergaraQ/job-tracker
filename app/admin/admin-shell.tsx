'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
    {
        href: '/admin',
        label: 'Dashboard',
        description: 'Resumen general',
    },
    {
        href: '/admin/today',
        label: 'Acciones de hoy',
        description: 'Postular y seguir',
    },
    {
        href: '/admin/top-matches',
        label: 'Top Matches',
        description: 'Mejores oportunidades',
    },
    {
        href: '/admin/jobs',
        label: 'Jobs',
        description: 'Trabajos recolectados',
    },
    {
        href: '/admin/conversion',
        label: 'Conversión',
        description: 'Métricas por fuente/CV',
    },
    {
        href: '/admin/runs',
        label: 'Runs',
        description: 'Historial del colector',
    },
] as const

function isActivePath(pathname: string, href: string) {
    if (href === '/admin') {
        return pathname === '/admin'
    }

    return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-50">
            <div className="flex min-h-screen">
                <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-neutral-950/90 p-4 lg:block">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">
                            Job Tracker
                        </p>
                        <h1 className="mt-2 text-xl font-semibold">
                            Admin laboral
                        </h1>
                        <p className="mt-2 text-sm text-neutral-400">
                            Panel para recolectar, priorizar y convertir oportunidades.
                        </p>
                    </div>

                    <nav className="mt-6 space-y-2">
                        {NAV_ITEMS.map((item) => {
                            const active = isActivePath(pathname, item.href)

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={[
                                        'block rounded-2xl border px-4 py-3 transition',
                                        active
                                            ? 'border-cyan-400/50 bg-cyan-400/10 text-white'
                                            : 'border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/20 hover:bg-white/[0.06]',
                                    ].join(' ')}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-medium">{item.label}</span>
                                        {active ? (
                                            <span className="rounded-full bg-cyan-400 px-2 py-0.5 text-xs font-semibold text-neutral-950">
                                                activo
                                            </span>
                                        ) : null}
                                    </div>

                                    <p className="mt-1 text-xs text-neutral-500">
                                        {item.description}
                                    </p>
                                </Link>
                            )
                        })}
                    </nav>

                    <div className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-400/10 to-blue-500/10 p-4">
                        <p className="text-sm font-medium">Flujo recomendado</p>
                        <p className="mt-2 text-sm text-neutral-400">
                            Corre el pipeline, revisa acciones de hoy y marca postulaciones
                            apenas avances.
                        </p>
                    </div>
                </aside>

                <div className="min-w-0 flex-1">
                    <header className="sticky top-0 z-20 border-b border-white/10 bg-neutral-950/80 backdrop-blur">
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-6">
                            <div>
                                <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
                                    Job Tracker
                                </p>
                                <p className="text-lg font-semibold">
                                    Centro de control
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Link
                                    href="/admin/today"
                                    className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-white/10"
                                >
                                    Acciones de hoy
                                </Link>

                                <Link
                                    href="/admin/top-matches"
                                    className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-cyan-300"
                                >
                                    Ver matches
                                </Link>
                            </div>
                        </div>

                        <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-3 lg:hidden">
                            {NAV_ITEMS.map((item) => {
                                const active = isActivePath(pathname, item.href)

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={[
                                            'shrink-0 rounded-full border px-3 py-1.5 text-sm',
                                            active
                                                ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200'
                                                : 'border-white/10 text-neutral-400',
                                        ].join(' ')}
                                    >
                                        {item.label}
                                    </Link>
                                )
                            })}
                        </div>
                    </header>

                    <div className="min-h-[calc(100vh-73px)] bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_35%),radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_30%)]">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
}