import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { accountApi } from '../lib/api'
import { getUser, logout, saveSession } from '../lib/auth'

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
    <div className="px-4 py-5">
      {/* Avatar */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-16 h-16 rounded-full bg-teal-600 flex items-center justify-center text-white text-xl font-bold">
          {initials}
        </div>
        <p className="text-base font-semibold text-gray-800 mt-2">{user.name}</p>
        <p className="text-sm text-gray-500">{user.email}</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
        <button
          onClick={() => setTab('info')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'info' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
        >
          Osnovni podaci
        </button>
        <button
          onClick={() => setTab('password')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'password' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
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
            <label className="text-xs font-medium text-gray-600 block mb-1">Ime i prezime</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Broj telefona</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+387 61 000 000"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          {infoMsg && <p className="text-sm text-teal-600">{infoMsg}</p>}
          {updateProfile.error && (
            <p className="text-sm text-red-600">{updateProfile.error instanceof Error ? updateProfile.error.message : 'Greška'}</p>
          )}
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="w-full bg-teal-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
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
            <label className="text-xs font-medium text-gray-600 block mb-1">Trenutna lozinka</label>
            <input
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
              required
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nova lozinka</label>
            <input
              type="password"
              value={pwForm.next}
              onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
              required
              minLength={8}
              placeholder="najmanje 8 karaktera"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Ponovi novu lozinku</label>
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
              required
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwMsg && <p className="text-sm text-teal-600">{pwMsg}</p>}
          <button
            type="submit"
            disabled={changePassword.isPending}
            className="w-full bg-teal-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            {changePassword.isPending ? 'Mijenjam...' : 'Promijeni lozinku'}
          </button>
        </form>
      )}

      {/* Logout */}
      <div className="mt-8 pt-6 border-t border-gray-100">
        <button
          onClick={logout}
          className="w-full py-3 text-sm text-red-500 font-medium border border-red-200 rounded-xl hover:bg-red-50"
        >
          Odjavi se
        </button>
      </div>
    </div>
  )
}
