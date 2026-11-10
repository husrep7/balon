import { useEffect, useMemo, useState } from 'react'
import { addMinutes, format, parseISO } from 'date-fns'

import { Badge, Button, Input, Modal } from '@/components/ui'
import { useCreateBooking, useCreateCustomer, useCustomerSearch, usePricingQuote } from '@/hooks'
import { fmtMoney } from '@/lib/time'
import { ApiError } from '@/lib/api'
import type { Booking, Customer, UUID } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  resourceId: UUID
  startAt: Date
  existingBookings?: Booking[]
}

const SLOT_MIN = 75
const DAY_PRICE_CENTS = 8000    // 80 KM
const EVE_PRICE_CENTS = 11000   // 110 KM
const EVENING_HOUR = 18

function isEvening(d: Date) { return d.getHours() >= EVENING_HOUR }

type BookingMode = 'customer' | 'team'

export function CreateBookingModal({ open, onClose, resourceId, startAt, existingBookings = [] }: Props) {
  const evening = isEvening(startAt)
  const fallbackPrice = evening ? EVE_PRICE_CENTS : DAY_PRICE_CENTS

  const [mode, setMode] = useState<BookingMode>('customer')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [teamName, setTeamName] = useState<string | null>(null)
  const [slotCount, setSlotCount] = useState(1)
  const [priceOverride, setPriceOverride] = useState<number | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMode('customer')
      setCustomer(null)
      setTeamName(null)
      setSlotCount(1)
      setPriceOverride(null)
      setServerError(null)
    }
  }, [open])

  const endAt = useMemo(() => addMinutes(startAt, slotCount * SLOT_MIN), [startAt, slotCount])

  // Pre-check conflicts from already-loaded calendar data
  const conflicts = useMemo(() => {
    if (!existingBookings.length) return []
    return existingBookings.filter((b) => {
      if (b.status === 'cancelled' || b.status === 'no_show') return false
      const bStart = parseISO(b.start_at)
      const bEnd = parseISO(b.end_at)
      return bStart < endAt && bEnd > startAt
    })
  }, [existingBookings, startAt, endAt])

  const quote = usePricingQuote({
    resource_id: resourceId,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    customer_id: customer?.id,
    channel: 'admin',
  })

  const quotedPrice = (quote.data?.final_cents ?? fallbackPrice) * slotCount
  const finalPrice = priceOverride !== null ? priceOverride : quotedPrice

  const createMut = useCreateBooking()

  async function handleSubmit() {
    setServerError(null)
    if (conflicts.length > 0) {
      const times = conflicts.map((b) => `${format(parseISO(b.start_at), 'HH:mm')}–${format(parseISO(b.end_at), 'HH:mm')}`).join(', ')
      setServerError(`Termin u ${times} je već zauzet.`)
      return
    }
    try {
      await createMut.mutateAsync({
        resource_id: resourceId,
        customer_id: mode === 'customer' ? customer?.id : undefined,
        team_name: mode === 'team' ? (teamName ?? undefined) : undefined,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        price_cents: finalPrice > 0 ? finalPrice : undefined,
        channel: 'admin',
      })
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setServerError(`Termin ${format(startAt, 'HH:mm')}–${format(endAt, 'HH:mm')} je već zauzet.`)
      } else if (err instanceof ApiError && err.status === 422) {
        setServerError('Provjeri unos: ' + (err.body as { error?: string })?.error)
      } else {
        setServerError('Greška pri kreiranju termina.')
      }
    }
  }

  const hasSubject = mode === 'customer' ? !!customer : !!teamName
  const canSubmit = hasSubject && finalPrice > 0 && !createMut.isPending && conflicts.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Novi termin · ${format(startAt, 'EEE d. MMM')} · ${format(startAt, 'HH:mm')}–${format(endAt, 'HH:mm')}`}
      maxWidth="28rem"
      footer={
        <>
          <Button onClick={onClose} disabled={createMut.isPending}>Otkaži</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {createMut.isPending ? 'Snimam...' : 'Kreiraj termin'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Mode toggle */}
        <div className="flex rounded border border-ink-200 overflow-hidden text-sm">
          {(['customer', 'team'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setCustomer(null); setTeamName(null) }}
              className={`flex-1 py-2 font-medium transition-colors ${
                mode === m
                  ? 'bg-teal-600 text-white'
                  : 'text-ink-600 hover:bg-ink-50'
              }`}
            >
              {m === 'customer' ? 'Klijent' : 'Ekipa'}
            </button>
          ))}
        </div>

        {/* Subject picker */}
        {mode === 'customer' ? (
          <div>
            <label className="text-xs uppercase tracking-wider text-ink-500 font-semibold mb-1.5 block">
              Klijent <span className="text-red-500 normal-case tracking-normal font-normal">*</span>
            </label>
            {customer ? (
              <div className="flex items-center justify-between p-2.5 bg-surface-muted rounded border border-ink-200">
                <div>
                  <div className="text-sm font-medium">{customer.name}</div>
                  <div className="text-xs text-ink-500">
                    {customer.phone ?? '—'}
                    {customer.tier === 'vip' && <Badge tone="vip" className="ml-2">VIP</Badge>}
                  </div>
                </div>
                <button onClick={() => setCustomer(null)} className="text-xs text-ink-400 hover:text-ink-700">
                  ukloni
                </button>
              </div>
            ) : (
              <CustomerCombobox onSelect={setCustomer} />
            )}
          </div>
        ) : (
          <div>
            <label className="text-xs uppercase tracking-wider text-ink-500 font-semibold mb-1.5 block">
              Ekipa <span className="text-red-500 normal-case tracking-normal font-normal">*</span>
            </label>
            {teamName ? (
              <div className="flex items-center justify-between p-2.5 bg-surface-muted rounded border border-ink-200">
                <span className="text-sm font-medium">{teamName}</span>
                <button onClick={() => setTeamName(null)} className="text-xs text-ink-400 hover:text-ink-700">
                  ukloni
                </button>
              </div>
            ) : (
              <TeamCombobox onSelect={setTeamName} />
            )}
          </div>
        )}

        {/* Slot info */}
        <div className="bg-surface-muted rounded-md px-3 py-2.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-ink-500 mb-0.5">Termin</div>
            <div className="text-sm font-semibold text-ink-800 tabular">
              {format(startAt, 'HH:mm')} – {format(endAt, 'HH:mm')}
              <span className="text-xs font-normal text-ink-500 ml-2">{slotCount * SLOT_MIN} min</span>
            </div>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${evening ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'}`}>
            {evening ? 'Večernji' : 'Dnevni'}
          </span>
        </div>

        {/* Slot count picker */}
        <div>
          <label className="text-xs uppercase tracking-wider text-ink-500 font-semibold mb-1.5 block">
            Broj termina
          </label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setSlotCount(n)}
                className={`flex-1 h-9 rounded text-sm font-medium border transition-colors ${
                  slotCount === n
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-surface border-ink-200 text-ink-700 hover:bg-ink-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="text-xs text-ink-400 mt-1">
            {slotCount === 1 ? '1 termin' : `${slotCount} uzastopna termina`} · {slotCount * SLOT_MIN} min ukupno
          </div>
        </div>

        {/* Conflict warning */}
        {conflicts.length > 0 && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2.5">
            <div className="font-medium mb-1">Termin nije slobodan:</div>
            <ul className="space-y-0.5 text-xs">
              {conflicts.map((b) => (
                <li key={b.id}>
                  · {format(parseISO(b.start_at), 'HH:mm')}–{format(parseISO(b.end_at), 'HH:mm')}
                  {(b.customer_name || b.team_name) && (
                    <span className="text-red-500 ml-1">({b.team_name ?? b.customer_name})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Price */}
        <div>
          <label className="text-xs uppercase tracking-wider text-ink-500 font-semibold mb-1.5 block">
            Cijena
          </label>
          {customer?.tier === 'vip' ? (
            <div className="flex items-baseline gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={Math.round(finalPrice / 100)}
                onChange={(e) => setPriceOverride((parseInt(e.target.value) || 0) * 100)}
                className="w-28 h-10 px-3 border border-ink-200 rounded text-2xl font-bold text-ink-800 tabular focus:outline-none focus:border-teal-500 bg-surface"
              />
              <span className="text-sm text-ink-500">KM</span>
              {priceOverride !== null && priceOverride !== quotedPrice && (
                <button
                  onClick={() => setPriceOverride(null)}
                  className="text-xs text-ink-400 hover:text-ink-700 ml-1"
                >
                  ↺ reset ({fmtMoney(quotedPrice)})
                </button>
              )}
            </div>
          ) : (
            <div className="text-2xl font-bold text-ink-800 tabular">
              {fmtMoney(quotedPrice)}
            </div>
          )}
        </div>

        {serverError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2.5">
            {serverError}
          </div>
        )}
      </div>
    </Modal>
  )
}

function TeamCombobox({ onSelect }: { onSelect: (name: string) => void }) {
  const { data: allCustomers = [] } = useCustomerSearch('', 200)
  const [q, setQ] = useState('')

  const teamNames = Array.from(
    new Set(allCustomers.map((c) => c.team_name).filter(Boolean) as string[])
  ).sort()

  const filtered = q.trim()
    ? teamNames.filter((n) => n.toLowerCase().includes(q.toLowerCase()))
    : teamNames

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          placeholder="Traži ili upiši naziv ekipe..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {(filtered.length > 0 || q.trim()) && (
          <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-auto bg-surface border border-ink-200 rounded shadow-sm z-10">
            {filtered.map((name) => (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className="w-full text-left px-3 py-2 hover:bg-ink-50 border-b border-ink-100 last:border-b-0 text-sm font-medium"
              >
                {name}
              </button>
            ))}
            {q.trim() && !filtered.includes(q.trim()) && (
              <button
                onClick={() => onSelect(q.trim())}
                className="w-full text-left px-3 py-2 hover:bg-ink-50 text-sm text-teal-700 font-medium"
              >
                + Koristi "{q.trim()}"
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CustomerCombobox({ onSelect }: { onSelect: (c: Customer) => void }) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const createCustomer = useCreateCustomer()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200)
    return () => clearTimeout(t)
  }, [q])

  const { data: customers = [] } = useCustomerSearch(debouncedQ)
  const showResults = q.length >= 2

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      const c = await createCustomer.mutateAsync({
        name: newName.trim(),
        phone: newPhone.trim(),
      })
      onSelect(c)
    } catch {
      // error shown inline
    }
  }

  if (creatingNew) {
    return (
      <div className="space-y-2">
        <Input
          placeholder="Ime i prezime *"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
        />
        <Input
          placeholder="Telefon *"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
        />
        {createCustomer.isError && (
          <div className="text-xs text-red-600">Greška pri dodavanju klijenta.</div>
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={!newName.trim() || !newPhone.trim() || createCustomer.isPending}
            className="flex-1 justify-center"
          >
            {createCustomer.isPending ? 'Dodajem...' : 'Dodaj klijenta'}
          </Button>
          <Button size="sm" onClick={() => setCreatingNew(false)}>
            Otkaži
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          placeholder="Traži po imenu ili broju..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {showResults && (
          <div className="absolute left-0 right-0 top-full mt-1 max-h-52 overflow-auto bg-surface border border-ink-200 rounded shadow-sm z-10">
            {customers.length === 0 ? (
              <div className="p-3 text-sm text-ink-400">nema rezultata</div>
            ) : (
              customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="w-full text-left px-3 py-2 hover:bg-ink-50 border-b border-ink-100 last:border-b-0"
                >
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-ink-500 tabular">
                    {c.phone ?? '—'}
                    {c.tier === 'vip' && <Badge tone="vip" className="ml-2">VIP</Badge>}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <button
        onClick={() => setCreatingNew(true)}
        className="text-xs text-teal-700 hover:underline"
      >
        + Dodaj novog klijenta
      </button>
    </div>
  )
}
