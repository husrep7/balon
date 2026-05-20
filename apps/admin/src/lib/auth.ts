import Keycloak, { type KeycloakConfig, type KeycloakInstance } from 'keycloak-js'

// Auth is tri-mode:
//   - keycloak: Keycloak SSO (VITE_KEYCLOAK_URL etc. set)
//   - local: email/password with local JWT stored in localStorage (default)
//   - dev: header-based (VITE_DEV_TENANT_ID set, skips login)

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL as string | undefined
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM as string | undefined
const KEYCLOAK_CLIENT = import.meta.env.VITE_KEYCLOAK_CLIENT as string | undefined

const useKeycloak = Boolean(KEYCLOAK_URL && KEYCLOAK_REALM && KEYCLOAK_CLIENT)
const useDev = Boolean(import.meta.env.VITE_DEV_TENANT_ID)

export type AuthMode = 'keycloak' | 'local' | 'dev'

const LOCAL_TOKEN_KEY = 'balon_admin_token'
const LOCAL_USER_KEY = 'balon_admin_user'

export interface LocalUser {
  id: string
  tenant_id: string
  email: string
  name: string
  role: string
}

let kc: KeycloakInstance | null = null

export async function initAuth(): Promise<{ authenticated: boolean; mode: AuthMode }> {
  if (useKeycloak) {
    const config: KeycloakConfig = {
      url: KEYCLOAK_URL!,
      realm: KEYCLOAK_REALM!,
      clientId: KEYCLOAK_CLIENT!,
    }
    kc = new Keycloak(config)
    const authenticated = await kc.init({
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    })
    return { authenticated, mode: 'keycloak' }
  }

  if (useDev) {
    return { authenticated: true, mode: 'dev' }
  }

  // Local JWT mode — check localStorage
  const token = localStorage.getItem(LOCAL_TOKEN_KEY)
  const user = localStorage.getItem(LOCAL_USER_KEY)
  return { authenticated: Boolean(token && user), mode: 'local' }
}

export async function loginLocal(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Greška pri prijavi')
  }
  const data = await res.json() as { token: string; user: LocalUser }
  localStorage.setItem(LOCAL_TOKEN_KEY, data.token)
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(data.user))
}

export function logoutLocal(): void {
  localStorage.removeItem(LOCAL_TOKEN_KEY)
  localStorage.removeItem(LOCAL_USER_KEY)
  window.location.reload()
}

export function loginRedirect(): void {
  if (kc) kc.login({ redirectUri: window.location.href })
}

export function logoutRedirect(): void {
  if (kc) kc.logout({ redirectUri: window.location.origin })
}

export async function getAccessToken(): Promise<string | null> {
  if (kc) {
    try {
      await kc.updateToken(30)
      return kc.token ?? null
    } catch {
      return null
    }
  }
  return localStorage.getItem(LOCAL_TOKEN_KEY)
}

export function getUserInfo(): { name: string; email: string; tenant: string } | null {
  if (kc?.tokenParsed) {
    const t = kc.tokenParsed as Record<string, unknown>
    return {
      name: (t.name as string) ?? (t.preferred_username as string) ?? '',
      email: (t.email as string) ?? '',
      tenant: (t.tenant_id as string) ?? '',
    }
  }
  const raw = localStorage.getItem(LOCAL_USER_KEY)
  if (raw) {
    const u = JSON.parse(raw) as LocalUser
    return { name: u.name, email: u.email, tenant: u.tenant_id }
  }
  return null
}

export function getDevTenantId(): string | undefined {
  return import.meta.env.VITE_DEV_TENANT_ID as string | undefined
}

export function getDevUserId(): string | undefined {
  return import.meta.env.VITE_DEV_USER_ID as string | undefined
}

export function getMode(): AuthMode {
  if (useKeycloak) return 'keycloak'
  if (useDev) return 'dev'
  return 'local'
}
