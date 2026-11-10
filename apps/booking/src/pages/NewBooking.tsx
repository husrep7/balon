import { useState, useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi, bookingApi } from '../lib/api'
import type { Resource } from '../lib/api'
import { MonthCalendar } from '../components/MonthCalendar'
import { PitchLines } from '../components/Brand'
import { addDays, startOfDay } from '../lib/utils'
import type { Page } from '../components/Shell'

interface Props { onNav: (page: Page) => void }

type Step = 'date' | 'time' | 'confirm'

const STEPS: { key: Step; label: string; title: string }[] = [
  { key: 'date', label: 'Datum', title: 'Odaberi datum' },
  { key: 'time', label: 'Termin', title: 'Odaberi termin' },
  { key: 'confirm', label: 'Potvrda', title: 'Potvrdi rezervaciju' },
]

const DURATION = 75                // minuta — fiksno
const OPEN_HOUR = 8                // 08:00
const CLOSE_MINUTES = 23 * 60      // 23:00
const PEAK_START = 16 * 60         // od 16:00 — skuplja cijena
const PRICE_DAY = 8000             // cents — 80 KM
const PRICE_PEAK = 11000           // cents — 110 KM

function minutesToDisplay(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, '0')
  const min = (m % 60).toString().padStart(2, '0')
  return `${h}:${min}`
}

function slotPrice(startMinutes: number) {
  return startMinutes < PEAK_START ? PRICE_DAY : PRICE_PEAK
}

export function NewBooking({ onNav }: Props) {
  const qc = useQueryClient()
  const today = startOfDay(new Date())

  const [step, setStep] = useState<Step>('date')
  const [resource, setResource] = useState<Resource | null>(null)
  const [date, setDate] = useState<Date>(today)
  const [startMinutes, setStartMinutes] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentPref, setPaymentPref] = useState<'cash' | 'card'>('cash')
  const [results, setResults] = useState<{ week: number; ok: boolean; error?: string }[]>([])
  const [done, setDone] = useState(false)

  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })
  useEffect(() => {
    if (!resource && resources?.data.length) {
      setResource(resources.data.find((r) => !r.parent_id) ?? resources.data[0])
    }
  }, [resources, resource])

  // Re-render svake minute da se prošli termini automatski sakriju
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const startAt = startMinutes !== null ? (() => {
    const d = new Date(date)
    d.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)
    return d
  })() : null
  const endAt = startAt ? new Date(startAt.getTime() + DURATION * 60000) : null

  const from = startOfDay(date)
  const to = addDays(from, 1)
  const { data: availability } = useQuery({
    queryKey: ['availability', resource?.id, date.toISOString()],
    queryFn: () => tenantApi.availability(resource!.id, from.toISOString(), to.toISOString()),
    enabled: !!resource && step === 'time',
  })

  const createBooking = useMutation({
    mutationFn: async () => {
      if (!startAt || !endAt || !resource) throw new Error('Nedostaju podaci')
      await bookingApi.create(resource.id, startAt.toISOString(), endAt.toISOString(), notes, paymentPref, phone)
      return [{ week: 0, ok: true }]
    },
    onSuccess: (res) => {
      setResults(res)
      setDone(true)
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      qc.invalidateQueries({ queryKey: ['availability'] })
    },
  })

  const slots = generateSlots(availability?.data ?? [], date)

  // Fetchuj stvarnu cijenu sa backenda na confirm koraku
  const { data: quoteData, isLoading: quoteLoading } = useQuery({
    queryKey: ['pricing-quote', resource?.id, startAt?.toISOString(), endAt?.toISOString()],
    queryFn: () => tenantApi.pricingQuote(resource!.id, startAt!.toISOString(), endAt!.toISOString()),
    enabled: step === 'confirm' && !!resource && !!startAt && !!endAt,
  })

  const price = quoteData?.price_cents ?? (startMinutes !== null ? slotPrice(startMinutes) : null)

  function reset() {
    setStep('date'); setDate(today)
    setStartMinutes(null); setNotes(''); setPhone(''); setPaymentPref('cash'); setResults([]); setDone(false)
  }

  if (done) {
    const ok = results.filter((r) => r.ok).length
    const fail = results.filter((r) => !r.ok).length
    const isSuccess = fail === 0
    const displayPrice = price ?? (startMinutes !== null ? slotPrice(startMinutes) : null)

    return (
      <div className="min-h-full bg-gray-50 flex flex-col -mb-32 pb-32">
        {/* Header band */}
        <div className={`relative overflow-hidden ${isSuccess ? 'bg-gray-900' : 'bg-amber-500'} px-6 pt-14 pb-20 text-center`}>
          {isSuccess && <PitchLines />}
          <div className={`relative w-20 h-20 ${isSuccess ? 'bg-lime-400 text-gray-900' : 'bg-white/20'} rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-glow`}>
            {isSuccess ? (
              <svg className="w-10 h-10 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            )}
          </div>
          <h1 className="relative text-3xl font-extrabold text-white mb-1.5">
            {isSuccess ? 'Rezervacija potvrđena!' : `${ok} od ${ok + fail} termina rezervisano`}
          </h1>
          <p className={`relative text-sm ${isSuccess ? 'text-gray-400' : 'text-amber-100'}`}>
            Potvrda je poslana na tvoj email
          </p>
        </div>

        {/* Details card — overlaps the band */}
        <div className="px-4 -mt-10 flex-1 flex flex-col gap-4">
          <div className="card overflow-hidden">
            {/* Teren header */}
            {resource && (
              <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-medium text-gray-600">{resource.name}</span>
              </div>
            )}

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              <SuccessRow
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
                label="Datum"
                value={date.toLocaleDateString('sr-Latn-BA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              />
              <SuccessRow
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                label="Termin"
                value={startMinutes !== null ? `${minutesToDisplay(startMinutes)} – ${minutesToDisplay(startMinutes + DURATION)}` : ''}
              />
              <SuccessRow
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
                label="Trajanje"
                value="1h 15min"
              />
              {displayPrice !== null && (
                <SuccessRow
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  }
                  label="Iznos"
                  value={`${displayPrice / 100} KM`}
                  highlight
                />
              )}
              <SuccessRow
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={paymentPref === 'cash'
                      ? "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      : "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    } />
                  </svg>
                }
                label="Plaćanje"
                value={paymentPref === 'cash' ? 'Gotovina pri dolasku' : 'Kartica — POS terminal'}
              />
            </div>
          </div>

          {/* Error list if partial */}
          {fail > 0 && (
            <div className="space-y-1.5">
              {results.filter((r) => !r.ok).map((r, i) => (
                <div key={i} className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  ✗ {r.error}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3 pb-8">
            <button
              onClick={() => onNav('dashboard')}
              className="btn-primary"
            >
              Na početnu
            </button>
            <button
              onClick={reset}
              className="btn-secondary"
            >
              Nova rezervacija
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 pt-6">
      {/* Stepper */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          {step !== 'date' && (
            <button
              onClick={() => setStep(step === 'confirm' ? 'time' : 'date')}
              className="w-10 h-10 -ml-1 rounded-xl bg-white ring-1 ring-gray-200 shadow-card flex items-center justify-center text-gray-700 active:scale-95 transition-transform"
              aria-label="Nazad"
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.5 4.5 7 10l5.5 5.5" />
              </svg>
            </button>
          )}
          <div>
            <p className="eyebrow">Korak {STEPS.findIndex((x) => x.key === step) + 1} od 3</p>
            <h1 className="text-2xl font-extrabold text-gray-900 leading-tight mt-0.5">
              {STEPS.find((x) => x.key === step)?.title}
            </h1>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {STEPS.map((x, i) => {
            const idx = STEPS.findIndex((y) => y.key === step)
            return (
              <div key={x.key}>
                <div className={`h-1.5 rounded-full transition-colors duration-300 ${
                  i < idx ? 'bg-teal-500' : i === idx ? 'bg-gray-900' : 'bg-gray-200'
                }`} />
                <p className={`mt-1.5 text-[11px] font-medium ${i <= idx ? 'text-gray-700' : 'text-gray-400'}`}>{x.label}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Step 1 — datum */}
      {step === 'date' && (
        <div className="space-y-3 animate-fade-up">
          <MonthCalendar
            selected={date}
            today={today}
            onSelect={(d) => { setDate(d); setStep('time') }}
          />
        </div>
      )}

      {/* Step 2 — termin */}
      {step === 'time' && (
        <div className="space-y-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 first-letter:uppercase">
              {date.toLocaleDateString('sr-Latn-BA', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <span className="text-xs font-medium text-gray-500 bg-white ring-1 ring-gray-200 rounded-full px-2.5 py-1">
              ⏱ 1h 15min
            </span>
          </div>

          {slots.filter((s) => !s.past).length === 0 ? (
            <div className="card py-12 px-6 text-center">
              <p className="text-sm font-semibold text-gray-900">Nema slobodnih termina</p>
              <p className="text-xs text-gray-500 mt-1">Odaberi drugi datum.</p>
              <button onClick={() => setStep('date')} className="mt-4 text-sm font-semibold text-teal-700">← Promijeni datum</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {slots.filter((s) => !s.past).map(({ startMin, endMin, busy }) => {
                const price = slotPrice(startMin)
                const isPeak = startMin >= PEAK_START
                return (
                  <button
                    key={startMin}
                    disabled={busy}
                    onClick={() => { setStartMinutes(startMin); setStep('confirm') }}
                    className={`relative text-left rounded-2xl px-4 py-3.5 transition-all ${
                      busy
                        ? 'bg-gray-100/80 text-gray-300 cursor-not-allowed'
                        : 'bg-white ring-1 ring-gray-200 shadow-card hover:ring-teal-400 hover:shadow-lift active:scale-[0.97]'
                    }`}
                  >
                    <p className={`text-lg font-display font-extrabold leading-none ${busy ? 'text-gray-300 line-through decoration-2' : 'text-gray-900'}`}>
                      {minutesToDisplay(startMin)}
                    </p>
                    <p className={`text-[11px] mt-1 ${busy ? 'text-gray-300' : 'text-gray-400'}`}>do {minutesToDisplay(endMin)}</p>
                    <div className="mt-3 flex items-center justify-between">
                      {busy ? (
                        <span className="text-xs font-medium text-gray-400">Zauzeto</span>
                      ) : (
                        <span className="text-sm font-bold text-teal-700">{price / 100} KM</span>
                      )}
                      {isPeak && !busy && (
                        <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">🌙 veče</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-2xl bg-white ring-1 ring-gray-200 px-4 py-3">
              <p className="text-gray-400">☀️ Dnevna · 08–16h</p>
              <p className="mt-0.5 font-bold text-gray-900">80 KM</p>
            </div>
            <div className="rounded-2xl bg-white ring-1 ring-gray-200 px-4 py-3">
              <p className="text-gray-400">🌙 Večernja · od 16h</p>
              <p className="mt-0.5 font-bold text-gray-900">110 KM</p>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — potvrda */}
      {step === 'confirm' && startAt && endAt && price !== null && (
        <div className="space-y-5 animate-fade-up">
          <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white shadow-lift">
            <PitchLines />
            <div className="pointer-events-none absolute -right-12 -top-16 w-56 h-56 rounded-full bg-teal-500/30 blur-3xl" />
            <div className="relative p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lime-400">{resource?.name ?? 'Teren'}</p>
              <p className="mt-3 font-display text-4xl font-extrabold leading-none">
                {minutesToDisplay(startMinutes!)}
                <span className="text-lg text-gray-400"> – {minutesToDisplay(startMinutes! + DURATION)}</span>
              </p>
              <p className="mt-2 text-sm text-gray-300 first-letter:uppercase">
                {date.toLocaleDateString('sr-Latn-BA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="relative flex items-center">
              <span className="w-5 h-5 -ml-2.5 rounded-full bg-gray-50" />
              <span className="flex-1 border-t-2 border-dashed border-white/15" />
              <span className="w-5 h-5 -mr-2.5 rounded-full bg-gray-50" />
            </div>
            <div className="relative px-5 py-4 flex items-center justify-between">
              <span className="text-sm text-gray-400">Ukupno · 1h 15min</span>
              {quoteLoading
                ? <span className="text-gray-500 animate-pulse text-sm">Računa se…</span>
                : <span className="text-2xl font-display font-extrabold text-lime-400">{(price ?? 0) / 100} KM</span>}
            </div>
          </div>

          <div>
            <label className="label">Broj telefona <span className="font-normal text-gray-400">(opcionalno)</span></label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+38761..."
              className="field"
            />
          </div>

          <div>
            <label className="label">Napomena <span className="font-normal text-gray-400">(opcionalno)</span></label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="npr. ekipa 5v5"
              className="field"
            />
          </div>

          {/* Način plaćanja */}
          <div>
            <label className="label">Način plaćanja</label>
            <div className="flex gap-3 mb-3">
              {(['cash', 'card'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentPref(method)}
                  className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl text-sm font-semibold transition-all ${
                    paymentPref === method
                      ? 'bg-gray-900 text-white shadow-lift'
                      : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-teal-300'
                  }`}
                >
                  <span>{method === 'cash' ? '💵' : '💳'}</span>
                  <span>{method === 'cash' ? 'Gotovina' : 'Kartica'}</span>
                </button>
              ))}
            </div>
            {paymentPref === 'cash' && (
              <p className="text-xs text-gray-500 bg-white ring-1 ring-gray-200 rounded-2xl px-4 py-3">
                Plaćanje gotovinom na licu mjesta pri dolasku.
              </p>
            )}
            {paymentPref === 'card' && <CardForm />}
          </div>

          {createBooking.error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {createBooking.error instanceof Error ? createBooking.error.message : 'Greška'}
            </div>
          )}

          <button
            onClick={() => createBooking.mutate()}
            disabled={createBooking.isPending}
            className="btn-primary"
          >
            {createBooking.isPending ? 'Rezervišem...' : quoteLoading ? 'Učitava cijenu...' : `Rezerviši · ${(price ?? 0) / 100} KM`}
          </button>
        </div>
      )}
    </div>
  )
}

function SuccessRow({ icon, label, value, highlight }: { icon: ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="text-sm text-gray-500 w-24 shrink-0">{label}</span>
      <span className={`text-sm font-medium ml-auto text-right ${highlight ? 'text-teal-700 font-semibold' : 'text-gray-800'}`}>{value}</span>
    </div>
  )
}

interface SlotInfo { startMin: number; endMin: number; busy: boolean; past: boolean }

function generateSlots(busyBookings: { start_at: string; end_at: string }[], forDate: Date): SlotInfo[] {
  const now = new Date()
  const isToday = forDate.toDateString() === now.toDateString()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const slots: SlotInfo[] = []
  let start = OPEN_HOUR * 60

  while (start + DURATION <= CLOSE_MINUTES) {
    const end = start + DURATION
    // Sakrij ako je termin počeo (prošao ili u toku) — start <= now pokriva oba slučaja
    const past = isToday && start <= nowMinutes

    const busy = busyBookings.some((b) => {
      const bStart = new Date(b.start_at).getHours() * 60 + new Date(b.start_at).getMinutes()
      const bEnd = new Date(b.end_at).getHours() * 60 + new Date(b.end_at).getMinutes()
      return start < bEnd && end > bStart
    })

    slots.push({ startMin: start, endMin: end, busy, past })
    start += DURATION
  }

  return slots
}

// ---------- Card form ----------

function CardForm() {
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvv: '' })
  const [saved, setSaved] = useState(false)

  function formatNumber(v: string) {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  }
  function formatExpiry(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 4)
    return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d
  }

  if (saved) {
    const last4 = card.number.replace(/\s/g, '').slice(-4)
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-800">💳 Kartica dodana</p>
          <p className="text-xs text-blue-600 mt-0.5">•••• •••• •••• {last4} · {card.name}</p>
        </div>
        <button onClick={() => setSaved(false)} className="text-xs text-blue-500 hover:text-blue-700">Promijeni</button>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-medium text-gray-600">Podaci kartice</p>
      <div>
        <label className="text-[11px] text-gray-500 block mb-1">Broj kartice</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="1234 5678 9012 3456"
          value={card.number}
          onChange={(e) => setCard(c => ({ ...c, number: formatNumber(e.target.value) }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>
      <div>
        <label className="text-[11px] text-gray-500 block mb-1">Ime na kartici</label>
        <input
          type="text"
          placeholder="IME PREZIME"
          value={card.name}
          onChange={(e) => setCard(c => ({ ...c, name: e.target.value.toUpperCase() }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[11px] text-gray-500 block mb-1">Datum isteka</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM/GG"
            value={card.expiry}
            onChange={(e) => setCard(c => ({ ...c, expiry: formatExpiry(e.target.value) }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="w-24">
          <label className="text-[11px] text-gray-500 block mb-1">CVV</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="123"
            value={card.cvv}
            onChange={(e) => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>
      <button
        type="button"
        disabled={card.number.replace(/\s/g, '').length < 16 || !card.name || card.expiry.length < 5 || card.cvv.length < 3}
        onClick={() => setSaved(true)}
        className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
      >
        Dodaj karticu
      </button>
      <p className="text-[11px] text-gray-400 text-center">
        🔒 Plaćanje će biti izvršeno pri dolasku putem POS terminala
      </p>
    </div>
  )
}
