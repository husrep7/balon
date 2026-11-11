import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { bookingApi, tenantApi, type Resource } from '../lib/api'
import { getUser } from '../lib/auth'
import { fmtMoney } from '../lib/utils'
import type { Route } from '../lib/router'
import { DayStrip, SLOT_MIN, SlotGrid, buildSlots, canStartAt, comboPrice, minutesToHHMM } from '../components/Slots'
import { ErrorNote, Group, Icon, Row, Screen, Section, SegmentedControl } from '../components/ui'

interface Props {
  onNav: (r: Route) => void
}

type Step = 'pick' | 'confirm' | 'done'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function useTick(ms = 30_000) {
  const [, set] = useState(0)
  useEffect(() => {
    const id = setInterval(() => set((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

export function NewBooking({ onNav }: Props) {
  useTick()
  const qc = useQueryClient()
  const user = getUser()

  const [step, setStep] = useState<Step>('pick')
  const [resource, setResource] = useState<Resource | null>(null)
  const [date, setDate] = useState<Date>(startOfToday)
  const [count, setCount] = useState<1 | 2>(1)
  const [startMin, setStartMin] = useState<number | null>(null)
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState<'cash' | 'card'>('cash')

  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })
  const pitches = useMemo(() => (resources?.data ?? []).filter((r) => !r.parent_id), [resources])
  useEffect(() => {
    if (!resource && pitches.length) setResource(pitches[0])
  }, [pitches, resource])

  const dayFrom = new Date(date)
  const dayTo = new Date(date)
  dayTo.setDate(dayTo.getDate() + 1)
  const { data: availability, isFetching } = useQuery({
    queryKey: ['availability', resource?.id, date.toISOString()],
    queryFn: () => tenantApi.availability(resource!.id, dayFrom.toISOString(), dayTo.toISOString()),
    enabled: !!resource,
    refetchInterval: 30_000,
  })

  const now = new Date()
  const slots = buildSlots(availability?.data ?? [], date, now)
  const slotIdx = startMin === null ? -1 : slots.findIndex((s) => s.startMin === startMin)
  const stillValid = slotIdx >= 0 && canStartAt(slots, slotIdx, count)

  // Drop a selection that became invalid (time passed, taken, or duration changed).
  useEffect(() => {
    if (startMin !== null && !stillValid && step === 'pick') setStartMin(null)
  }, [startMin, stillValid, step])

  const startAt = useMemo(() => {
    if (startMin === null) return null
    const d = new Date(date)
    d.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
    return d
  }, [date, startMin])
  const endAt = startAt ? new Date(startAt.getTime() + count * SLOT_MIN * 60_000) : null

  const { data: quote, isLoading: quoteLoading } = useQuery({
    queryKey: ['pricing-quote', resource?.id, startAt?.toISOString(), endAt?.toISOString()],
    queryFn: () => tenantApi.pricingQuote(resource!.id, startAt!.toISOString(), endAt!.toISOString()),
    enabled: step !== 'pick' && !!resource && !!startAt && !!endAt,
  })
  const price = quote?.price_cents || (startMin !== null ? comboPrice(startMin, count) : 0)
  const regular = quote?.regular_cents ?? price
  const saving = Math.max(0, regular - price)

  const create = useMutation({
    mutationFn: () => {
      if (!resource || !startAt || !endAt) throw new Error('Odaberi termin.')
      if (startAt <= new Date()) throw new Error('Ovaj termin je u međuvremenu počeo. Odaberi neki od narednih.')
      return bookingApi.create(resource.id, startAt.toISOString(), endAt.toISOString(), notes, payment, phone)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      qc.invalidateQueries({ queryKey: ['availability'] })
      setStep('done')
    },
  })

  function reset() {
    setStep('pick')
    setStartMin(null)
    setNotes('')
    create.reset()
  }

  const dateLong = date.toLocaleDateString('sr-Latn-BA', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeRange = startMin !== null ? `${minutesToHHMM(startMin)} – ${minutesToHHMM(startMin + count * SLOT_MIN)}` : ''

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <Screen>
        <div className="pt-safe-6 flex flex-col items-center text-center px-4">
          <div className="w-20 h-20 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-glow animate-pop">
            <Icon name="check" className="w-10 h-10" strokeWidth={2.6} />
          </div>
          <h1 className="mt-6 text-[28px] font-bold text-gray-900">Termin je rezervisan</h1>
          <p className="mt-2 text-[15px] text-gray-500 max-w-[300px]">
            Vidimo se na terenu. Termin uvijek imaš u kartici Termini.
          </p>
        </div>
        <Group>
          <Row icon="pin" iconTone="green" label={resource?.name ?? 'Teren'} />
          <Row icon="calendar" label={<span className="first-letter:uppercase block">{dateLong}</span>} />
          <Row icon="clock" label={timeRange} detail={count === 2 ? '2 termina zaredom · 150 min' : '75 min'} />
          <Row icon={payment === 'cash' ? 'cash' : 'card'} label={fmtMoney(price)} detail={payment === 'cash' ? 'Gotovina na terenu' : 'Kartica na terenu'} />
        </Group>
        <div className="space-y-2.5">
          <button onClick={() => onNav('bookings')} className="btn-primary">
            Moji termini
          </button>
          <button onClick={reset} className="btn-secondary">
            Rezerviši još jedan
          </button>
        </div>
      </Screen>
    )
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (step === 'confirm' && startAt) {
    const expired = startAt <= now
    return (
      <Screen title="Potvrdi rezervaciju" onBack={() => setStep('pick')} bottomInset={false}>
        <Group>
          <Row icon="pin" iconTone="green" label={resource?.name ?? 'Teren'} />
          <Row icon="calendar" label={<span className="first-letter:uppercase block">{dateLong}</span>} />
          <Row icon="clock" label={timeRange} detail={count === 2 ? '2 termina zaredom · 150 min' : '1 termin · 75 min'} />
        </Group>

        <div className="bg-white rounded-2xl shadow-card px-4 py-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[13px] text-gray-500">Ukupno za platiti</div>
              <div className="mt-1 text-[30px] font-bold text-gray-900 leading-none tabular-nums">
                {quoteLoading ? '…' : fmtMoney(price)}
              </div>
            </div>
            {saving > 0 && !quoteLoading && (
              <div className="text-right">
                <div className="text-[14px] text-gray-400 line-through tabular-nums">{fmtMoney(regular)}</div>
                <div className="mt-1 inline-flex text-[12px] font-semibold text-teal-800 bg-teal-50 rounded-md px-2 py-0.5">
                  Ušteda {fmtMoney(saving)}
                </div>
              </div>
            )}
          </div>
        </div>

        <Section title="Plaćanje" footer="Plaćaš na terenu pri dolasku, gotovinom ili karticom na POS terminalu.">
          <SegmentedControl
            value={payment}
            onChange={setPayment}
            options={[
              { value: 'cash', label: 'Gotovina' },
              { value: 'card', label: 'Kartica' },
            ]}
          />
        </Section>

        <Section title="Kontakt">
          <div className="space-y-3">
            <label className="block">
              <span className="label">Broj telefona</span>
              <input
                id="booking-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+387 61 000 000"
                className="field"
              />
            </label>
            <label className="block">
              <span className="label">Napomena (nije obavezno)</span>
              <input
                id="booking-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="npr. igramo 5 na 5"
                className="field"
              />
            </label>
          </div>
        </Section>

        {expired && <ErrorNote>Ovaj termin je u međuvremenu počeo. Vrati se i odaberi neki od narednih.</ErrorNote>}
        {create.error && <ErrorNote>{create.error instanceof Error ? create.error.message : 'Rezervacija nije uspjela.'}</ErrorNote>}

        <div className="sticky bottom-[calc(58px+env(safe-area-inset-bottom))] -mx-4 px-4 pt-3 pb-4 bg-gradient-to-t from-app via-app to-app/0">
          <button onClick={() => create.mutate()} disabled={create.isPending || expired || quoteLoading} className="btn-primary">
            {create.isPending ? 'Rezervišem…' : `Potvrdi · ${fmtMoney(price)}`}
          </button>
        </div>
      </Screen>
    )
  }

  // ── Pick ──────────────────────────────────────────────────────────────────
  return (
    <Screen title="Rezerviši termin" bottomInset={false}>
      {pitches.length > 1 && (
        <SegmentedControl
          value={resource?.id ?? ''}
          onChange={(id) => {
            setResource(pitches.find((p) => p.id === id) ?? null)
            setStartMin(null)
          }}
          options={pitches.map((p) => ({ value: p.id, label: p.name }))}
        />
      )}

      <Section title="Koliko igrate?">
        <div className="grid grid-cols-2 gap-2">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={clsx(
                'relative text-left rounded-2xl px-4 py-3 transition-all',
                count === n ? 'bg-gray-900 text-white shadow-lift' : 'bg-white text-gray-900 shadow-card',
              )}
            >
              <div className="text-[15px] font-semibold">{n === 1 ? '1 termin' : '2 termina zaredom'}</div>
              <div className={clsx('text-[13px]', count === n ? 'text-gray-400' : 'text-gray-500')}>
                {n === 1 ? '75 min' : '150 min'}
              </div>
              {n === 2 && (
                <span
                  className={clsx(
                    'absolute top-3 right-3 text-[11px] font-bold rounded-md px-1.5 py-0.5',
                    count === 2 ? 'bg-lime-400 text-gray-900' : 'bg-teal-50 text-teal-800',
                  )}
                >
                  −10%
                </span>
              )}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Dan">
        <DayStrip
          value={date}
          onChange={(d) => {
            setDate(d)
            setStartMin(null)
          }}
        />
      </Section>

      <Section
        title={<span className="first-letter:uppercase inline-block">{date.toLocaleDateString('sr-Latn-BA', { weekday: 'long', day: 'numeric', month: 'long' })}</span>}
        action={isFetching ? <span className="w-4 h-4 mb-1 rounded-full border-2 border-gray-200 border-t-teal-600 animate-spin" /> : undefined}
      >
        <SlotGrid slots={slots} count={count} selected={startMin} onSelect={setStartMin} />
        <p className="px-1 mt-3 text-[12px] text-gray-500">Termini koji su počeli ili su prošli ne mogu se rezervisati.</p>
      </Section>

      {/* Sticky continue bar */}
      <div className="sticky bottom-[calc(58px+env(safe-area-inset-bottom))] -mx-4 px-4 pt-3 pb-4 bg-gradient-to-t from-app via-app to-app/0">
        {startMin !== null && stillValid ? (
          <button onClick={() => setStep('confirm')} className="btn-primary justify-between px-5">
            <span className="text-left leading-tight">
              <span className="block text-[15px] font-semibold tabular-nums">{timeRange}</span>
              <span className="block text-[12px] font-medium text-teal-100">{count === 2 ? '2 termina' : '1 termin'} · {fmtMoney(comboPrice(startMin, count))}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              Nastavi
              <Icon name="chevron-right" className="w-5 h-5" strokeWidth={2.4} />
            </span>
          </button>
        ) : (
          <div className="h-14 rounded-2xl bg-gray-200/60 text-gray-500 text-[15px] font-medium flex items-center justify-center">
            Odaberi termin
          </div>
        )}
      </div>
    </Screen>
  )
}
