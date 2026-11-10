import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { accountApi } from '../lib/api'
import { getUser, logout, saveSession } from '../lib/auth'
import { PitchLines } from '../components/Brand'

export function Profile() {
  const user = getUser()!
  const [tab, setTab] = useState<'info' | 'password'>('info')

  // Info form
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [infoMsg, setInfoMsg] = useState('')

  const updateProfile = useMutation({
    mutationFn: () => accountApi.update(name, phone),
    onSuccess: (acc) => {
      saveSession(localStorage.getItem('balon_customer_token')!, {
        ...user, name: acc.name, phone: acc.phone,
      })
      setInfoMsg('Profil ažuriran!')
      setTimeout(() => setInfoMsg(''), 3000)
    },
  })

  // Password form
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  const changePassword = useMutation({
    mutationFn: () => {
      if (pwForm.next !== pwForm.confirm) throw new Error('Lozinke se ne podudaraju')
      if (pwForm.next.length < 8) throw new Error('Nova lozinka mora imati najmanje 8 karaktera')
      return accountApi.changePassword(pwForm.current, pwForm.next)
    },
    onSuccess: () => {
      setPwMsg('Lozinka promijenjena!')
      setPwForm({ current: '', next: '', confirm: '' })
      setPwError('')
      setTimeout(() => setPwMsg(''), 3000)
    },
    onError: (e) => setPwError(e instanceof Error ? e.message : 'Greška'),
  })

  const initials = user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="px-5 pt-6">
      {/* Avatar */}
      <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 mb-6 flex items-center gap-4 shadow-lift">
        <PitchLines />
        <div className="pointer-events-none absolute -right-10 -top-16 w-48 h-48 rounded-full bg-teal-500/30 blur-3xl" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-700 flex items-center justify-center text-white text-xl font-bold shadow-glow">
          {initials}
        </div>
        <div className="relative min-w-0">
          <p className="text-xl font-display font-extrabold truncate">{user.name}</p>
          <p className="text-sm text-gray-400 truncate">{user.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 bg-gray-200/70 rounded-2xl p-1 mb-6">
        <button
          onClick={() => setTab('info')}
          className={`h-10 rounded-xl text-sm font-semibold transition-all ${tab === 'info' ? 'bg-white text-gray-900 shadow-card' : 'text-gray-500'}`}
        >
          Osnovni podaci
        </button>
        <button
          onClick={() => setTab('password')}
          className={`h-10 rounded-xl text-sm font-semibold transition-all ${tab === 'password' ? 'bg-white text-gray-900 shadow-card' : 'text-gray-500'}`}
        >
          Lozinka
        </button>
      </div>

      {tab === 'info' && (
        <form
          onSubmit={(e) => { e.preventDefault(); updateProfile.mutate() }}
          className="space-y-4"
        >
          <div>
            <label className="label">Ime i prezime</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="field"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="field !bg-gray-100 !text-gray-400 !shadow-none"
            />
          </div>
          <div>
            <label className="label">Broj telefona</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+387 61 000 000"
              className="field"
            />
          </div>
          {infoMsg && <p className="text-sm font-medium text-teal-700 bg-teal-50 ring-1 ring-teal-200 rounded-xl px-4 py-3">✓ {infoMsg}</p>}
          {updateProfile.error && (
            <p className="text-sm text-red-600">{updateProfile.error instanceof Error ? updateProfile.error.message : 'Greška'}</p>
          )}
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="btn-primary"
          >
            {updateProfile.isPending ? 'Spremam...' : 'Sačuvaj izmjene'}
          </button>
        </form>
      )}

      {tab === 'password' && (
        <form
          onSubmit={(e) => { e.preventDefault(); changePassword.mutate() }}
          className="space-y-4"
        >
          <div>
            <label className="label">Trenutna lozinka</label>
            <input
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
              required
              className="field"
            />
          </div>
          <div>
            <label className="label">Nova lozinka</label>
            <input
              type="password"
              value={pwForm.next}
              onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
              required
              minLength={8}
              placeholder="najmanje 8 karaktera"
              className="field"
            />
          </div>
          <div>
            <label className="label">Ponovi novu lozinku</label>
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
              required
              className="field"
            />
          </div>
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwMsg && <p className="text-sm font-medium text-teal-700 bg-teal-50 ring-1 ring-teal-200 rounded-xl px-4 py-3">✓ {pwMsg}</p>}
          <button
            type="submit"
            disabled={changePassword.isPending}
            className="btn-primary"
          >
            {changePassword.isPending ? 'Mijenjam...' : 'Promijeni lozinku'}
          </button>
        </form>
      )}

      {/* Logout */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={logout}
          className="w-full h-12 text-sm text-red-600 font-semibold bg-white ring-1 ring-red-200 rounded-2xl hover:bg-red-50 transition-colors"
        >
          Odjavi se
        </button>
      </div>
    </div>
  )
}
