import { useEffect, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useCreateCustomer, useCustomerSearch, useUpdateCustomer, useDeleteCustomer } from '@/hooks'
import { Badge, Button, EmptyState, Input, Modal, Page, Segmented, TierPill } from '@/components/ui'
import { ApiError } from '@/lib/api'
import type { Customer } from '@/lib/types'

export function Customers() {
  const search = useSearch({ strict: false }) as { q?: string }
  const [q, setQ] = useState(search.q ?? '')
  useEffect(() => {
    if (search.q !== undefined) setQ(search.q)
  }, [search.q])
  const [tierFilter, setTierFilter] = useState<'all' | 'regular' | 'vip'>('all')
  const { data: allCustomers = [], isLoading } = useCustomerSearch(q)
  const [createOpen, setCreateOpen] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)

  const customers = tierFilter === 'all' ? allCustomers : allCustomers.filter((c) => c.tier === tierFilter)
  const vipCount = allCustomers.filter((c) => c.tier === 'vip').length

  return (
    <Page
      title="Klijenti"
      subtitle="Kontakti igrača i ekipa koji rezervišu termine"
      actions={
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + Novi klijent
        </Button>
      }
    >
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-ink-100">
          <div className="relative w-full sm:w-80">
            <svg viewBox="0 0 24 24" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <Input
              id="customers-search"
              placeholder="Traži po imenu ili broju telefona…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Segmented
            value={tierFilter}
            onChange={setTierFilter}
            options={[
              { value: 'all', label: `Svi · ${allCustomers.length}` },
              { value: 'regular', label: 'Redovni' },
              { value: 'vip', label: `VIP · ${vipCount}` },
            ]}
          />
          <span className="ml-auto text-xs text-ink-500 tabular">{customers.length} prikazano</span>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 rounded-lg bg-ink-50 animate-pulse" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            title={q ? 'Nema rezultata' : 'Još nema klijenata'}
            description={
              q
                ? `Nijedan klijent ne odgovara pretrazi „${q}”.`
                : tierFilter !== 'all'
                  ? 'Nema klijenata u ovoj grupi.'
                  : 'Dodaj prvog klijenta ili ga napravi pri kreiranju rezervacije.'
            }
            action={
              !q ? (
                <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                  + Novi klijent
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Klijent</th>
                  <th>Telefon</th>
                  <th>E-mail</th>
                  <th>Ekipa</th>
                  <th>Status</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-ink-100 text-ink-600 text-[11px] font-bold flex items-center justify-center shrink-0">
                          {c.name
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase())
                            .join('')}
                        </span>
                        <span className="font-medium text-ink-900">{c.name}</span>
                      </div>
                    </td>
                    <td className="tabular">
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="hover:text-teal-700">
                          {c.phone}
                        </a>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    <td>{c.email ?? <span className="text-ink-300">—</span>}</td>
                    <td>
                      {c.team_name ? <Badge tone="info">{c.team_name}</Badge> : <span className="text-ink-300">—</span>}
                    </td>
                    <td>
                      <TierPill tier={c.tier} />
                    </td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditCustomer(c)}>
                        Uredi
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateCustomerModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editCustomer && <EditCustomerModal customer={editCustomer} onClose={() => setEditCustomer(null)} />}
    </Page>
  )
}

function CustomerForm({
  name, setName,
  phone, setPhone,
  email, setEmail,
  tier, setTier,
  teamName, setTeamName,
  error,
  onSubmit,
  isPending,
  autoFocusName,
}: {
  name: string; setName: (v: string) => void
  phone: string; setPhone: (v: string) => void
  email: string; setEmail: (v: string) => void
  tier: 'regular' | 'vip'; setTier: (v: 'regular' | 'vip') => void
  teamName: string; setTeamName: (v: string) => void
  error: string | null
  onSubmit: (e: React.FormEvent) => void
  isPending: boolean
  autoFocusName?: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-ink-600 mb-1">Ime <span className="text-red-500">*</span></label>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={autoFocusName} />
      </div>
      <div>
        <label className="block text-xs text-ink-600 mb-1">Telefon</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+38761..." />
      </div>
      <div>
        <label className="block text-xs text-ink-600 mb-1">Email</label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcionalno" />
      </div>
      <div>
        <label className="block text-xs text-ink-600 mb-1">Ekipa</label>
        <TeamCombobox value={teamName} onChange={setTeamName} />
      </div>
      <div>
        <label className="block text-xs text-ink-600 mb-1">Tier</label>
        <div className="flex gap-2">
          <Button type="button" variant={tier === 'regular' ? 'primary' : 'outline'} size="sm" onClick={() => setTier('regular')}>
            <svg viewBox="0 0 14 14" className="w-3 h-3 mr-1 inline" fill="currentColor" aria-hidden="true"><circle cx="7" cy="4.5" r="2.5"/><path d="M1.5 12.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round"/></svg>
            REG
          </Button>
          <Button type="button" variant={tier === 'vip' ? 'primary' : 'outline'} size="sm" onClick={() => setTier('vip')}>
            ★ VIP
          </Button>
        </div>
      </div>
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
      )}
      <button type="submit" hidden disabled={isPending} />
    </form>
  )
}

function CreateCustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState<'regular' | 'vip'>('regular')
  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useCreateCustomer()

  function reset() { setName(''); setPhone(''); setEmail(''); setTier('regular'); setTeamName(''); setError(null) }
  function handleClose() { reset(); onClose() }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Ime je obavezno'); return }
    try {
      await create.mutateAsync({ name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined, tier, team_name: teamName.trim() || undefined })
      handleClose()
    } catch (err) {
      setError(extractError(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novi klijent"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={create.isPending}>Odustani</Button>
          <Button variant="primary" onClick={(e) => submit(e as unknown as React.FormEvent)} disabled={create.isPending}>
            {create.isPending ? 'Snimam...' : 'Sačuvaj'}
          </Button>
        </>
      }
    >
      <CustomerForm
        name={name} setName={setName}
        phone={phone} setPhone={setPhone}
        email={email} setEmail={setEmail}
        tier={tier} setTier={setTier}
        teamName={teamName} setTeamName={setTeamName}
        error={error} onSubmit={submit} isPending={create.isPending} autoFocusName
      />
    </Modal>
  )
}

function EditCustomerModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [email, setEmail] = useState(customer.email ?? '')
  const [tier, setTier] = useState<'regular' | 'vip'>(customer.tier)
  const [teamName, setTeamName] = useState(customer.team_name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [forceDelete, setForceDelete] = useState(false)
  const update = useUpdateCustomer()
  const deleteMut = useDeleteCustomer()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Ime je obavezno'); return }
    try {
      await update.mutateAsync({ id: customer.id, name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined, tier, team_name: teamName.trim() || undefined })
      onClose()
    } catch (err) {
      setError(extractError(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Uredi klijenta"
      footer={
        <div className="flex items-center justify-between w-full">
          {forceDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-700 font-medium">Obrisati i rezervacije?</span>
              <Button
                variant="danger"
                size="sm"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate({ id: customer.id, force: true }, { onSuccess: onClose })}
              >
                {deleteMut.isPending ? 'Brišem...' : 'Da, obriši sve'}
              </Button>
              <Button size="sm" onClick={() => setForceDelete(false)}>Ne</Button>
            </div>
          ) : confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-700 font-medium">Sigurno obrisati?</span>
              <Button
                variant="danger"
                size="sm"
                disabled={deleteMut.isPending}
                onClick={() =>
                  deleteMut.mutate({ id: customer.id }, {
                    onSuccess: onClose,
                    onError: (err) => {
                      if (err instanceof ApiError && err.status === 409) {
                        setConfirmDelete(false)
                        setForceDelete(true)
                      }
                    },
                  })
                }
              >
                {deleteMut.isPending ? 'Brišem...' : 'Da, obriši'}
              </Button>
              <Button size="sm" onClick={() => setConfirmDelete(false)}>Ne</Button>
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              Obriši klijenta
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={update.isPending}>Odustani</Button>
            <Button variant="primary" onClick={(e) => submit(e as unknown as React.FormEvent)} disabled={update.isPending}>
              {update.isPending ? 'Snimam...' : 'Sačuvaj'}
            </Button>
          </div>
        </div>
      }
    >
      <CustomerForm
        name={name} setName={setName}
        phone={phone} setPhone={setPhone}
        email={email} setEmail={setEmail}
        tier={tier} setTier={setTier}
        teamName={teamName} setTeamName={setTeamName}
        error={error} onSubmit={submit} isPending={update.isPending} autoFocusName
      />
    </Modal>
  )
}

function TeamCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: allCustomers = [] } = useCustomerSearch('', 200)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const teamNames = Array.from(
    new Set(allCustomers.map((c) => c.team_name).filter(Boolean) as string[])
  ).sort()

  const filtered = value.trim()
    ? teamNames.filter((n) => n.toLowerCase().includes(value.toLowerCase()))
    : teamNames

  const showDropdown = open && (filtered.length > 0 || value.trim().length > 0)

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Traži ili upiši naziv ekipe..."
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 text-xs"
          >
            ✕
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-auto bg-surface border border-ink-200 rounded shadow-sm z-20">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(name); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-ink-50 border-b border-ink-100 last:border-b-0 text-sm"
            >
              {name}
            </button>
          ))}
          {value.trim() && !filtered.includes(value.trim()) && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(value.trim()); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-teal-50 text-sm text-teal-700 font-medium"
            >
              + Nova ekipa "{value.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function extractError(err: unknown): string {
  if (err instanceof ApiError && typeof err.body === 'object' && err.body && 'error' in err.body)
    return String((err.body as { error: unknown }).error)
  if (err instanceof Error) return err.message
  return 'Greška'
}
