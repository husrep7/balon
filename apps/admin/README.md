# Balon Admin

React + Vite + TypeScript admin panel za operatere balona.

## Stack

- React 18 + TypeScript
- Vite (build + dev server)
- TanStack Router (kod-bazirani, type-safe)
- TanStack Query (server state)
- Tailwind CSS v3 (custom warm theme)
- keycloak-js (production auth, dev fallback na X-Tenant-ID header)

## Dev

```bash
cd apps/admin
npm install
cp .env.example .env

# Popuni VITE_DEV_TENANT_ID iz baze:
#   psql ... -c "SELECT id FROM tenants WHERE slug='demo';"
# I VITE_DEV_USER_ID:
#   psql ... -c "SELECT id FROM users WHERE email='admin@demo.local';"

npm run dev
# http://localhost:5173
```

Vite proxy forward-uje `/api/*` na backend (default `http://localhost:8080`).

## Build

```bash
npm run build
# dist/ je statički, može se servirati sa bilo kojim CDN/Nginx/Caddy
```

## Struktura

```
src/
├── main.tsx              entry, auth bootstrap, router setup
├── styles.css            Tailwind + global rules
├── lib/
│   ├── api.ts            typed REST client sa auth header injection
│   ├── auth.ts           Keycloak setup + dev fallback
│   ├── time.ts           date/money utilities
│   └── types.ts          TS tipovi koji odgovaraju Go domain modelima
├── hooks/
│   └── index.ts          TanStack Query hooks (useBookings, useShift...)
├── components/
│   ├── AppShell.tsx      sidebar + shift bar
│   ├── ui/index.tsx      Button, Input, Modal, Badge
│   └── Calendar/
│       ├── WeekView.tsx       glavni kalendar
│       └── BookingDetail.tsx  side panel za selected booking
└── pages/
    ├── Dashboard.tsx     kalendar view
    ├── Customers.tsx     search + list pattern
    ├── Placeholders.tsx  Pricing, Teams, Shifts (TODO)
    └── Login.tsx         Keycloak login redirect
```

## Šta još fali (Phase 1 todo)

- Booking create modal sa pricing quote preview
- Drag-to-reschedule sa konflikt feedback-om
- Shift open/close flow sa numeric pad za brojanje keša
- Pricing rules editor (form-based, ne raw JSON)
- Team CRUD
- Recurring booking dialog
