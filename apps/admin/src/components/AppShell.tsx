import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { getUserInfo, logoutRedirect, logoutLocal, getMode } from '@/lib/auth'
import { useOpenShift } from '@/hooks'
import { fmtMoney } from '@/lib/time'

interface NavItem {
  to: string
  label: string
  hint?: string
}

const nav: NavItem[] = [
  { to: '/', label: 'Kalendar', hint: 'K' },
  { to: '/bookings', label: 'Rezervacije' },
  { to: '/customers', label: 'Mušterije' },
  { to: '/teams', label: 'Ekipe' },
  { to: '/pricing', label: 'Cjenovnik' },
  { to: '/shifts', label: 'Smjene' },
]

export function AppShell() {
  const { location } = useRouterState()
  const user = getUserInfo()
  const mode = getMode()
  const { data: shift } = useOpenShift()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-[200px] bg-ink-800 text-ink-200 flex flex-col">
        <div className="px-5 py-5">
          <div className="font-serif text-2xl italic text-surface leading-none">balon</div>
          <div className="text-[10px] tracking-widest uppercase text-ink-400 mt-1">admin</div>
        </div>

        <nav className="flex-1 px-2">
          {nav.map((item) => {
            const active =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={clsx(
                  'flex items-center justify-between px-3 py-2 rounded text-sm',
                  active
                    ? 'bg-ink-700 text-surface'
                    : 'text-ink-300 hover:bg-ink-700/50 hover:text-surface',
                )}
              >
                <span>{item.label}</span>
                {item.hint && <span className="kbd !bg-ink-700 !text-ink-300 !border-ink-600">{item.hint}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-3 border-t border-ink-700 text-xs">
          {user ? (
            <>
              <div className="text-ink-200 truncate">{user.name}</div>
              <div className="text-ink-400 text-[11px] truncate">{user.email}</div>
            </>
          ) : (
            <div className="text-ink-400">dev mode</div>
          )}
          {(mode === 'keycloak' || mode === 'local') && (
            <button
              onClick={mode === 'keycloak' ? logoutRedirect : logoutLocal}
              className="mt-2 text-[11px] text-ink-300 hover:text-surface"
            >
              odjavi se
            </button>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col bg-surface-alt min-w-0">
        <Outlet />

        {/* Shift bar - persistent */}
        <div className="border-t border-ink-200 bg-surface px-5 py-2.5 flex items-center gap-4 text-xs">
          {shift ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                <span className="font-medium text-ink-700">Smjena otvorena</span>
              </span>
              <span className="text-ink-500">
                početni keš {fmtMoney(shift.opening_cash_cents)} · otvorena u{' '}
                {new Date(shift.opened_at).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="flex-1" />
              <Link to="/shifts" className="text-teal-700 hover:text-teal-800 font-medium">
                Zatvori smjenu →
              </Link>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-300" />
                <span className="text-ink-500">Nema otvorene smjene</span>
              </span>
              <span className="flex-1" />
              <Link to="/shifts" className="text-teal-700 hover:text-teal-800 font-medium">
                Otvori smjenu →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
