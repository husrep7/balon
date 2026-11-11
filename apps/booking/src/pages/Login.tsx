import { useState, useEffect } from 'react'
import { authApi } from '../lib/api'
import { saveSession } from '../lib/auth'
import { AuthLayout } from '../components/AuthLayout'
import { Divider, GoogleButton } from '../components/Brand'

interface Props {
  onSuccess: () => void
  onRegister: () => void
}

export function Login({ onSuccess, onRegister }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Handle Google OAuth redirect (?token=...&name=...&email=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const name = params.get('name')
    const emailParam = params.get('email')
    if (token && name && emailParam) {
      saveSession(token, { id: '', email: emailParam, name })
      window.history.replaceState({}, '', window.location.pathname)
      onSuccess()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.login(email, password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri prijavi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Prijavi se"
      subtitle="Rezerviši teren za par sekundi i prati svoje termine."
      footer={
        <>
          Nemaš nalog?{' '}
          <button onClick={onRegister} className="text-teal-700 hover:text-teal-800 font-semibold">
            Registruj se
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ime@email.ba"
            autoComplete="email"
            required
            className="field"
          />
        </div>
        <div>
          <label className="label">Lozinka</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            className="field"
          />
        </div>
        {error && (
          <div className="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}
        <button type="submit" disabled={loading} className="btn-primary !mt-6">
          {loading ? 'Prijavljivanje…' : 'Prijavi se'}
        </button>
      </form>
      <Divider />
      <GoogleButton label="Nastavi s Google nalogom" />
    </AuthLayout>
  )
}
