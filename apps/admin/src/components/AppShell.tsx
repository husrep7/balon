import { useEffect, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { getUserInfo, logoutRedirect, logoutLocal, getMode } from '@/lib/auth'
import { useOpenShift } from '@/hooks'
import { LogoMark, Wordmark } from '@/components/ui'

// Returns true when current time is within `minutesBefore` minutes of hh:mm
function useShiftWarning(targetH: number, targetM: number, minutesBefore: number, active: boolean) {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!active) return
    function check() {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const targetMin = targetH * 60 + targetM
      const inWindow = nowMin >= targetMin - minutesBefore && nowMin < targetMin
      setShow(inWindow && !dismissed)
    }
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [targetH, targetM, minutesBefore, active, dismissed])

  // Reset dismiss when window passes
  useEffect(() => {
    if (!show && dismissed) {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const targetMin = targetH * 60 + targetM
      if (nowMin >= targetMin) setDismissed(false)
    }
  }, [show, dismissed, targetH, targetM])

  return { show, dismiss: () => setDismissed(true) }
}

type IconName = 'home' | 'calendar' | 'list' | 'users' | 'team' | 'clock'

interface NavItem {
  to: string
  label: string
  icon: IconName
  hint?: string
}

const nav: NavItem[] = [
  { to: '/', label: 'Pregled', icon: 'home' },
  { to: '/calendar', label: 'Kalendar', icon: 'calendar', hint: 'K' },
  { to: '/bookings', label: 'Rezervacije', icon: 'list' },
  { to: '/customers', label: 'Klijenti', icon: 'users' },
  { to: '/teams', label: 'Ekipe', icon: 'team' },
  { to: '/shifts', label: 'Smjene', icon: 'clock' },
]

function NavIcon({ name, className = 'w-[18px] h-[18px]' }: { name: IconName; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="2" />
          <rect x="14" y="3" width="7" height="5" rx="2" />
          <rect x="14" y="12" width="7" height="9" rx="2" />
          <rect x="3" y="16" width="7" height="5" rx="2" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
          <path d="M7.5 14h3M13.5 14h3M7.5 17.5h3" />
        </svg>
      )
    case 'list':
      return (
        <svg {...common}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <circle cx="4.5" cy="6" r="1" />
          <circle cx="4.5" cy="12" r="1" />
          <circle cx="4.5" cy="18" r="1" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
          <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.7 2.6 3 5.2" />
        </svg>
      )
    case 'team':
      return (
        <svg {...common}>
          <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
  }
}

function initials(name?: string) {
  if (!name) return 'B'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function AppShell() {
  const { location } = useRouterState()
  const user = getUserInfo()
  const mode = getMode()
  const { data: shift } = useOpenShift()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close the mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Warn 10 min before second shift (15:30) and before end of day (23:00)
  const secondShiftWarning = useShiftWarning(15, 30, 10, !!shift)
  const endOfDayWarning = useShiftWarning(23, 0, 10, !!shift)

  const current = nav.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )

  const sidebar = (
    <div className="h-full flex flex-col bg-ink-900 text-ink-300 relative overflow-hidden">
      {/* Subtle pitch glow */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-teal-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-teal-900/20 to-transparent" />

      <div className="relative px-5 pt-6 pb-7 flex items-center gap-2.5">
        <LogoMark className="w-9 h-9 drop-shadow" />
        <div>
          <Wordmark tone="light" className="text-[22px]" />
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-500 mt-1">
            Admin panel
          </div>
        </div>
      </div>

      <div className="relative px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
        Meni
      </div>
      <nav className="relative flex-1 px-3 space-y-0.5">
        {nav.map((item) => {
          const active = item === current
          return (
            <Link
              key={item.to}
              to={item.to}
              className={clsx(
                'group relative flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition-colors',
                active
                  ? 'bg-white/[0.08] text-white font-medium'
                  : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-100',
              )}
            >
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-lime-400" />
              )}
              <NavIcon
                name={item.icon}
                className={clsx(
                  'w-[18px] h-[18px] shrink-0',
                  active ? 'text-lime-400' : 'text-ink-500 group-hover:text-ink-300',
                )}
              />
              <span className="flex-1">{item.label}</span>
              {item.hint && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/5 text-ink-500 border border-white/5">
                  {item.hint}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="relative m-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-teal-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
            {initials(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            {user ? (
              <>
                <div className="text-sm text-ink-100 font-medium truncate">{user.name}</div>
                <div className="text-[11px] text-ink-500 truncate">{user.email}</div>
              </>
            ) : (
              <div className="text-sm text-ink-400">Dev mode</div>
            )}
          </div>
          <button
            onClick={mode === 'keycloak' ? logoutRedirect : logoutLocal}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:text-white hover:bg-white/10 transition-colors"
            title="Odjavi se"
            aria-label="Odjavi se"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex bg-surface-alt">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:block w-[248px] shrink-0">{sidebar}</aside>

      {/* Sidebar — mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex animate-fade-in">
          <div className="w-[264px] shadow-pop">{sidebar}</div>
          <button
            className="flex-1 bg-ink-950/50 backdrop-blur-[2px]"
            aria-label="Zatvori meni"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden h-14 shrink-0 bg-surface border-b border-ink-200 px-4 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-ink-700 hover:bg-ink-100"
            aria-label="Otvori meni"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </button>
          <LogoMark className="w-7 h-7" />
          <span className="font-semibold text-ink-900 text-sm">{current?.label ?? 'Balon'}</span>
        </header>

        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <Outlet />
        </main>

        {/* Shift change warning popup */}
        {(secondShiftWarning.show || endOfDayWarning.show) && (
          <div className="fixed bottom-20 right-6 z-50 w-[22rem] bg-surface rounded-2xl shadow-pop ring-1 ring-amber-200 p-4 animate-pop-in">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <NavIcon name="clock" className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-900">
                  {secondShiftWarning.show
                    ? 'Za 10 minuta počinje druga smjena'
                    : 'Za 10 minuta završava druga smjena'}
                </div>
                <div className="text-xs text-ink-500 mt-1 leading-relaxed">
                  {secondShiftWarning.show
                    ? 'Druga smjena počinje u 15:30. Zatvori prvu smjenu i predaj novac nadređenom.'
                    : 'Druga smjena završava u 23:00. Zatvori smjenu i predaj novac nadređenom.'}
                </div>
                <div className="flex gap-2 mt-3">
                  <Link
                    to="/shifts"
                    onClick={() => { secondShiftWarning.dismiss(); endOfDayWarning.dismiss() }}
                    className="h-8 px-3 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 inline-flex items-center font-semibold"
                  >
                    Idi na smjene →
                  </Link>
                  <button
                    onClick={() => { secondShiftWarning.dismiss(); endOfDayWarning.dismiss() }}
                    className="h-8 px-3 text-xs rounded-lg text-ink-600 hover:bg-ink-100"
                  >
                    Zatvori
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shift bar - persistent */}
        <div className="shrink-0 border-t border-ink-200 bg-surface/90 backdrop-blur px-4 sm:px-6 h-12 flex items-center gap-4 text-xs">
          {shift ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 ring-1 ring-teal-200 px-2.5 py-1">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-teal-500 animate-ping opacity-60" />
                  <span className="relative w-2 h-2 rounded-full bg-teal-500" />
                </span>
                <span className="font-semibold text-teal-800">Smjena otvorena</span>
              </span>
              <span className="hidden sm:inline text-ink-500">
                od{' '}
                {new Date(shift.opened_at).toLocaleTimeString('sr-Latn-BA', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-ink-900 font-semibold tabular">
                {((shift.cash_collected_cents ?? 0) / 100).toFixed(2)} KM
                <span className="text-ink-400 font-normal"> naplaćeno</span>
              </span>
              <span className="flex-1" />
              <Link to="/shifts" className="text-teal-700 hover:text-teal-800 font-semibold">
                Zatvori smjenu →
              </Link>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 rounded-full bg-ink-100 px-2.5 py-1">
                <span className="w-2 h-2 rounded-full bg-ink-300" />
                <span className="text-ink-600 font-medium">Nema otvorene smjene</span>
              </span>
              <span className="flex-1" />
              <Link to="/shifts" className="text-teal-700 hover:text-teal-800 font-semibold">
                Otvori smjenu →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
