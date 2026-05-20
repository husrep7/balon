import { useState } from 'react'
import { useCreateCustomer, useCustomerSearch } from '@/hooks'
import { Badge, Button, Input, Modal } from '@/components/ui'
import { ApiError } from '@/lib/api'

export function Customers() {
  const [q, setQ] = useState('')
  const { data: customers = [], isLoading } = useCustomerSearch(q)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex-1 p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium text-ink-800">Mušterije</h1>
          <p className="text-xs text-ink-500 mt-0.5">Pojedinačni klijenti i kontakti</p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + Nova mušterija
        </Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Traži po imenu ili broju telefona..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="bg-surface border border-ink-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-muted text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Ime</th>
              <th className="text-left px-4 py-2.5 font-medium">Telefon</th>
              <th className="text-left px-4 py-2.5 font-medium">Email</th>
              <th className="text-left px-4 py-2.5 font-medium">Tier</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-400 text-sm">
                  učitavam...
                </td>
              </tr>
            )}
            {!isLoading && customers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-400 text-sm">
                  {q ? `Nema rezultata za "${q}"` : 'Nema mušterija. Dodaj prvu.'}
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-ink-100 hover:bg-surface-alt">
                <td className="px-4 py-2.5 text-sm font-medium text-ink-800">{c.name}</td>
                <td className="px-4 py-2.5 text-sm text-ink-600 tabular">{c.phone ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-ink-600">{c.email ?? '—'}</td>
                <td className="px-4 py-2.5">
                  {c.tier === 'vip' ? <Badge tone="vip">VIP</Badge> : <span className="text-ink-400 text-xs">regular</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateCustomerModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function CreateCustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState<'regular' | 'vip'>('regular')
  const [error, setError] = useState<string | null>(null)
  const create = useCreateCustomer()

  function reset() {
    setName('')
    setPhone('')
    setEmail('')
    setTier('regular')
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Ime je obavezno')
      return
    }
    try {
      await create.mutateAsync({
        name: trimmed,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        tier,
      })
      handleClose()
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.body === 'object' && err.body && 'error' in err.body
          ? String((err.body as { error: unknown }).error)
          : err instanceof Error
            ? err.message
            : 'Greška'
      setError(msg)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova mušterija"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={create.isPending}>
            Odustani
          </Button>
          <Button
            variant="primary"
            onClick={(e) => submit(e as unknown as React.FormEvent)}
            disabled={create.isPending}
          >
            {create.isPending ? 'Snimam...' : 'Sačuvaj'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs text-ink-600 mb-1">Ime</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-xs text-ink-600 mb-1">Telefon</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+38761..." />
        </div>
        <div>
          <label className="block text-xs text-ink-600 mb-1">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="opcionalno"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-600 mb-1">Tier</label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={tier === 'regular' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setTier('regular')}
            >
              Regular
            </Button>
            <Button
              type="button"
              variant={tier === 'vip' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setTier('vip')}
            >
              VIP
            </Button>
          </div>
        </div>
        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
