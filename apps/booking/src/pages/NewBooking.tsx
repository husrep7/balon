import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi, bookingApi } from '../lib/api'
import type { Resource } from '../lib/api'
import { MonthCalendar } from '../components/MonthCalendar'
import { addDays, startOfDay } from '../lib/utils'
import type { Page } from '../components/Shell'

interface Props { onNav: (page: Page) => void }

type Step = 'date' | 'time' | 'confirm'

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
      await bookingApi.create(resource.id, startAt.toISOString(), endAt.toISOString(), notes, paymentPref)
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
    setStartMinutes(null); setNotes(''); setPaymentPref('cash'); setResults([]); setDone(false)
  }

  if (done) {
    const ok = results.filter((r) => r.ok).length
    const fail = results.filter((r) => !r.ok).length
    return (
      <div className="px-4 py-8 text-center space-y-4">
        <div className="text-5xl">{fail === 0 ? '🎉' : '⚠️'}</div>
        <h2 className="text-lg font-semibold text-gray-800">
          {fail === 0 ? 'Rezervacija uspješna!' : `${ok} od ${ok + fail} termina rezervisano`}
        </h2>
        {results.map((r, i) => (
          <div key={i} className={`text-sm ${r.ok ? 'text-teal-700' : 'text-red-600'}`}>
            {i === 0 ? 'Ovaj termin' : `+${i} sedmica`}: {r.ok ? '✓ Rezervisano' : `✗ ${r.error}`}
          </div>
        ))}
        <div className="flex gap-3 justify-center mt-4">
          <button onClick={reset} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700">
            Nova rezervacija
          </button>
          <button onClick={() => onNav('dashboard')} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium">
            Na početnu
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      {/* Progress */}
      <div className="flex items-center gap-1 mb-6">
        {(['date', 'time', 'confirm'] as Step[]).map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1.5 rounded-full transition-colors ${
              step === s ? 'bg-teal-600'
              : i < (['date', 'time', 'confirm'] as Step[]).indexOf(step) ? 'bg-teal-400'
              : 'bg-gray-200'
            }`} />
          </div>
        ))}
      </div>

      {/* Step 1 — datum */}
      {step === 'date' && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Odaberi datum</h2>
          <MonthCalendar
            selected={date}
            today={today}
            onSelect={(d) => { setDate(d); setStep('time') }}
          />
        </div>
      )}

      {/* Step 2 — termin */}
      {step === 'time' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('date')} className="text-gray-400 hover:text-gray-600">←</button>
            <h2 className="text-lg font-semibold text-gray-800">Odaberi termin</h2>
          </div>
          <p className="text-sm text-gray-500">
            {date.toLocaleDateString('bs-BA', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}trajanje 1h 15min
          </p>

          {slots.filter((s) => !s.past).length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Nema dostupnih termina za danas. Odaberi drugi datum.</p>
          ) : (
            <div className="space-y-2">
              {slots.filter((s) => !s.past).map(({ startMin, endMin, busy }) => {
                const price = slotPrice(startMin)
                const isPeak = startMin >= PEAK_START
                return (
                  <button
                    key={startMin}
                    disabled={busy}
                    onClick={() => { setStartMinutes(startMin); setStep('confirm') }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                      busy
                        ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                        : 'bg-white text-gray-800 border-gray-200 hover:border-teal-400 hover:bg-teal-50 active:bg-teal-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-medium ${busy ? 'text-gray-300' : 'text-gray-800'}`}>
                        {minutesToDisplay(startMin)} – {minutesToDisplay(endMin)}
                      </span>
                      {isPeak && !busy && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">večernji</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {busy ? (
                        <span className="text-xs text-gray-300">Zauzeto</span>
                      ) : (
                        <span className="text-sm font-semibold text-teal-700">{price / 100} KM</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-400 pt-1">
            <span>Dnevna cijena (08–16h): <strong className="text-gray-600">80 KM</strong></span>
            <span>Večernja (od 16h): <strong className="text-gray-600">110 KM</strong></span>
          </div>
        </div>
      )}

      {/* Step 3 — potvrda */}
      {step === 'confirm' && startAt && endAt && price !== null && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('time')} className="text-gray-400 hover:text-gray-600">←</button>
            <h2 className="text-lg font-semibold text-gray-800">Potvrdi rezervaciju</h2>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 space-y-2">
            <Row label="Datum" value={date.toLocaleDateString('bs-BA', { day: 'numeric', month: 'long', year: 'numeric' })} />
            <Row label="Termin" value={`${minutesToDisplay(startMinutes!)} – ${minutesToDisplay(startMinutes! + DURATION)}`} />
            <Row label="Trajanje" value="1h 15min" />
            <div className="border-t border-teal-200 pt-2 mt-1 flex justify-between text-sm font-semibold">
              <span className="text-teal-800">Cijena</span>
              {quoteLoading
                ? <span className="text-teal-300 animate-pulse">Računa se...</span>
                : <span className="text-teal-800">{(price ?? 0) / 100} KM</span>
              }
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Napomena (opcionalno)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="npr. ekipa 5v5"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Način plaćanja */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Način plaćanja</label>
            <div className="flex gap-3 mb-3">
              {(['cash', 'card'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentPref(method)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors ${
                    paymentPref === method
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300'
                  }`}
                >
                  <span>{method === 'cash' ? '💵' : '💳'}</span>
                  <span>{method === 'cash' ? 'Gotovina' : 'Kartica'}</span>
                </button>
              ))}
            </div>
            {paymentPref === 'cash' && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
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
            className="w-full bg-teal-600 text-white py-4 rounded-2xl text-base font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {createBooking.isPending ? 'Rezervišem...' : quoteLoading ? 'Učitava cijenu...' : `Rezerviši · ${(price ?? 0) / 100} KM`}
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 text-right ml-2">{value}</span>
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
