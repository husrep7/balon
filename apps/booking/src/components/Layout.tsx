import type { ReactNode } from 'react'
import { getUser, logout, isAuthenticated } from '../lib/auth'
import { TENANT_SLUG } from '../lib/api'

interface LayoutProps {
  children: ReactNode
  onNav: (page: string) => void
  page: string
}

export function Layout({ children, onNav, page }: LayoutProps) {
  const user = getUser()
  const auth = isAuthenticated()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => onNav('home')}
            className="font-serif text-2xl italic text-gray-800"
          >
            balon
          </button>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 uppercase tracking-wider">{TENANT_SLUG}</span>
            {auth ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onNav('bookings')}
                  className={`text-sm ${page === 'bookings' ? 'text-teal-700 font-medium' : 'text-gray-600 hover:text-gray-800'}`}
                >
                  Moje rezervacije
                </button>
                <div className="text-xs text-gray-500">{user?.name}</div>
                <button
                  onClick={logout}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Odjavi se
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNav('login')}
                  className={`text-sm ${page === 'login' ? 'text-teal-700 font-medium' : 'text-gray-600 hover:text-gray-800'}`}
                >
                  Prijava
                </button>
                <button
                  onClick={() => onNav('register')}
                  className="text-sm bg-teal-600 text-white px-3 py-1.5 rounded hover:bg-teal-700"
                >
                  Registracija
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {children}
      </main>
      <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-100">
        © balon — upravljanje sportskim terenima
      </footer>
    </div>
  )
}
