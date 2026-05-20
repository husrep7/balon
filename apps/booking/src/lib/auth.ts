const TOKEN_KEY = 'balon_customer_token'
const USER_KEY = 'balon_customer_user'

export interface CustomerUser {
  id: string
  email: string
  name: string
  phone?: string
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): CustomerUser | null {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? (JSON.parse(raw) as CustomerUser) : null
}

export function isAuthenticated(): boolean {
  return Boolean(getToken() && getUser())
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.location.reload()
}

export function saveSession(token: string, user: CustomerUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
