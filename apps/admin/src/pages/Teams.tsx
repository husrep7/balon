import { useEffect, useState } from 'react'
import { useCreateCustomer, useCustomerSearch, useUpdateCustomer } from '@/hooks'
import { Button, Input, Modal, TierPill } from '@/components/ui'
import { ApiError } from '@/lib/api'
import type { Customer } from '@/lib/types'

export function Teams() {
  const { data: allCustomers = [], isLoading } = useCustomerSearch('', 200)
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [newTeamOpen, setNewTeamOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Customer | null>(null)
  const update = useUpdateCustomer()

  // Group by team_name
  const teamMap = new Map<string, Customer[]>()
  for (const c of allCustomers) {
    if (c.team_name) {
      const list = teamMap.get(c.team_name) ?? []
      list.push(c)
      teamMap.set(c.team_name, list)
    }
  }
  const teamNames = Array.from(teamMap.keys()).sort()
  const membersToShow = selectedTeam ? (teamMap.get(selectedTeam) ?? []) : []


  async function removeMember(c: Customer) {
    await update.mutateAsync({
      id: c.id, name: c.name, phone: c.phone,
      email: c.email, tier: c.tier, team_name: undefined,
    })
    setRemoveTarget(null)
  }

  return (
    <div className="flex-1 w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Ekipe</h1>
          <p className="text-xs text-ink-500 mt-0.5">Klijenti grupisani po ekipi</p>
        </div>
        <Button variant="primary" onClick={() => setNewTeamOpen(true)}>
          + Nova ekipa
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-400">Učitavanje...</p>}

      {!isLoading && teamNames.length === 0 && (
        <div className="p-8 border border-dashed border-ink-200 rounded-lg text-center text-ink-400 text-sm">
          Nema ekipa. Klikni "+ Nova ekipa" da dodaš prvu.
        </div>
      )}

      {!isLoading && teamNames.length > 0 && (
        <div className="grid grid-cols-[200px_1fr] gap-5 items-start">
          {/* Sidebar */}
          <div className="space-y-1">
            {teamNames.map((name) => {
              const count = teamMap.get(name)?.length ?? 0
              return (
                <button
                  key={name}
                  onClick={() => setSelectedTeam(name === selectedTeam ? null : name)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
                    selectedTeam === name
                      ? 'bg-teal-600 text-white'
                      : 'text-ink-700 hover:bg-ink-100'
                  }`}
                >
                  <span className="font-medium truncate">{name}</span>
                  <span className={`text-xs ml-2 shrink-0 ${selectedTeam === name ? 'text-teal-100' : 'text-ink-400'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Members panel */}
          <div className="card overflow-hidden">
            {!selectedTeam ? (
              <div className="p-8 text-center text-ink-400 text-sm">
                Odaberi ekipu s lijeve strane.
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-800">{selectedTeam}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-400">
                      {membersToShow.length} {membersToShow.length === 1 ? 'član' : 'članova'}
                    </span>
                    <Button size="sm" variant="primary" onClick={() => setAddMemberOpen(true)}>
                      + Dodaj člana
                    </Button>
                  </div>
                </div>
                {membersToShow.length === 0 ? (
                  <div className="p-6 text-center text-ink-400 text-sm">
                    Nema članova. Dodaj prvog.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-ink-100">
                      {membersToShow.map((c) => (
                        <tr key={c.id} className="hover:bg-surface-alt">
                          <td className="px-4 py-2.5 font-medium text-ink-800">{c.name}</td>
                          <td className="px-4 py-2.5 text-ink-500 tabular">{c.phone ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            <TierPill tier={c.tier} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => setRemoveTarget(c)}
                              className="text-xs text-ink-400 hover:text-red-600 px-2 py-1 rounded hover:bg-ink-50 transition-colors"
                            >
                              Ukloni
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Create team modal */}
      {newTeamOpen && (
        <NewTeamModal
          onClose={() => setNewTeamOpen(false)}
          onCreated={(name) => { setSelectedTeam(name); setNewTeamOpen(false) }}
          allCustomers={allCustomers}
        />
      )}

      {/* Add member modal */}
      {addMemberOpen && selectedTeam && (
        <AddMemberModal
          teamName={selectedTeam}
          existingIds={new Set(membersToShow.map((c) => c.id))}
          onClose={() => setAddMemberOpen(false)}
        />
      )}

      {/* Remove confirm */}
      {removeTarget && (
        <Modal
          open
          onClose={() => setRemoveTarget(null)}
          title="Ukloni iz ekipe"
          footer={
            <>
              <Button variant="ghost" onClick={() => setRemoveTarget(null)}>Odustani</Button>
              <Button variant="danger" onClick={() => removeMember(removeTarget)} disabled={update.isPending}>
                {update.isPending ? 'Uklanjam...' : 'Ukloni'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            Ukloniti <strong>{removeTarget.name}</strong> iz ekipe?
          </p>
        </Modal>
      )}
    </div>
  )
}

function NewTeamModal({
  onClose,
  onCreated,
  allCustomers,
}: {
  onClose: () => void
  onCreated: (name: string) => void
  allCustomers: Customer[]
}) {
  const [teamName, setTeamName] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const update = useUpdateCustomer()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200)
    return () => clearTimeout(t)
  }, [q])

  const filtered = debouncedQ.length >= 1
    ? allCustomers.filter((c) =>
        c.name.toLowerCase().includes(debouncedQ.toLowerCase()) ||
        (c.phone ?? '').includes(debouncedQ)
      ).slice(0, 10)
    : []

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedCustomers = allCustomers.filter((c) => selected.has(c.id))

  async function submit() {
    setError(null)
    if (!teamName.trim()) { setError('Upiši naziv ekipe.'); return }
    if (selected.size === 0) { setError('Dodaj bar jednog člana.'); return }
    try {
      await Promise.all(
        selectedCustomers.map((c) =>
          update.mutateAsync({ id: c.id, name: c.name, phone: c.phone, email: c.email, tier: c.tier, team_name: teamName.trim() })
        )
      )
      onCreated(teamName.trim())
    } catch (err) {
      setError(extractError(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova ekipa"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Odustani</Button>
          <Button variant="primary" onClick={submit} disabled={update.isPending}>
            {update.isPending ? 'Snimam...' : 'Kreiraj ekipu'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-ink-600 mb-1">Naziv ekipe <span className="text-red-500">*</span></label>
          <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="npr. FK Olimpik" autoFocus />
        </div>

        <div>
          <label className="block text-xs text-ink-600 mb-1">Dodaj članove <span className="text-red-500">*</span></label>
          <div className="relative">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Traži po imenu ili telefonu..." />
            {filtered.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 max-h-44 overflow-auto bg-surface border border-ink-200 rounded shadow-sm z-10">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { toggle(c.id); setQ('') }}
                    className="w-full text-left px-3 py-2 hover:bg-ink-50 border-b border-ink-100 last:border-b-0 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-ink-500">{c.phone ?? '—'}</div>
                    </div>
                    {selected.has(c.id) && <span className="text-teal-600 text-xs font-medium">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedCustomers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedCustomers.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-teal-50 border border-teal-200 text-xs text-teal-800">
                {c.name}
                <button onClick={() => toggle(c.id)} className="hover:text-red-600 ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}

function AddMemberModal({
  teamName,
  existingIds,
  onClose,
}: {
  teamName: string
  existingIds: Set<string>
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const { data: results = [] } = useCustomerSearch(debouncedQ)
  const update = useUpdateCustomer()
  const createCustomer = useCreateCustomer()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200)
    return () => clearTimeout(t)
  }, [q])

  const filtered = debouncedQ.length >= 1
    ? results.filter((c) => !existingIds.has(c.id)).slice(0, 8)
    : []

  async function assign(c: Customer) {
    setError(null)
    try {
      await update.mutateAsync({ id: c.id, name: c.name, phone: c.phone, email: c.email, tier: c.tier, team_name: teamName })
      onClose()
    } catch (err) {
      setError(extractError(err))
    }
  }

  async function createAndAssign() {
    setError(null)
    if (!newName.trim()) { setError('Ime je obavezno.'); return }
    try {
      const c = await createCustomer.mutateAsync({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        team_name: teamName,
      })
      // customer created with team_name already set — just close
      void c
      onClose()
    } catch (err) {
      setError(extractError(err))
    }
  }

  if (creatingNew) {
    return (
      <Modal
        open
        onClose={onClose}
        title={`Novi klijent — ${teamName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreatingNew(false)}>Nazad</Button>
            <Button variant="primary" onClick={createAndAssign} disabled={!newName.trim() || createCustomer.isPending}>
              {createCustomer.isPending ? 'Snimam...' : 'Dodaj u ekipu'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-ink-600 mb-1">Ime <span className="text-red-500">*</span></label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ime i prezime" autoFocus />
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">Telefon</label>
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+38761..." />
          </div>
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title={`Dodaj člana — ${teamName}`} footer={<Button variant="ghost" onClick={onClose}>Zatvori</Button>}>
      <div className="space-y-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Traži klijenta..." autoFocus />
        {filtered.length > 0 && (
          <div className="border border-ink-200 rounded divide-y divide-ink-100 max-h-52 overflow-auto">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => assign(c)}
                disabled={update.isPending}
                className="w-full text-left px-3 py-2.5 hover:bg-ink-50 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium text-ink-800">{c.name}</div>
                  <div className="text-xs text-ink-500">{c.phone ?? '—'}{c.team_name && <span className="ml-2 text-blue-600">({c.team_name})</span>}</div>
                </div>
                <span className="text-xs text-teal-600 font-medium">Dodaj →</span>
              </button>
            ))}
          </div>
        )}
        {debouncedQ.length >= 1 && filtered.length === 0 && (
          <p className="text-sm text-ink-400 text-center py-2">Nema rezultata.</p>
        )}
        <button
          onClick={() => { setCreatingNew(true); setNewName(q); setError(null) }}
          className="text-xs text-teal-700 hover:underline"
        >
          + Dodaj novog klijenta
        </button>
        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}

function extractError(err: unknown): string {
  if (err instanceof ApiError && typeof err.body === 'object' && err.body && 'error' in err.body)
    return String((err.body as { error: unknown }).error)
  if (err instanceof Error) return err.message
  return 'Greška'
}
