import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { accountApi } from '../lib/api'
import { getUser, logout, saveSession } from '../lib/auth'
import { Avatar, ErrorNote, Group, Row, Screen, Section, Sheet } from '../components/ui'

export function Profile() {
  const user = getUser()!
  const [editOpen, setEditOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [toast, setToast] = useState('')

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  return (
    <Screen title="Profil">
      <div className="bg-white rounded-3xl shadow-card px-5 py-5 flex items-center gap-4">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0">
          <div className="text-[20px] font-bold text-gray-900 truncate">{user.name}</div>
          <div className="text-[14px] text-gray-500 truncate">{user.email}</div>
        </div>
      </div>

      <Section title="Lični podaci">
        <Group>
          <Row icon="user" label="Ime i prezime" value={user.name} onClick={() => setEditOpen(true)} chevron />
          <Row icon="phone" label="Telefon" value={user.phone || 'Dodaj broj'} onClick={() => setEditOpen(true)} chevron />
          <Row icon="mail" label="E-mail" value={user.email} />
        </Group>
      </Section>

      <Section title="Sigurnost">
        <Group>
          <Row icon="lock" label="Promijeni lozinku" onClick={() => setPwOpen(true)} chevron />
        </Group>
      </Section>

      <Group>
        <Row icon="logout" iconTone="red" label="Odjavi se" danger onClick={logout} />
      </Group>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 bg-gray-900 text-white text-[14px] font-medium rounded-full px-4 py-2.5 shadow-lift animate-fade-up">
          {toast}
        </div>
      )}

      <EditSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          flash('Podaci su sačuvani')
        }}
      />
      <PasswordSheet
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        onSaved={() => {
          setPwOpen(false)
          flash('Lozinka je promijenjena')
        }}
      />
    </Screen>
  )
}

function EditSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const user = getUser()!
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone ?? '')
  const save = useMutation({
    mutationFn: () => accountApi.update(name.trim(), phone.trim()),
    onSuccess: (acc) => {
      saveSession(localStorage.getItem('balon_customer_token')!, { ...user, name: acc.name, phone: acc.phone })
      onSaved()
    },
  })
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Lični podaci"
      footer={
        <button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()} className="btn-primary">
          {save.isPending ? 'Spremam…' : 'Sačuvaj'}
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">Ime i prezime</span>
          <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="field" />
        </label>
        <label className="block">
          <span className="label">Broj telefona</span>
          <input
            id="profile-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+387 61 000 000"
            autoComplete="tel"
            className="field"
          />
        </label>
        {save.error && <ErrorNote>{save.error instanceof Error ? save.error.message : 'Čuvanje nije uspjelo.'}</ErrorNote>}
      </div>
    </Sheet>
  )
}

function PasswordSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const change = useMutation({
    mutationFn: () => {
      if (form.next.length < 8) throw new Error('Nova lozinka mora imati najmanje 8 znakova.')
      if (form.next !== form.confirm) throw new Error('Nove lozinke se ne poklapaju.')
      return accountApi.changePassword(form.current, form.next)
    },
    onSuccess: () => {
      setForm({ current: '', next: '', confirm: '' })
      onSaved()
    },
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Promijeni lozinku"
      footer={
        <button onClick={() => change.mutate()} disabled={change.isPending || !form.current || !form.next} className="btn-primary">
          {change.isPending ? 'Mijenjam…' : 'Promijeni lozinku'}
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">Trenutna lozinka</span>
          <input id="pw-current" type="password" value={form.current} onChange={set('current')} autoComplete="current-password" className="field" />
        </label>
        <label className="block">
          <span className="label">Nova lozinka</span>
          <input id="pw-next" type="password" value={form.next} onChange={set('next')} autoComplete="new-password" placeholder="najmanje 8 znakova" className="field" />
        </label>
        <label className="block">
          <span className="label">Ponovi novu lozinku</span>
          <input id="pw-confirm" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" className="field" />
        </label>
        {change.error && <ErrorNote>{change.error instanceof Error ? change.error.message : 'Promjena nije uspjela.'}</ErrorNote>}
      </div>
    </Sheet>
  )
}
