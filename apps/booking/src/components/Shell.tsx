import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUser, isAuthenticated } from '../lib/auth'
import { tenantApi } from '../lib/api'
import { LogoMark, Wordmark } from './Brand'

export type Page = 'dashboard' | 'bookings' | 'new-booking' | 'profile' | 'login' | 'register'

interface ShellProps {
  children: ReactNode
  page: Page
  onNav: (page: Page) => void
}

export function Shell({ children, page, onNav }: ShellProps) {
  const user = getUser()
  const auth = isAuthenticated()
  const isAuthPage = !auth || ['login', 'register'].includes(page)
  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.get, enabled: auth })

  const initials = (user?.name ?? '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="min-h-screen md:py-8 md:px-4 bg-gray-100 md:bg-[radial-gradient(ellipse_at_top,_#d9fbe6_0%,_#eceef2_45%)]">
      <div className="relative min-h-screen md:min-h-[calc(100vh-4rem)] bg-gray-50 flex flex-col max-w-lg mx-auto md:rounded-[2rem] md:shadow-lift md:ring-1 md:ring-gray-200/70 md:overflow-hidden">
        {!isAuthPage && (
          <header className="sticky top-0 z-20 bg-gray-50/80 backdrop-blur-xl border-b border-gray-200/60">
            <div className="px-5 h-16 flex items-center justify-between">
              <button onClick={() => onNav('dashboard')} className="flex items-center gap-2.5">
                <LogoMark className="w-8 h-8" />
                <div className="text-left">
                  <Wordmark className="text-xl block" />
                  {tenant && (
                    <span className="block text-[10px] font-medium text-gray-400 mt-0.5 truncate max-w-[160px]">
                      {tenant.name}
                    </span>
                  )}
                </div>
              </button>
              {user && (
                <button
                  onClick={() => onNav('profile')}
                  className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-700 text-white text-sm font-bold flex items-center justify-center shadow-glow"
                  aria-label="Profil"
                >
                  {initials || '•'}
                </button>
              )}
            </div>
          </header>
        )}

        <main className={`flex-1 ${isAuthPage ? '' : 'pb-32'}`}>{children}</main>

        {!isAuthPage && (
          <nav className="fixed md:absolute bottom-0 inset-x-0 z-30 max-w-lg mx-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="relative flex items-center h-16 rounded-[1.4rem] bg-gray-900 text-gray-400 shadow-nav px-2">
              <NavButton active={page === 'dashboard'} label="Početna" onClick={() => onNav('dashboard')}>
                <path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19v-8.5Z" />
              </NavButton>
              <div className="w-20 shrink-0 flex justify-center">
                <button
                  onClick={() => onNav('new-booking')}
                  className={`-mt-9 w-16 h-16 rounded-[1.3rem] flex items-center justify-center shadow-glow ring-4 ring-gray-50 transition-transform active:scale-95 ${
                    page === 'new-booking' ? 'bg-lime-400 text-gray-900' : 'bg-teal-500 text-white'
                  }`}
                  aria-label="Nova rezervacija"
                >
                  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
              <NavButton active={page === 'bookings'} label="Termini" onClick={() => onNav('bookings')}>
                <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
                <path d="M3.5 10h17M8 3v4M16 3v4" />
              </NavButton>
            </div>
          </nav>
        )}
      </div>
    </div>
  )
}

function NavButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${
        active ? 'text-white' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      <span className={`text-[10px] font-medium ${active ? 'text-lime-400' : ''}`}>{label}</span>
    </button>
  )
}
