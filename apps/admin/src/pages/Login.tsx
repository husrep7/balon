import { useState } from 'react'
import { Button, Field, Input, LogoMark, Wordmark } from '@/components/ui'
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
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-surface">
      {/* Brand panel */}
      <div className="hidden lg:flex relative overflow-hidden bg-ink-900 text-white p-12 flex-col justify-between">
        <div className="pointer-events-none absolute -left-32 -top-32 w-[28rem] h-[28rem] rounded-full bg-teal-500/25 blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-0 w-[22rem] h-[22rem] rounded-full bg-lime-400/10 blur-3xl" />
        <svg
          className="pointer-events-none absolute inset-0 w-full h-full text-white/[0.05]"
          viewBox="0 0 600 800"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <rect x="60" y="60" width="480" height="680" rx="8" />
          <path d="M60 400h480" />
          <circle cx="300" cy="400" r="80" />
          <circle cx="300" cy="400" r="5" fill="currentColor" />
          <rect x="180" y="60" width="240" height="110" />
          <rect x="180" y="630" width="240" height="110" />
        </svg>

        <div className="relative flex items-center gap-3">
          <LogoMark className="w-10 h-10" />
          <Wordmark tone="light" className="text-3xl" />
        </div>

        <div className="relative max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lime-400">Admin panel</p>
          <h1 className="mt-4 text-5xl font-extrabold leading-[1.05]">
            Teren, termini i&nbsp;naplata na jednom mjestu.
          </h1>
          <p className="mt-5 text-ink-400 text-base leading-relaxed">
            Kalendar rezervacija, smjene, klijenti i ekipe, sve što ti treba za vođenje balona.
          </p>
        </div>

        <div className="relative flex items-center gap-6 text-xs text-ink-500">
          <span className="inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" /> Rezervacije u realnom vremenu
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-lime-400" /> Pregled smjena i prihoda
          </span>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-surface-alt lg:bg-surface">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <LogoMark className="w-9 h-9" />
            <Wordmark className="text-2xl" />
          </div>

          <h2 className="font-display text-3xl font-bold text-ink-900">Dobro došao nazad</h2>
          <p className="text-sm text-ink-500 mt-2 mb-8">Prijavi se da upravljaš terenom.</p>

          {mode === 'keycloak' ? (
            <Button variant="primary" size="lg" className="w-full" onClick={loginRedirect}>
              Prijavi se
            </Button>
          ) : mode === 'dev' ? (
            <p className="text-sm text-ink-500">
              Dev mode aktivan. Postavi <code className="kbd">VITE_KEYCLOAK_*</code> env vars za production auth.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ime@balon.ba"
                  autoComplete="email"
                  required
                  autoFocus
                  className="h-11"
                />
              </Field>
              <Field label="Lozinka">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="h-11"
                />
              </Field>
              {error && (
                <p className="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-3.5 py-2.5">
                  {error}
                </p>
              )}
              <Button variant="primary" size="lg" className="w-full !h-12 text-base" type="submit" disabled={loading}>
                {loading ? 'Prijava…' : 'Prijavi se'}
              </Button>
            </form>
          )}

          <p className="mt-10 text-xs text-ink-400">© {new Date().getFullYear()} balon · upravljanje sportskim terenima</p>
        </div>
      </div>
    </div>
  )
}
