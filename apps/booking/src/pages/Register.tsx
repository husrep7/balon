import { useState } from 'react'
import { authApi } from '../lib/api'
import { AuthLayout } from '../components/AuthLayout'
import { Divider, GoogleButton } from '../components/Brand'

interface Props {
  onSuccess: () => void
  onLogin: () => void
}

export function Register({ onSuccess, onLogin }: Props) {
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 8) {
      setError('Lozinka mora imati najmanje 8 karaktera')
      return
    }
    setError('')
    setLoading(true)
    try {
      await authApi.register(form.email, form.password, form.name, form.phone)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri registraciji')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Napravi nalog"
      subtitle="Treba ti minut, a svi termini su ti na jednom mjestu."
      footer={
        <>
          Već imaš nalog?{' '}
          <button onClick={onLogin} className="text-teal-700 hover:text-teal-800 font-semibold">
            Prijavi se
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Ime i prezime</label>
          <input type="text" value={form.name} onChange={set('name')} placeholder="Ime Prezime" autoComplete="name" required className="field" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="ime@email.ba" autoComplete="email" required className="field" />
        </div>
        <div>
          <label className="label">Broj telefona</label>
          <input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="+387 61 000 000" autoComplete="tel" required className="field" />
        </div>
        <div>
          <label className="label">Lozinka</label>
          <input type="password" value={form.password} onChange={set('password')} placeholder="najmanje 8 karaktera" autoComplete="new-password" required minLength={8} className="field" />
        </div>
        {error && (
          <div className="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3">{error}</div>
        )}
        <button type="submit" disabled={loading} className="btn-primary !mt-6">
          {loading ? 'Registracija…' : 'Napravi nalog'}
        </button>
      </form>
      <Divider />
      <GoogleButton label="Registruj se s Google nalogom" />
    </AuthLayout>
  )
}
