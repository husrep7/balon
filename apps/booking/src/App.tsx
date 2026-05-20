import { useState } from 'react'
import { Shell, type Page } from './components/Shell'
import { RescheduleModal } from './components/RescheduleModal'
import { Dashboard } from './pages/Dashboard'
import { NewBooking } from './pages/NewBooking'
import { Bookings } from './pages/Bookings'
import { Profile } from './pages/Profile'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { isAuthenticated } from './lib/auth'
import type { Booking } from './lib/api'

export function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null)

  function nav(p: Page) {
    // Redirect to login if trying to access protected pages
    if (!isAuthenticated() && !['login', 'register'].includes(p)) {
      setPage('login')
      return
    }
    setPage(p)
  }

  function handleAuthSuccess() {
    window.location.reload()
  }

  function renderPage() {
    if (!isAuthenticated()) {
      if (page === 'register') {
        return <Register onSuccess={handleAuthSuccess} onLogin={() => setPage('login')} />
      }
      return <Login onSuccess={handleAuthSuccess} onRegister={() => setPage('register')} />
    }

    switch (page) {
      case 'dashboard':
        return <Dashboard onNav={nav} onReschedule={setRescheduleBooking} />
      case 'bookings':
        return <Bookings onReschedule={setRescheduleBooking} />
      case 'new-booking':
        return <NewBooking onNav={nav} />
      case 'profile':
        return <Profile />
      default:
        return <Dashboard onNav={nav} onReschedule={setRescheduleBooking} />
    }
  }

  return (
    <Shell page={page} onNav={nav}>
      {renderPage()}
      {rescheduleBooking && (
        <RescheduleModal booking={rescheduleBooking} onClose={() => setRescheduleBooking(null)} />
      )}
    </Shell>
  )
}
