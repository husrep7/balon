import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { fmtMoney } from '../lib/utils'

// Fixed slot grid. The server enforces the same rules (no past or started
// slots, one or two consecutive slots per booking).
export const SLOT_MIN = 75
export const OPEN_MIN = 8 * 60
export const CLOSE_MIN = 23 * 60
export const PEAK_START = 16 * 60
export const CONSECUTIVE_DISCOUNT = 0.1

/** Indicative per-slot price; the confirm step always shows the server quote. */
export function slotPrice(startMin: number) {
  return startMin < PEAK_START ? 8000 : 11000
}

/** Mirrors the server: sum of slots minus 10%, rounded down to whole KM. */
export function comboPrice(startMin: number, slots: number) {
  let sum = 0
  for (let i = 0; i < slots; i++) sum += slotPrice(startMin + i * SLOT_MIN)
  if (slots <= 1) return sum
  return Math.floor((sum * (1 - CONSECUTIVE_DISCOUNT)) / 100) * 100
}

export function minutesToHHMM(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export interface Slot {
  startMin: number
  endMin: number
  busy: boolean
  /** Started or already over: never bookable. */
  past: boolean
}

export function buildSlots(
  bookings: { id?: string; start_at: string; end_at: string; status?: string }[],
  day: Date,
  now: Date,
  ignoreId?: string,
): Slot[] {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const rel = (iso: string) => (new Date(iso).getTime() - dayStart.getTime()) / 60000
  const taken = bookings
    .filter((b) => b.id !== ignoreId && b.status !== 'cancelled' && b.status !== 'no_show')
    .map((b) => [rel(b.start_at), rel(b.end_at)] as const)
  const nowMin = (now.getTime() - dayStart.getTime()) / 60000

  const out: Slot[] = []
  for (let s = OPEN_MIN; s + SLOT_MIN <= CLOSE_MIN; s += SLOT_MIN) {
    const e = s + SLOT_MIN
    out.push({
      startMin: s,
      endMin: e,
      busy: taken.some(([a, z]) => s < z && e > a),
      past: s <= nowMin,
    })
  }
  return out
}

/** Can a booking of `count` consecutive slots start at slot index `i`? */
export function canStartAt(slots: Slot[], i: number, count: number) {
  for (let k = 0; k < count; k++) {
    const sl = slots[i + k]
    if (!sl || sl.busy || sl.past) return false
  }
  return true
}

// ── Day strip ───────────────────────────────────────────────────────────────
const DOW = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub']

export function DayStrip({ value, onChange, days = 21 }: { value: Date; onChange: (d: Date) => void; days?: number }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const list = Array.from({ length: days }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    return d
  })
  const selectedRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [value])

  return (
    <div className="-mx-4 px-4 scroll-px-4 overflow-x-auto no-scrollbar snap-x">
      <div className="flex gap-2 w-max pb-1">
        {list.map((d, i) => {
          const sel = d.toDateString() === value.toDateString()
          const label = i === 0 ? 'Danas' : i === 1 ? 'Sutra' : DOW[d.getDay()]
          return (
            <button
              key={d.toISOString()}
              ref={sel ? selectedRef : undefined}
              onClick={() => onChange(d)}
              className={clsx(
                'snap-start w-[58px] h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95',
                sel ? 'bg-gray-900 text-white shadow-lift' : 'bg-white text-gray-900 shadow-card',
              )}
            >
              <span className={clsx('text-[11px] font-semibold', sel ? 'text-lime-400' : 'text-gray-500')}>{label}</span>
              <span className="text-[20px] font-bold leading-none tabular-nums">{d.getDate()}</span>
              <span className={clsx('text-[10px]', sel ? 'text-gray-400' : 'text-gray-400')}>
                {d.toLocaleDateString('sr-Latn-BA', { month: 'short' }).replace('.', '')}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Slot grid, grouped by part of day ──────────────────────────────────────
const PARTS = [
  { label: 'Prijepodne', from: 0, to: 12 * 60 },
  { label: 'Popodne', from: 12 * 60, to: PEAK_START },
  { label: 'Veče', from: PEAK_START, to: 24 * 60 },
]

export function SlotGrid({
  slots,
  count,
  selected,
  onSelect,
}: {
  slots: Slot[]
  count: number
  selected: number | null
  onSelect: (startMin: number) => void
}) {
  const upcoming = slots.filter((s) => !s.past)
  if (upcoming.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card px-5 py-8 text-center">
        <p className="text-[15px] font-semibold text-gray-900">Za danas više nema termina</p>
        <p className="text-[13px] text-gray-500 mt-1">Odaberi neki od narednih dana.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {PARTS.map((part) => {
        const items = slots
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => !s.past && s.startMin >= part.from && s.startMin < part.to)
        if (items.length === 0) return null
        return (
          <div key={part.label}>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[13px] font-semibold text-gray-500">{part.label}</span>
              {part.from === PEAK_START && <span className="text-[12px] text-gray-400">večernja cijena</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {items.map(({ s, i }) => {
                const ok = canStartAt(slots, i, count)
                const isSel = selected === s.startMin
                const end = s.startMin + count * SLOT_MIN
                return (
                  <button
                    key={s.startMin}
                    disabled={!ok}
                    onClick={() => onSelect(s.startMin)}
                    className={clsx(
                      'relative text-left rounded-2xl px-4 py-3 transition-all',
                      !ok && 'bg-gray-100 text-gray-400 cursor-not-allowed',
                      ok && !isSel && 'bg-white shadow-card active:scale-[0.97]',
                      isSel && 'bg-teal-600 text-white shadow-glow',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={clsx('text-[19px] font-bold tabular-nums', !ok && 'line-through decoration-gray-300')}>
                        {minutesToHHMM(s.startMin)}
                      </span>
                      {isSel && <span className="w-2 h-2 rounded-full bg-lime-400" />}
                    </div>
                    <div className={clsx('text-[12px] tabular-nums', isSel ? 'text-teal-100' : 'text-gray-500')}>
                      {ok ? `do ${minutesToHHMM(end)}` : s.busy ? 'Zauzeto' : 'Nije dostupno'}
                    </div>
                    {ok && (
                      <div className={clsx('mt-2 text-[14px] font-semibold', isSel ? 'text-white' : 'text-gray-900')}>
                        {fmtMoney(comboPrice(s.startMin, count))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
