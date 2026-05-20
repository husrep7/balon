import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'

import { AppShell } from '@/components/AppShell'
import { Dashboard } from '@/pages/Dashboard'
import { Customers } from '@/pages/Customers'
import { Shifts, Teams } from '@/pages/Placeholders'
import { Bookings } from '@/pages/Bookings'
import { Pricing } from '@/pages/Pricing'
import { Login } from '@/pages/Login'
import { initAuth } from '@/lib/auth'

import './styles.css'

const rootRoute = createRootRoute({
  component: AppShell,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
})

const customersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/customers',
  component: Customers,
})

const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams',
  component: Teams,
})

const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pricing',
  component: Pricing,
})

const shiftsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shifts',
  component: Shifts,
})

const bookingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/bookings',
  component: Bookings,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  bookingsRoute,
  customersRoute,
  teamsRoute,
  pricingRoute,
  shiftsRoute,
])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

async function bootstrap() {
  const { authenticated, mode } = await initAuth()
  const container = document.getElementById('root')!
  const root = createRoot(container)

  if ((mode === 'keycloak' || mode === 'local') && !authenticated) {
    root.render(<Login />)
    return
  }

  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}

bootstrap()
