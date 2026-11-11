import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import type { Route } from '../lib/router'
import { Icon, type IconName } from './ui'

const TABS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'home', label: 'Početna', icon: 'home' },
  { route: 'book', label: 'Rezerviši', icon: 'plus' },
  { route: 'bookings', label: 'Termini', icon: 'calendar' },
  { route: 'profile', label: 'Profil', icon: 'user' },
]

/**
 * App frame. On a phone it is the whole screen; on a desktop it renders as a
 * phone-sized column so the layout matches the future native app.
 */
export function Shell({
  route,
  onNav,
  showTabs,
  children,
}: {
  route: Route
  onNav: (r: Route) => void
  showTabs: boolean
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-200/70 md:py-6">
      <div className="relative mx-auto max-w-[440px] min-h-screen md:min-h-[calc(100vh-3rem)] bg-app md:rounded-[36px] md:shadow-device md:[overflow:clip] flex flex-col">
        <main className="flex-1">{children}</main>

        {showTabs && (
          <nav
            className="fixed md:sticky bottom-0 inset-x-0 z-30 mx-auto w-full max-w-[440px] bg-white/90 backdrop-blur-xl border-t border-gray-200/80 pb-safe"
            aria-label="Glavni meni"
          >
            <div className="grid grid-cols-4 h-[58px]">
              {TABS.map((t) => {
                const active = route === t.route
                return (
                  <button
                    key={t.route}
                    onClick={() => onNav(t.route)}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex flex-col items-center justify-center gap-0.5 transition-colors active:opacity-60',
                      active ? 'text-teal-700' : 'text-gray-400',
                    )}
                  >
                    <Icon name={t.icon} className="w-[24px] h-[24px]" strokeWidth={active ? 2.2 : 1.8} />
                    <span className={clsx('text-[10.5px]', active ? 'font-semibold' : 'font-medium')}>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  )
}
