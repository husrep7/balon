import { useEffect, useMemo, useState } from 'react'
import { addMinutes, format } from 'date-fns'

import { Badge, Button, Input, Modal } from '@/components/ui'
import { useCreateBooking, useCustomerSearch, usePricingQuote, usePricingRules, useResources } from '@/hooks'
import { fmtMoney } from '@/lib/time'
import { ApiError } from '@/lib/api'
import type { Customer, UUID } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  resourceId: UUID
  startAt: Date              // initial start (from clicked slot)
}

const FALLBACK_DURATIONS = [60, 90, 120]

export function CreateBookingModal({ open, onClose, resourceId, startAt }: Props) {
  const { data: resources = [] } = useResources()
  const { data: rules = [] } = usePricingRules(false)
  const resource = resources.find((r) => r.id === resourceId)

  // Build dropdown options from active pricing rules that apply to this
  // resource's kind. Each rule becomes one option: rules without an explicit
  // min_duration_minutes get a default duration (90) so the calendar can place
  // them, while rules that *do* specify duration set it directly.
  const ruleOptions = useMemo(() => {
    const list: { id: string; label: string; duration: number; priceCents: number }[] = []
    for (const r of rules) {
      const kinds = r.conditions.resource_kind
      if (kinds && kinds.length > 0 && resource && !kinds.includes(resource.kind)) continue
      const dur = r.conditions.min_duration_minutes ?? 90
      const durLabel = r.conditions.min_duration_minutes ? `${dur} min` : `${dur} min (default)`
      list.push({
        id: r.id,
        duration: dur,
        priceCents: r.price_cents,
        label: `${durLabel} — ${fmtMoney(r.price_cents)} · ${r.name}`,
      })
    }
    return list.sort((a, b) => a.duration - b.duration || a.priceCents - b.priceCents)
  }, [rules, resource])

  const initialDuration = ruleOptions[0]?.duration ?? 90
  const initialRuleId = ruleOptions[0]?.id ?? 'custom'

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [duration, setDuration] = useState<number>(initialDuration)
  const [selectedRuleId, setSelectedRuleId] = useState<string>(initialRuleId)
  const [notes, setNotes] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setCustomer(null)
      setDuration(initialDuration)
      setSelectedRuleId(initialRuleId)
      setNotes('')
      setServerError(null)
    }
  }, [open, initialDuration, initialRuleId])

  const endAt = useMemo(() => addMinutes(startAt, duration), [startAt, duration])

  const quote = usePricingQuote({
    resource_id: resourceId,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    customer_id: customer?.id,
    channel: 'admin',
  })

  const selectedRule = ruleOptions.find((o) => o.id === selectedRuleId)
  // Effective price: when the user picked a specific rule, honor it verbatim.
  // Otherwise (custom duration), use the auto-quote from the engine.
  const effectivePriceCents = selectedRule ? selectedRule.priceCents : quote.data?.final_cents
  const priceSourceLabel = selectedRule ? selectedRule.label.split('·').pop()?.trim() : quote.data?.applied_rule_name

  const createMut = useCreateBooking()
  const submitting = createMut.isPending

  async function handleSubmit() {
    setServerError(null)
    try {
      await createMut.mutateAsync({
        resource_id: resourceId,
        customer_id: customer?.id,
        // Walk-in without customer: use placeholder customer. For now, require customer.
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        price_cents: effectivePriceCents,
        channel: 'admin',
        notes: notes || undefined,
      })
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setServerError('Termin je već zauzet u tom periodu. Probaj drugi slot ili teren.')
      } else if (err instanceof ApiError && err.status === 422) {
        setServerError('Provjeri unos: ' + (err.body as { error?: string })?.error)
      } else {
        setServerError('Greška pri kreiranju termina.')
      }
    }
  }

  const canSubmit =
    !!customer && effectivePriceCents !== undefined && effectivePriceCents > 0 && !submitting

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Novi termin · ${format(startAt, 'EEE d. MMM · HH:mm')}`}
      maxWidth="32rem"
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>Otkaži</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Snimam...' : 'Kreiraj termin'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1.5">
            Mušterija
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
              <button
                onClick={() => setCustomer(null)}
                className="text-xs text-ink-500 hover:text-ink-700"
              >
                promijeni
              </button>
            </div>
          ) : (
            <CustomerCombobox onSelect={setCustomer} />
          )}
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1.5">
            Trajanje i cijena
          </label>
          {ruleOptions.length > 0 ? (
            <select
              value={selectedRuleId}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'custom') {
                  setSelectedRuleId('custom')
                  return
                }
                const opt = ruleOptions.find((o) => o.id === v)
                if (opt) {
                  setSelectedRuleId(opt.id)
                  setDuration(opt.duration)
                }
              }}
              className="w-full h-9 px-2 text-sm rounded border border-ink-200 bg-surface text-ink-800 focus:outline-none focus:border-teal-500 focus:shadow-focus"
            >
              {ruleOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
              <option value="custom">Drugo trajanje (ručno)…</option>
            </select>
          ) : (
            <div className="flex gap-1">
              {FALLBACK_DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={
                    'px-3 py-1.5 text-sm rounded border ' +
                    (duration === d
                      ? 'border-teal-500 bg-teal-50 text-teal-800'
                      : 'border-ink-200 text-ink-600 hover:bg-ink-50')
                  }
                >
                  {d} min
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-ink-500">Min:</span>
            <Input
              type="number"
              min={30}
              max={480}
              step={15}
              value={duration}
              onChange={(e) => {
                setDuration(parseInt(e.target.value) || 90)
                setSelectedRuleId('custom')
              }}
              className="w-24"
            />
            <span className="text-xs text-ink-400 tabular">
              završetak u {format(endAt, 'HH:mm')}
            </span>
          </div>
          {ruleOptions.length === 0 && (
            <p className="text-[11px] text-ink-400 mt-1">
              Nema aktivnih pravila cijene. Dodaj ih u <em>Cjenovnik</em>.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1.5">
            Bilješka
          </label>
          <Input
            placeholder="npr. donijeti loptu"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Price */}
        <div className="border-t border-ink-100 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-ink-500">Cijena</div>
            {!selectedRule && quote.isLoading && (
              <span className="text-xs text-ink-400">računam...</span>
            )}
            {!selectedRule && quote.isError && (
              <span className="text-xs text-red-700">cijena nedostupna</span>
            )}
          </div>
          {effectivePriceCents !== undefined && (
            <div className="mt-1">
              <div className="text-2xl font-medium tabular">{fmtMoney(effectivePriceCents)}</div>
              {!selectedRule && quote.data && quote.data.discount_cents > 0 && (
                <div className="text-xs text-ink-500 tabular">
                  baza {fmtMoney(quote.data.base_cents)} · popust −
                  {fmtMoney(quote.data.discount_cents)}
                </div>
              )}
              {priceSourceLabel && (
                <div className="text-[11px] text-ink-400 mt-0.5">
                  pravilo: {priceSourceLabel}
                </div>
              )}
              {!selectedRule && quote.data?.payment_method_hint === 'membership_credit' && (
                <Badge tone="vip" className="mt-1">
                  pokriveno sezonom
                </Badge>
              )}
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

function CustomerCombobox({ onSelect }: { onSelect: (c: Customer) => void }) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200)
    return () => clearTimeout(t)
  }, [q])

  const { data: customers = [] } = useCustomerSearch(debouncedQ)
  const showResults = q.length >= 2

  return (
    <div className="relative">
      <Input
        placeholder="Traži po imenu ili broju..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {showResults && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-auto bg-surface border border-ink-200 rounded shadow-sm z-10">
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
  )
}
