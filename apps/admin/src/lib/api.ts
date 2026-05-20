import { getAccessToken, getDevTenantId, getDevUserId } from './auth'
import type {
  Booking,
  Customer,
  Payment,
  PricingConditions,
  PricingQuote,
  PricingRule,
  PricingRulePatch,
  Resource,
  ShiftSession,
  Team,
  UUID,
} from './types'

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') + '/api/v1'

class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, msg?: string) {
    super(msg ?? `HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = await getAccessToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    // Dev fallback while Keycloak isn't wired up
    const t = getDevTenantId()
    const u = getDevUserId()
    if (t) headers['X-Tenant-ID'] = t
    if (u) headers['X-User-ID'] = u
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let payload: unknown
    try {
      payload = await res.json()
    } catch {
      payload = await res.text()
    }
    throw new ApiError(res.status, payload, `${method} ${path} failed`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export { ApiError }

// ---------- Resources ----------
export const resourceApi = {
  list: () => request<{ data: Resource[] }>('GET', '/resources'),
  get: (id: UUID) => request<Resource>('GET', `/resources/${id}`),
  create: (body: { kind: string; name: string; slug: string; parent_id?: UUID }) =>
    request<Resource>('POST', '/resources', body),
}

// ---------- Customers ----------
export const customerApi = {
  search: (q: string, limit = 20) =>
    request<{ data: Customer[] }>('GET', `/customers?q=${encodeURIComponent(q)}&limit=${limit}`),
  get: (id: UUID) => request<Customer>('GET', `/customers/${id}`),
  create: (body: { name: string; phone?: string; email?: string; tier?: string }) =>
    request<Customer>('POST', '/customers', body),
}

// ---------- Teams ----------
export const teamApi = {
  get: (id: UUID) => request<Team>('GET', `/teams/${id}`),
  create: (body: { name: string; captain_id?: UUID; primary_phone?: string }) =>
    request<Team>('POST', '/teams', body),
  addMember: (teamId: UUID, customerId: UUID, role?: string) =>
    request<void>('POST', `/teams/${teamId}/members`, { customer_id: customerId, role }),
}

// ---------- Bookings ----------
export const bookingApi = {
  listAll: (params?: { from?: string; to?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.from) q.set('from', params.from)
    if (params?.to) q.set('to', params.to)
    if (params?.status) q.set('status', params.status)
    return request<{ data: Booking[] }>('GET', `/bookings/all${q.toString() ? '?' + q.toString() : ''}`)
  },
  list: (resourceId: UUID, from: string, to: string, includeChildren = true) =>
    request<{ data: Booking[] }>(
      'GET',
      `/bookings?resource_id=${resourceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&include_children=${includeChildren}`,
    ),
  get: (id: UUID) => request<Booking>('GET', `/bookings/${id}`),
  listPayments: (id: UUID) =>
    request<{ data: Payment[] }>('GET', `/bookings/${id}/payments`),
  create: (body: {
    resource_id: UUID
    customer_id?: UUID
    team_id?: UUID
    start_at: string
    end_at: string
    price_cents?: number
    channel?: string
    notes?: string
  }) => request<Booking>('POST', '/bookings', body),
  reschedule: (id: UUID, body: { start_at?: string; end_at?: string; resource_id?: UUID }) =>
    request<Booking>('PATCH', `/bookings/${id}`, body),
  cancel: (id: UUID, reason?: string) =>
    request<void>('DELETE', `/bookings/${id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`),
  noShow: (id: UUID) => request<void>('POST', `/bookings/${id}/no-show`),
}

// ---------- Pricing ----------
export const pricingApi = {
  quote: (body: {
    resource_id: UUID
    start_at: string
    end_at: string
    customer_id?: UUID
    channel?: string
  }) => request<PricingQuote>('POST', '/pricing/quote', body),
  listRules: (includeInactive = false) =>
    request<{ data: PricingRule[] }>(
      'GET',
      `/pricing/rules${includeInactive ? '?include_inactive=true' : ''}`,
    ),
  createRule: (body: {
    name: string
    priority: number
    price_cents: number
    conditions: PricingConditions
    resource_id?: UUID
    active?: boolean
  }) => request<PricingRule>('POST', '/pricing/rules', body),
  updateRule: (id: UUID, patch: PricingRulePatch) =>
    request<PricingRule>('PATCH', `/pricing/rules/${id}`, patch),
  deleteRule: (id: UUID) => request<void>('DELETE', `/pricing/rules/${id}`),
}

// ---------- Shifts & Payments ----------
export const shiftApi = {
  getOpen: () => request<ShiftSession>('GET', '/shifts/open'),
  open: (opening_cash_cents: number) =>
    request<ShiftSession>('POST', '/shifts', { opening_cash_cents }),
  close: (id: UUID, body: { closing_cash_counted_cents: number; variance_explained?: string }) =>
    request<ShiftSession>('POST', `/shifts/${id}/close`, body),
  recordPayment: (
    shiftId: UUID,
    body: { booking_id?: UUID; amount_cents: number; method: string; card_terminal_ref?: string },
  ) =>
    request<Payment>('POST', `/shifts/${shiftId}/payments`, {
      shift_session_id: shiftId,
      ...body,
    }),
}

// ---------- Payments ----------
export const paymentApi = {
  void: (id: UUID, reason: string) =>
    request<void>('POST', `/payments/${id}/void`, { reason }),
}
