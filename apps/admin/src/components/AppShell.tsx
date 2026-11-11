import { useEffect, useState, type FormEvent } from 'react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { bs } from 'date-fns/locale'
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

  useEffect(() => {
    if (!show && dismissed) {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      if (nowMin >= targetH * 60 + targetM) setDismissed(false)
    }
  }, [show, dismissed, targetH, targetM])

  return { show, dismiss: () => setDismissed(true) }
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export type IconName =
  | 'home' | 'calendar' | 'list' | 'users' | 'team' | 'clock' | 'tag'
  | 'search' | 'plus' | 'logout' | 'menu' | 'collapse' | 'cash'

interface NavItem {
  to: string
  label: string
  icon: IconName
  hint?: string
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operativa',
    items: [
      { to: '/', label: 'Pregled', icon: 'home' },
      { to: '/calendar', label: 'Kalendar', icon: 'calendar' },
      { to: '/bookings', label: 'Rezervacije', icon: 'list' },
      { to: '/shifts', label: 'Smjene i kasa', icon: 'clock' },
    ],
  },
  {
    label: 'Klijenti',
    items: [
      { to: '/customers', label: 'Klijenti', icon: 'users' },
      { to: '/teams', label: 'Ekipe', icon: 'team' },
    ],
  },
  {
    label: 'Postavke',
    items: [{ to: '/pricing', label: 'Cjenovnik', icon: 'tag' }],
  },
]
const allItems = navGroups.flatMap((g) => g.items)

export function Icon({ name, className = 'w-[18px] h-[18px]' }: { name: IconName; className?: string }) {
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
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 14h3M13.5 14h3M7.5 17.5h3" />
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
          <path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.7 2.6 3 5.2" />
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
    case 'tag':
      return (
        <svg {...common}>
          <path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9-9-9Z" />
          <circle cx="8" cy="8" r="1.5" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...common}>
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
        </svg>
      )
    case 'menu':
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      )
    case 'collapse':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M9 4v16M15 10l-2 2 2 2" />
        </svg>
      )
    case 'cash':
      return (
        <svg {...common}>
          <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 9.5v5M18 9.5v5" />
        </svg>
      )
  }
}

const kmFmt = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const kmShort = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 })

function initials(name?: string) {
  if (!name) return 'B'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

const COLLAPSE_KEY = 'balon_admin_sidebar_collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const { location } = useRouterState()
  const navigate = useNavigate()
  const user = getUserInfo()
  const mode = getMode()
  const now = useNow()
  const { data: shift } = useOpenShift()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* storage unavailable */
      }
      return !c
    })
  }

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    navigate({ to: '/customers', search: { q } as never })
    setQuery('')
  }

  const secondShiftWarning = useShiftWarning(15, 30, 10, !!shift)
  const endOfDayWarning = useShiftWarning(23, 0, 10, !!shift)

  const current = allItems.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )

  const renderSidebar = (compact: boolean) => (
    <div className="h-full flex flex-col bg-surface border-r border-ink-200/80">
      {/* Brand */}
      <div className={clsx('h-16 shrink-0 flex items-center gap-2.5', compact ? 'justify-center' : 'px-5')}>
        <LogoMark className="w-8 h-8" />
        {!compact && (
          <div className="flex items-baseline gap-2 min-w-0">
            <Wordmark className="text-[21px]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">admin</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={clsx('flex-1 overflow-y-auto pb-4', compact ? 'px-2' : 'px-3')}>
        {navGroups.map((group) => (
          <div key={group.label} className="mt-4 first:mt-2">
            {!compact ? (
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                {group.label}
              </div>
            ) : (
              <div className="mx-3 mb-2 border-t border-ink-100" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item === current
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    title={compact ? item.label : undefined}
                    className={clsx(
                      'group flex items-center gap-3 h-10 rounded-xl text-sm transition-colors',
                      compact ? 'justify-center' : 'px-3',
                      active
                        ? 'bg-ink-900 text-white font-medium shadow-sm'
                        : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={clsx(
                        'w-[18px] h-[18px] shrink-0',
                        active ? 'text-lime-400' : 'text-ink-400 group-hover:text-ink-700',
                      )}
                    />
                    {!compact && <span className="flex-1 truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Shift widget */}
      {!compact && (
        <Link
          to="/shifts"
          className={clsx(
            'mx-3 mb-3 rounded-2xl p-3.5 ring-1 transition-colors block',
            shift ? 'bg-teal-50 ring-teal-200 hover:bg-teal-100/70' : 'bg-ink-50 ring-ink-200 hover:bg-ink-100',
          )}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex w-2 h-2">
              {shift && <span className="absolute inset-0 rounded-full bg-teal-500 animate-ping opacity-60" />}
              <span className={clsx('relative w-2 h-2 rounded-full', shift ? 'bg-teal-500' : 'bg-ink-300')} />
            </span>
            <span className={clsx('text-xs font-semibold', shift ? 'text-teal-800' : 'text-ink-600')}>
              {shift ? 'Smjena otvorena' : 'Smjena zatvorena'}
            </span>
          </div>
          {shift ? (
            <div className="mt-2">
              <div className="text-lg font-semibold text-ink-900 tabular leading-none">
                {kmFmt.format((shift.cash_collected_cents ?? 0) / 100)} KM
              </div>
              <div className="text-[11px] text-ink-500 mt-1">
                u kasi od {format(new Date(shift.opened_at), 'HH:mm')}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-ink-500 mt-1.5">Otvori smjenu prije prve naplate →</div>
          )}
        </Link>
      )}

      {/* User */}
      <div className={clsx('border-t border-ink-100 flex items-center gap-3 h-16 shrink-0', compact ? 'justify-center' : 'px-4')}>
        {!compact && (
          <>
            <div className="w-9 h-9 rounded-xl bg-ink-900 text-lime-400 text-xs font-bold flex items-center justify-center shrink-0">
              {initials(user?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink-900 font-medium truncate">{user?.name ?? 'Dev mode'}</div>
              <div className="text-[11px] text-ink-400 truncate">{user?.email ?? 'lokalni pristup'}</div>
            </div>
          </>
        )}
        <button
          onClick={mode === 'keycloak' ? logoutRedirect : logoutLocal}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors"
          title="Odjavi se"
          aria-label="Odjavi se"
        >
          <Icon name="logout" className="w-4 h-4" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex bg-surface-alt">
      {/* Sidebar — desktop */}
      <aside className={clsx('hidden lg:block shrink-0 transition-[width] duration-200', collapsed ? 'w-[76px]' : 'w-[248px]')}>
        {renderSidebar(collapsed)}
      </aside>

      {/* Sidebar — mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex animate-fade-in">
          <div className="w-[264px] shadow-pop">{renderSidebar(false)}</div>
          <button
            className="flex-1 bg-ink-950/40 backdrop-blur-[2px]"
            aria-label="Zatvori meni"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 bg-surface/85 backdrop-blur border-b border-ink-200/80 px-4 sm:px-6 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-ink-700 hover:bg-ink-100"
            aria-label="Otvori meni"
          >
            <Icon name="menu" className="w-5 h-5" />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hidden lg:flex w-9 h-9 -ml-2 rounded-lg items-center justify-center text-ink-400 hover:text-ink-800 hover:bg-ink-100"
            aria-label={collapsed ? 'Proširi meni' : 'Skupi meni'}
            title={collapsed ? 'Proširi meni' : 'Skupi meni'}
          >
            <Icon name="collapse" className="w-[18px] h-[18px]" />
          </button>

          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-900 leading-tight truncate">
              {current?.label ?? 'Balon'}
            </div>
            <div className="text-[11px] text-ink-400 leading-tight first-letter:uppercase tabular">
              {format(now, 'EEEE, d. MMMM · HH:mm', { locale: bs })}
            </div>
          </div>

          <form onSubmit={onSearch} className="hidden md:flex flex-1 justify-center px-4">
            <label className="relative w-full max-w-md">
              <span className="sr-only">Traži klijenta</span>
              <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                id="global-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Traži klijenta po imenu ili telefonu…"
                className="w-full h-10 pl-9 pr-3 text-sm rounded-xl bg-ink-50 border border-transparent placeholder-ink-400 text-ink-900 focus:outline-none focus:bg-surface focus:border-teal-500 focus:shadow-focus transition"
              />
            </label>
          </form>
          <div className="flex-1 md:hidden" />

          <Link
            to="/shifts"
            className={clsx(
              'hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-medium ring-1 transition-colors',
              shift ? 'bg-teal-50 text-teal-800 ring-teal-200 hover:bg-teal-100' : 'bg-surface text-ink-600 ring-ink-200 hover:bg-ink-50',
            )}
          >
            <span className={clsx('w-2 h-2 rounded-full', shift ? 'bg-teal-500' : 'bg-ink-300')} />
            {shift ? (
              <span className="tabular">{kmShort.format((shift.cash_collected_cents ?? 0) / 100)} KM u kasi</span>
            ) : (
              'Otvori smjenu'
            )}
          </Link>
          <Link
            to="/calendar"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-ink-900 text-white text-sm font-medium hover:bg-ink-800 transition-colors"
          >
            <Icon name="plus" className="w-4 h-4 text-lime-400" />
            <span className="hidden sm:inline">Nova rezervacija</span>
          </Link>
        </header>

        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <Outlet />
        </main>

        {(secondShiftWarning.show || endOfDayWarning.show) && (
          <div className="fixed bottom-6 right-6 z-50 w-[22rem] max-w-[calc(100vw-2rem)] bg-surface rounded-2xl shadow-pop ring-1 ring-amber-200 p-4 animate-pop-in">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Icon name="clock" className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-900">
                  {secondShiftWarning.show ? 'Za 10 minuta počinje druga smjena' : 'Za 10 minuta završava druga smjena'}
                </div>
                <div className="text-xs text-ink-500 mt-1 leading-relaxed">
                  {secondShiftWarning.show
                    ? 'Druga smjena počinje u 15:30. Zatvori prvu smjenu i predaj novac nadređenom.'
                    : 'Druga smjena završava u 23:00. Zatvori smjenu i predaj novac nadređenom.'}
                </div>
                <div className="flex gap-2 mt-3">
                  <Link
                    to="/shifts"
                    onClick={() => {
                      secondShiftWarning.dismiss()
                      endOfDayWarning.dismiss()
                    }}
                    className="h-8 px-3 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 inline-flex items-center font-semibold"
                  >
                    Idi na smjene →
                  </Link>
                  <button
                    onClick={() => {
                      secondShiftWarning.dismiss()
                      endOfDayWarning.dismiss()
                    }}
                    className="h-8 px-3 text-xs rounded-lg text-ink-600 hover:bg-ink-100"
                  >
                    Zatvori
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
