import { useState } from 'react'
import { authApi } from '../lib/api'

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
    <div className="max-w-sm mx-auto">
      <h1 className="text-xl font-semibold text-gray-800 mb-6">Registracija</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ime i prezime</label>
          <input
            type="text"
            value={form.name}
            onChange={set('name')}
            placeholder="Ime Prezime"
            required
            autoFocus
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="vas@email.ba"
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Broj telefona</label>
          <input
            type="tel"
            value={form.phone}
            onChange={set('phone')}
            placeholder="+387 61 000 000"
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lozinka</label>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            placeholder="najmanje 8 karaktera"
            required
            minLength={8}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-teal-600 text-white py-2 rounded-md text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? 'Registracija...' : 'Registruj se'}
        </button>
      </form>
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs text-gray-400">
          <span className="bg-white px-2">ili</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.location.href = `${(import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')}/api/auth/google`}
        className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-md py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-4z"/>
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.5 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.7-2.9-11.9-7.2l-6.6 5.1C9.5 39.5 16.3 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.9 6l6.2 5.2C40.5 35.6 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/>
        </svg>
        Registruj se putem Google
      </button>

      <p className="mt-4 text-center text-sm text-gray-500">
        Već imaš nalog?{' '}
        <button onClick={onLogin} className="text-teal-600 hover:text-teal-700 font-medium">
          Prijavi se
        </button>
      </p>
    </div>
  )
}
