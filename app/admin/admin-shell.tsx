'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
    {
        href: '/admin',
        label: 'Dashboard',
        helper: 'Resumen general',
    },
    {
        href: '/admin/today',
        label: 'Acciones de hoy',
        helper: 'Postular y seguir',
    },
    {
        href: '/admin/top-matches',
        label: 'Top Matches',
        helper: 'Mejores oportunidades',
    },
    {
        href: '/admin/jobs',
        label: 'Jobs',
        helper: 'Ofertas recolectadas',
    },
    {
        href: '/admin/conversion',
        label: 'Conversión',
        helper: 'CV, fuente y avance',
    },
    {
        href: '/admin/runs',
        label: 'Runs',
        helper: 'Monitoreo del colector',
    },
]

function isActivePath(pathname: string, href: string) {
    if (href === '/admin') {
        return pathname === '/admin'
    }

    return pathname.startsWith(href)
}

export function AdminShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100">
            <div className="flex min-h-screen">
                <aside className="hidden w-80 border-r border-white/10 bg-neutral-950/95 px-5 py-6 lg:block">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-lg font-black text-neutral-950">
                                JT
                            </div>

                            <div>
                                <p className="text-sm font-semibold">Job Tracker</p>
                                <p className="text-xs text-neutral-400">
                                    Panel de postulaciones
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-emerald-300">
                                Sistema activo
                            </p>
                            <p className="mt-1 text-sm text-neutral-300">
                                Colector, matches, notificaciones y seguimiento.
                            </p>
                        </div>
                    </div>

                    <nav className="mt-6 space-y-2">
                        {navItems.map((item) => {
                            const active = isActivePath(pathname, item.href)

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`block rounded-2xl border px-4 py-3 transition ${active
                                            ? 'border-white/20 bg-white text-neutral-950 shadow-lg'
                                            : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.07]'
                                        }`}
                                >
                                    <p className="text-sm font-semibold">{item.label}</p>
                                    <p
                                        className={`mt-0.5 text-xs ${active ? 'text-neutral-600' : 'text-neutral-500'
                                            }`}
                                    >
                                        {item.helper}
                                    </p>
                                </Link>
                            )
                        })}
                    </nav>

                    <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                        <p className="text-sm font-semibold">Foco diario</p>
                        <p className="mt-2 text-sm text-neutral-400">
                            Revisa primero Acciones de hoy, luego Top Matches y finalmente Conversión.
                        </p>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/85 px-4 py-4 backdrop-blur md:px-6 lg:hidden">
                        <div className="flex items-center justify-between gap-3">
                            <Link href="/admin" className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-black text-neutral-950">
                                    JT
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Job Tracker</p>
                                    <p className="text-xs text-neutral-500">Admin</p>
                                </div>
                            </Link>

                            <Link
                                href="/admin/today"
                                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-neutral-300"
                            >
                                Hoy
                            </Link>
                        </div>

                        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                            {navItems.map((item) => {
                                const active = isActivePath(pathname, item.href)

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium ${active
                                                ? 'border-white bg-white text-neutral-950'
                                                : 'border-white/10 bg-white/[0.03] text-neutral-300'
                                            }`}
                                    >
                                        {item.label}
                                    </Link>
                                )
                            })}
                        </div>
                    </header>

                    <section className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_35%),radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_30%)]">
                        {children}
                    </section>
                </div>
            </div>
        </div>
    )
}