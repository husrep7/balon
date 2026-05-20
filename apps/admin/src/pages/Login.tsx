import { useState } from 'react'
import { Button, Input } from '@/components/ui'
import { loginRedirect, loginLocal, getMode } from '@/lib/auth'

export function Login() {
  const mode = getMode()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginLocal(email, password)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri prijavi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-alt">
      <div className="w-full max-w-sm p-8 bg-surface border border-ink-200 rounded-lg">
        <div className="text-center mb-8">
          <div className="font-serif text-4xl italic text-ink-800 leading-none">balon</div>
          <div className="text-[10px] tracking-widest uppercase text-ink-400 mt-2">admin</div>
        </div>

        {mode === 'keycloak' ? (
          <>
            <p className="text-sm text-ink-600 text-center mb-4">
              Prijavi se kroz Keycloak da pristupiš admin panelu.
            </p>
            <Button variant="primary" className="w-full" onClick={loginRedirect}>
              Prijavi se
            </Button>
          </>
        ) : mode === 'dev' ? (
          <p className="text-sm text-ink-500 text-center">
            Dev mode aktivan. Postavi <code className="kbd">VITE_KEYCLOAK_*</code> env vars za production auth.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-ink-600">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@demo.local"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-ink-600">Lozinka</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}
            <Button variant="primary" className="w-full" type="submit" disabled={loading}>
              {loading ? 'Prijava...' : 'Prijavi se'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
