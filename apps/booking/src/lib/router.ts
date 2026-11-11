import { useEffect, useState } from 'react'

// Minimal hash router: every screen has its own URL, so the phone's back
// button, refresh and shared links all behave like a native app.
export type Route = 'home' | 'book' | 'bookings' | 'profile' | 'login' | 'register'

const PATHS: Record<Route, string> = {
  home: '/',
  book: '/rezervisi',
  bookings: '/termini',
  profile: '/profil',
  login: '/prijava',
  register: '/registracija',
}

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  const hit = (Object.keys(PATHS) as Route[]).find((r) => PATHS[r] === path)
  return hit ?? 'home'
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))

  useEffect(() => {
    const onChange = () => {
      setRoute(parse(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  function go(r: Route) {
    const target = '#' + PATHS[r]
    if (window.location.hash !== target) window.location.hash = target
    else setRoute(r)
  }

  return [route, go]
}
