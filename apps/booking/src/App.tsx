import { useEffect, useState } from 'react'
import { Shell } from './components/Shell'
import { RescheduleModal } from './components/RescheduleModal'
import { Dashboard } from './pages/Dashboard'
import { NewBooking } from './pages/NewBooking'
import { Bookings } from './pages/Bookings'
import { Profile } from './pages/Profile'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { isAuthenticated } from './lib/auth'
import { useRoute } from './lib/router'
import type { Booking } from './lib/api'

export function App() {
  const [route, go] = useRoute()
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null)
  const authed = isAuthenticated()

  // Signed-out users only ever see the sign-in / sign-up screens.
  useEffect(() => {
    if (!authed && route !== 'login' && route !== 'register') go('login')
    if (authed && (route === 'login' || route === 'register')) go('home')
  }, [authed, route, go])

  function handleAuthSuccess() {
    window.location.hash = '#/'
    window.location.reload()
  }

  if (!authed) {
    return (
      <Shell route={route} onNav={go} showTabs={false}>
        {route === 'register' ? (
          <Register onSuccess={handleAuthSuccess} onLogin={() => go('login')} />
        ) : (
          <Login onSuccess={handleAuthSuccess} onRegister={() => go('register')} />
        )}
      </Shell>
    )
  }

  return (
    <Shell route={route} onNav={go} showTabs>
      {route === 'book' ? (
        <NewBooking onNav={go} />
      ) : route === 'bookings' ? (
        <Bookings onReschedule={setRescheduleBooking} onNav={go} />
      ) : route === 'profile' ? (
        <Profile />
      ) : (
        <Dashboard onNav={go} onReschedule={setRescheduleBooking} />
      )}
      {rescheduleBooking && <RescheduleModal booking={rescheduleBooking} onClose={() => setRescheduleBooking(null)} />}
    </Shell>
  )
}
