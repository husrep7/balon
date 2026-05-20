import type { ReactNode } from 'react'
import { getUser, isAuthenticated } from '../lib/auth'
import { TENANT_SLUG } from '../lib/api'

export type Page = 'dashboard' | 'bookings' | 'new-booking' | 'profile' | 'login' | 'register'

interface ShellProps {
  children: ReactNode
  page: Page
  onNav: (page: Page) => void
}

const NAV = [
  { page: 'dashboard' as Page, label: 'Početna', icon: HomeIcon },
  { page: 'bookings' as Page, label: 'Termini', icon: CalendarIcon },
  { page: 'profile' as Page, label: 'Profil', icon: UserIcon },
]

export function Shell({ children, page, onNav }: ShellProps) {
  const user = getUser()
  const auth = isAuthenticated()
  const showNav = auth && !['login', 'register'].includes(page)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 h-12 flex items-center justify-between sticky top-0 z-20">
        <button onClick={() => onNav('dashboard')} className="font-serif text-xl italic text-gray-800">
          balon
        </button>
        <span className="text-xs text-gray-400 uppercase tracking-wider">{TENANT_SLUG}</span>
        {user && (
          <span className="text-xs text-gray-500 truncate max-w-[120px]">{user.name}</span>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom nav */}
      {showNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-200 flex items-end z-20">
          {NAV.map(({ page: navPage, label, icon: Icon }) => {
            const active = page === navPage
            return (
              <button
                key={navPage}
                onClick={() => onNav(navPage)}
                className="flex-1 flex flex-col items-center py-2 gap-0.5"
              >
                <Icon className={`w-5 h-5 ${active ? 'text-teal-600' : 'text-gray-400'}`} />
                <span className={`text-[10px] ${active ? 'text-teal-600 font-medium' : 'text-gray-400'}`}>
                  {label}
                </span>
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}

// Inline icons
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 12 2-2m0 0 7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11 2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6" />
    </svg>
  )
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
    </svg>
  )
}
function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  )
}
