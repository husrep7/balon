import { getToken, saveSession, type CustomerUser } from './auth'

const TENANT_SLUG = (import.meta.env.VITE_TENANT_SLUG as string | undefined) ?? 'demo'
export { TENANT_SLUG }

export const API_BASE_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(status: number, msg: string) {
    super(msg)
    this.status = status
  }
}

async function req<T>(method: string, path: string, body?: unknown, auth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (!token) throw new ApiError(401, 'Nisi prijavljen')
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(API_BASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && auth) {
    // Session expired: drop it and send the user to sign in again.
    localStorage.removeItem('balon_customer_token')
    localStorage.removeItem('balon_customer_user')
    window.location.hash = '#/prijava'
    window.location.reload()
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------- Types ----------

export interface Tenant {
  id: string; slug: string; name: string; timezone: string; currency: string
}

export interface Resource {
  id: string; kind: string; name: string; slug: string; parent_id?: string
}

export interface Booking {
  id: string
  resource_id: string
  start_at: string
  end_at: string
  status: 'confirmed' | 'cancelled' | 'no_show' | 'completed'
  price_cents: number
  channel: string
  notes?: string
  created_at: string
}

export interface AccountInfo {
  id: string; email: string; name: string; phone: string
}

// ---------- Public ----------

export const tenantApi = {
  get: () => req<Tenant>('GET', `/api/public/tenants/${TENANT_SLUG}`),
  resources: () => req<{ data: Resource[] }>('GET', `/api/public/tenants/${TENANT_SLUG}/resources`),
  availability: (resourceId: string, from: string, to: string) =>
    req<{ data: Booking[] }>(
      'GET',
      `/api/public/tenants/${TENANT_SLUG}/availability?resource_id=${resourceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  pricingQuote: (resourceId: string, startAt: string, endAt: string) =>
    req<{ price_cents: number; regular_cents?: number }>(
      'GET',
      `/api/public/tenants/${TENANT_SLUG}/pricing-quote?resource_id=${resourceId}&start_at=${encodeURIComponent(startAt)}&end_at=${encodeURIComponent(endAt)}`,
    ),
}

// ---------- Auth ----------

export const authApi = {
  register: async (email: string, password: string, name: string, phone?: string) => {
    const data = await req<{ token: string; user: CustomerUser }>('POST', '/api/auth/customer/register', {
      email, password, name, phone: phone ?? '',
    })
    saveSession(data.token, data.user)
    return data.user
  },
  login: async (email: string, password: string) => {
    const data = await req<{ token: string; user: CustomerUser }>('POST', '/api/auth/customer/login', {
      email, password,
    })
    saveSession(data.token, data.user)
    return data.user
  },
}

// ---------- Account ----------

export const accountApi = {
  me: () => req<AccountInfo>('GET', '/api/customer/me', undefined, true),
  update: (name: string, phone: string) =>
    req<AccountInfo>('PATCH', '/api/customer/me', { name, phone }, true),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<void>('POST', '/api/customer/change-password', { current_password: currentPassword, new_password: newPassword }, true),
}

// ---------- Bookings ----------

export const bookingApi = {
  list: () =>
    req<{ data: Booking[] }>('GET', `/api/customer/tenants/${TENANT_SLUG}/bookings`, undefined, true),
  create: (resourceId: string, startAt: string, endAt: string, notes?: string, paymentPreference?: string, phone?: string) =>
    req<Booking>('POST', `/api/customer/tenants/${TENANT_SLUG}/bookings`, {
      resource_id: resourceId, start_at: startAt, end_at: endAt,
      notes: notes ?? '', payment_preference: paymentPreference ?? '',
      phone: phone ?? '',
    }, true),
  cancel: (id: string) =>
    req<void>('DELETE', `/api/customer/tenants/${TENANT_SLUG}/bookings/${id}`, undefined, true),
  reschedule: (id: string, startAt: string, endAt: string) =>
    req<Booking>('PATCH', `/api/customer/tenants/${TENANT_SLUG}/bookings/${id}`, {
      start_at: startAt, end_at: endAt,
    }, true),
}
