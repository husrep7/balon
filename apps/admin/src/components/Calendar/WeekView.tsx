import { clsx } from 'clsx'
import { addDays, format, parseISO, startOfDay, startOfWeek, subDays } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useResources } from '@/hooks'
import { bookingApi } from '@/lib/api'
import { fmtMoney } from '@/lib/time'
import type { Booking } from '@/lib/types'
import { Button, Segmented } from '@/components/ui'
import { BookingDetail } from './BookingDetail'
import { CreateBookingModal } from './CreateBookingModal'

// ── Grid constants ─────────────────────────────────────────────────────────
const START_H = 8
const END_H = 23
const HOUR_PX = 64
const SLOT_MIN = 75           // booking slot duration in minutes
const TOTAL_H = END_H - START_H
const TOTAL_MIN = TOTAL_H * 60 // 900 min (08:00–23:00)
const GRID_H = TOTAL_H * HOUR_PX
const TIME_COL_W = 56

const BS_DAY = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub']

// Pre-computed slot boundaries: 08:00, 09:15, 10:30 … 23:00
const SLOT_BOUNDARIES = Array.from(
  { length: Math.floor(TOTAL_MIN / SLOT_MIN) + 1 },
  (_, i) => {
    const offsetMin = i * SLOT_MIN
    const totalMin = START_H * 60 + offsetMin
    return {
      top: (offsetMin / 60) * HOUR_PX,
      label: `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`,
      isStart: i === 0,
    }
  },
).filter((s) => s.top <= GRID_H)

function minToPx(min: number) {
  return (min / 60) * HOUR_PX
}
function dateToPx(d: Date) {
  return minToPx((d.getHours() - START_H) * 60 + d.getMinutes())
}

// ── Live clock ────────────────────────────────────────────────────────────
function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ── Main component ────────────────────────────────────────────────────────
export function WeekView() {
  const { data: resources = [] } = useResources()
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [modalSlot, setModalSlot] = useState<{ date: Date; resourceId: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = useNow()

  const sortedResources = useMemo(() => [...resources].sort((a, b) => a.path.localeCompare(b.path)), [resources])
  const [resourceId, setResourceId] = useState<string | null>(null)
  const currentResource = sortedResources.find((r) => r.id === resourceId) ?? sortedResources[0]
  const pathById = useMemo(() => new Map(resources.map((r) => [r.id, r.path])), [resources])
  const nameById = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources])
  /** True when resource `id` shares the pitch with the current one (parent or half). */
  function isLinked(id: string) {
    if (!currentResource || id === currentResource.id) return false
    const p = pathById.get(id)
    const cur = currentResource.path
    return !!p && (p.startsWith(cur + '.') || cur.startsWith(p + '.'))
  }

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const offset = dateToPx(now) - 120
      scrollRef.current.scrollTop = Math.max(0, offset)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Date ranges ──────────────────────────────────────────────────────────
  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: weekBookings = [], isFetching } = useQuery({
    queryKey: ['cal-week', format(weekStart, 'yyyy-MM-dd'), currentResource?.id],
    queryFn: () =>
      bookingApi
        .listAll({ from: weekStart.toISOString(), to: weekEnd.toISOString() })
        .then((r) => (r.data ?? []).filter((b) => b.resource_id === currentResource!.id || isLinked(b.resource_id))),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!currentResource,
  })

  // ── Columns (7 days) ─────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(weekStart, i)
        const dayStr = format(day, 'yyyy-MM-dd')
        return {
          key: dayStr,
          title: BS_DAY[day.getDay()],
          sub: format(day, 'd'),
          isToday: dayStr === format(new Date(), 'yyyy-MM-dd'),
          bookings: weekBookings.filter(
            (b) =>
              format(parseISO(b.start_at), 'yyyy-MM-dd') === dayStr &&
              b.status !== 'cancelled' &&
              b.status !== 'no_show',
          ),
          resourceId: currentResource?.id ?? '',
          date: day,
        }
      }),
    [weekStart, weekBookings, currentResource],
  )

  // ── Handlers ──────────────────────────────────────────────────────────────
  function navPrev() { setAnchor((a) => subDays(a, 7)) }
  function navNext() { setAnchor((a) => addDays(a, 7)) }
  function goToday() { setAnchor(startOfDay(new Date())) }

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const anchorStr = format(anchor, 'yyyy-MM-dd')
  const isAnchorToday = anchorStr === todayStr
  const nowPx = dateToPx(now)

  if (!resources.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="text-center max-w-sm">
          <p className="text-ink-500 text-sm mb-4">
            Nema resursa konfigurisanih. Dodaj teren da bi mogao primati rezervacije.
          </p>
          <Button variant="primary">+ Dodaj teren</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 border-b border-ink-200/80 bg-surface shrink-0">
        <div className="flex items-center rounded-xl ring-1 ring-inset ring-ink-200 bg-surface">
          <button
            onClick={navPrev}
            className="w-9 h-9 flex items-center justify-center rounded-l-xl hover:bg-ink-50 text-ink-600"
            aria-label="Prethodna sedmica"
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button
            onClick={goToday}
            className={clsx(
              'h-9 px-3 text-xs font-semibold border-x border-ink-200 transition-colors',
              isAnchorToday ? 'text-teal-700 bg-teal-50' : 'text-ink-700 hover:bg-ink-50',
            )}
          >
            Danas
          </button>
          <button
            onClick={navNext}
            className="w-9 h-9 flex items-center justify-center rounded-r-xl hover:bg-ink-50 text-ink-600"
            aria-label="Sljedeća sedmica"
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        <DateRangePicker anchor={anchor} weekStart={weekStart} onChange={setAnchor} />

        {sortedResources.length > 1 && (
          <Segmented
            value={currentResource?.id ?? ''}
            onChange={(id) => setResourceId(id)}
            options={sortedResources.map((r) => ({ value: r.id, label: r.name }))}
          />
        )}

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-3 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-paid-bg ring-1 ring-inset ring-paid-fg/40" />Plaćeno</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-unpaid-bg ring-1 ring-inset ring-unpaid-fg/40" />Nije plaćeno</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm hatch ring-1 ring-inset ring-ink-200" />Povezani teren</span>
        </div>

        {isFetching && <span className="w-4 h-4 rounded-full border-2 border-ink-200 border-t-teal-600 animate-spin" aria-label="Učitavam" />}

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            const d = new Date(anchor)
            d.setHours(8, 0, 0, 0)
            setModalSlot({ date: d, resourceId: currentResource?.id ?? resources[0].id })
            setSelectedBooking(null)
          }}
        >
          + Novi termin
        </Button>
      </div>

      {/* ── Calendar body ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden bg-surface-alt">
        {/* Scrollable grid */}
        <div className="flex-1 overflow-auto" ref={scrollRef}>
          <div className="min-w-[500px]">
            {/* Column headers — sticky */}
            <div
              className="flex sticky top-0 z-30 bg-surface border-b border-ink-200"
              style={{ paddingLeft: TIME_COL_W }}
            >
              {columns.map((col) => {
                const isToday = col.isToday
                return (
                  <div
                    key={col.key}
                    className={clsx(
                      'flex-1 border-l border-ink-200 py-2 text-center',
                      isToday && 'bg-teal-50/60',
                    )}
                  >
                    <div
                      className={clsx(
                        'text-[10px] font-semibold uppercase tracking-widest',
                        isToday ? 'text-teal-600' : 'text-ink-400',
                      )}
                    >
                      {col.title}
                    </div>
                    <div
                      className={clsx(
                        'text-xl font-bold tabular mt-0.5 leading-none w-8 h-8 rounded-full flex items-center justify-center mx-auto',
                        isToday ? 'bg-teal-600 text-white' : 'text-ink-700',
                      )}
                    >
                      {col.sub}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Time grid */}
            <div className="relative flex" style={{ height: GRID_H }}>
              {/* Time labels — 75-min slot starts: 08:00, 09:15 … 23:00 */}
              <div className="shrink-0 relative select-none" style={{ width: TIME_COL_W }}>
                {SLOT_BOUNDARIES.map((s, i) => {
                  const isLast = i === SLOT_BOUNDARIES.length - 1
                  return (
                    <div
                      key={s.label}
                      className="absolute text-[11px] tabular text-ink-500 font-medium"
                      style={{ top: isLast ? GRID_H - 14 : s.top + 3, right: 8 }}
                    >
                      {s.label}
                    </div>
                  )
                })}
              </div>

              {/* Background grid lines */}
              <div
                className="absolute inset-y-0 right-0 pointer-events-none"
                style={{ left: TIME_COL_W }}
              >
                {/* 75-min slot boundary lines — primary grid */}
                {SLOT_BOUNDARIES.map((s, i) => {
                  const isLast = i === SLOT_BOUNDARIES.length - 1
                  return (
                    <div
                      key={`slot-${s.label}`}
                      className={`absolute left-0 right-0 ${isLast ? 'border-t border-ink-200' : 'border-t border-ink-100'}`}
                      style={{ top: s.top }}
                    />
                  )
                })}
                {/* Alternating slot zone backgrounds */}
                {SLOT_BOUNDARIES.slice(0, -1).map((s, i) => (
                  i % 2 === 1 ? (
                    <div
                      key={`zone-${i}`}
                      className="absolute left-0 right-0 bg-teal-50/30"
                      style={{ top: s.top, height: (SLOT_MIN / 60) * HOUR_PX }}
                    />
                  ) : null
                ))}
              </div>

              {/* Columns */}
              {columns.map((col) => (
                <CalendarColumn
                  key={col.key}
                  resourceId={currentResource?.id}
                  linkedName={(id) => nameById.get(id) ?? 'povezani teren'}
                  bookings={col.bookings}
                  date={col.date}
                  isToday={col.isToday}
                  showNowLine={col.isToday}
                  nowPx={nowPx}
                  now={now}
                  selectedId={selectedBooking?.id}
                  onSelect={(b) => {
                    setSelectedBooking(b)
                    setModalSlot(null)
                  }}
                  onSlotClick={(d) => {
                    setModalSlot({ date: d, resourceId: col.resourceId })
                    setSelectedBooking(null)
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Detail side panel ───────────────────────────────────────── */}
        {selectedBooking && (
          <div className="w-80 shrink-0 border-l border-ink-200 bg-surface flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Detalji termina
              </span>
              <button
                onClick={() => setSelectedBooking(null)}
                className="text-ink-400 hover:text-ink-700 text-sm leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-ink-100"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <BookingDetail
                booking={selectedBooking}
                onClose={() => setSelectedBooking(null)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Create booking modal */}
      {modalSlot && (
        <CreateBookingModal
          open={!!modalSlot}
          onClose={() => setModalSlot(null)}
          resourceId={modalSlot.resourceId}
          startAt={modalSlot.date}
          existingBookings={weekBookings}
        />
      )}
    </div>
  )
}

// ── Calendar column ───────────────────────────────────────────────────────
interface ColProps {
  bookings: Booking[]
  date: Date
  isToday: boolean
  showNowLine: boolean
  nowPx: number
  now: Date
  selectedId?: string
  onSelect: (b: Booking) => void
  onSlotClick: (d: Date) => void
  resourceId?: string
  linkedName?: (id: string) => string
}

function CalendarColumn({
  resourceId,
  linkedName,
  bookings,
  date,
  isToday,
  showNowLine,
  nowPx,
  now,
  selectedId,
  onSelect,
  onSlotClick,
}: ColProps) {
  const [hover, setHover] = useState<{ top: number; type: 'free' | 'occupied' } | null>(null)

  const isPastDay = startOfDay(date) < startOfDay(now)
  const isFutureDay = startOfDay(date) > startOfDay(now)

  function yToSlot(y: number): { top: number; h: number; m: number } {
    const rawMin = (y / HOUR_PX) * 60
    const slotIdx = Math.floor(rawMin / SLOT_MIN)
    const snappedMin = slotIdx * SLOT_MIN
    const top = (snappedMin / 60) * HOUR_PX
    const totalMin = START_H * 60 + snappedMin
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return { top, h, m }
  }

  function isTimePast(top: number): boolean {
    if (isPastDay) return true
    if (isFutureDay) return false
    const offsetMin = (top / HOUR_PX) * 60
    const totalMin = START_H * 60 + offsetMin
    const slotStart = new Date(date)
    slotStart.setHours(Math.floor(totalMin / 60), totalMin % 60, 0, 0)
    return slotStart <= now
  }

  function isSlotOccupied(top: number): boolean {
    const slotStartMin = (top / HOUR_PX) * 60
    const slotEndMin = slotStartMin + SLOT_MIN
    return bookings.some((b) => {
      if (b.status === 'cancelled' || b.status === 'no_show') return false
      const bStart = parseISO(b.start_at)
      const bEnd = parseISO(b.end_at)
      const bStartMin = (bStart.getHours() - START_H) * 60 + bStart.getMinutes()
      const bEndMin = bStartMin + (bEnd.getTime() - bStart.getTime()) / 60000
      return bStartMin < slotEndMin && bEndMin > slotStartMin
    })
  }

  function isSlotBookable(top: number): boolean {
    return !isTimePast(top) && !isSlotOccupied(top)
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const { top } = yToSlot(e.clientY - rect.top)
    if (isTimePast(top)) {
      setHover(null)
    } else if (isSlotOccupied(top)) {
      setHover({ top, type: 'occupied' })
    } else {
      setHover({ top, type: 'free' })
    }
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const slot = yToSlot(e.clientY - rect.top)
    if (!isSlotBookable(slot.top)) return
    const d = new Date(date)
    d.setHours(slot.h, slot.m, 0, 0)
    onSlotClick(d)
  }

  return (
    <div
      className={clsx(
        'flex-1 relative border-l border-ink-200',
        isPastDay ? 'cursor-default' :
        hover?.type === 'occupied' ? 'cursor-not-allowed' : 'cursor-pointer',
        isToday && 'bg-teal-50/20',
      )}
      style={{ height: GRID_H }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* Past-time overlay */}
      {isPastDay && (
        <div className="absolute inset-0 bg-ink-900/[0.04] pointer-events-none z-[1]" />
      )}
      {isToday && nowPx > 0 && (
        <div
          className="absolute left-0 right-0 top-0 bg-ink-900/[0.04] pointer-events-none z-[1]"
          style={{ height: Math.min(nowPx, GRID_H) }}
        />
      )}

      {/* Hover slot highlight */}
      {hover && (
        <div
          className={clsx(
            'absolute left-0 right-0 rounded pointer-events-none z-[5]',
            hover.type === 'free'
              ? 'bg-teal-500/10 border border-teal-400/30'
              : 'bg-red-500/[0.07] border border-red-300/40',
          )}
          style={{ top: hover.top, height: (SLOT_MIN / 60) * HOUR_PX }}
        />
      )}

      {/* Now indicator */}
      {showNowLine && nowPx >= 0 && nowPx <= GRID_H && (
        <div
          className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
          style={{ top: nowPx }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 -ml-1.5" />
          <div className="flex-1 h-[1.5px] bg-red-400" />
        </div>
      )}

      {/* Booking blocks */}
      {bookings.map((b) =>
        linkedName && b.resource_id !== resourceId ? (
          <LinkedBlock key={b.id} booking={b} label={linkedName(b.resource_id)} />
        ) : (
          <BookingBlock
            key={b.id}
            booking={b}
            selected={b.id === selectedId}
            onSelect={onSelect}
          />
        ),
      )}
    </div>
  )
}

// ── Linked-pitch block (time taken on the parent pitch or a half) ─────────
function LinkedBlock({ booking, label }: { booking: Booking; label: string }) {
  const start = parseISO(booking.start_at)
  const end = parseISO(booking.end_at)
  const height = Math.max(minToPx((end.getTime() - start.getTime()) / 60000) - 2, 20)
  return (
    <div
      className="absolute left-1 right-1 rounded-md hatch ring-1 ring-inset ring-ink-200 z-[6] px-2 py-1 overflow-hidden"
      style={{ top: dateToPx(start), height }}
      title={`Zauzeto: ${label} · ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] font-semibold text-ink-500 leading-tight truncate">Zauzeto</div>
      <div className="text-[10px] text-ink-400 leading-tight truncate">{label}</div>
    </div>
  )
}

// ── Booking block ─────────────────────────────────────────────────────────
function BookingBlock({
  booking,
  selected,
  onSelect,
}: {
  booking: Booking
  selected: boolean
  onSelect: (b: Booking) => void
}) {
  const start = parseISO(booking.start_at)
  const end = parseISO(booking.end_at)
  const top = dateToPx(start)
  const durationMin = (end.getTime() - start.getTime()) / 60000
  const height = Math.max(minToPx(durationMin) - 2, 20)

  const paidCents = booking.paid_cents ?? 0
  const fullyPaid = paidCents >= booking.price_cents && booking.price_cents > 0
  const partiallyPaid = paidCents > 0 && !fullyPaid
  const isCancelled = booking.status === 'cancelled' || booking.status === 'no_show'

  const bgCls = isCancelled
    ? 'bg-noshow-bg border-noshow-fg/30'
    : fullyPaid
      ? 'bg-paid-bg border-paid-fg/30'
      : 'bg-unpaid-bg border-unpaid-fg/30'

  const accentCls = isCancelled
    ? 'bg-noshow-fg/60'
    : fullyPaid
      ? 'bg-paid-fg'
      : 'bg-unpaid-fg'

  const textCls = isCancelled
    ? 'text-noshow-fg'
    : fullyPaid
      ? 'text-paid-fg'
      : 'text-unpaid-fg'

  const name = booking.team_name ?? booking.customer_name ?? booking.notes ?? 'Termin'
  const isVip = booking.customer_tier === 'vip'

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onSelect(booking)
      }}
      title={`${isVip ? '★ ' : ''}${name} · ${format(start, 'HH:mm')}–${format(end, 'HH:mm')} · ${fmtMoney(booking.price_cents)}`}
      className={clsx(
        'absolute left-1 right-1 rounded border overflow-hidden text-left group transition-all',
        bgCls,
        textCls,
        isCancelled && 'opacity-55',
        selected ? 'ring-2 ring-teal-500 ring-offset-1 z-20' : 'z-10 hover:brightness-95',
      )}
      style={{ top, height }}
    >
      {/* Left colour bar */}
      <div className={clsx('absolute left-0 inset-y-0 w-1 rounded-l', accentCls)} />

      <div className="pl-2.5 pr-1.5 py-1 h-full flex flex-col overflow-hidden">
        <div className="flex items-start gap-0.5">
          {isVip && (
            <span className="text-[10px] leading-tight text-amber-500 shrink-0 mt-px" title="VIP klijent">★</span>
          )}
          {booking.customer_tier === 'regular' && (
            <svg viewBox="0 0 14 14" className="w-2.5 h-2.5 shrink-0 mt-px opacity-50" fill="currentColor" aria-hidden="true">
              <circle cx="7" cy="4.5" r="2.5"/>
              <path d="M1.5 12.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
            </svg>
          )}
          <div
            className={clsx(
              'text-[11px] font-semibold leading-tight min-w-0',
              isCancelled && 'line-through',
            )}
            style={{
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: height >= 40 ? 2 : 1,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {name}
          </div>
        </div>

        {height >= 30 && (
          <div className="text-[10px] opacity-70 tabular mt-0.5 leading-tight shrink-0">
            {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
          </div>
        )}

        {height >= 46 && (
          <div className="text-[10px] opacity-70 tabular leading-tight shrink-0 flex items-center gap-1 mt-0.5">
            <span>{fmtMoney(booking.price_cents)}</span>
            {fullyPaid && <span title="Plaćeno">✓</span>}
            {partiallyPaid && <span title="Djelimično plaćeno">½</span>}
            {booking.series_id && <span title="Stalna ekipa">↻</span>}
          </div>
        )}
      </div>
    </button>
  )
}

// ── Date range picker ─────────────────────────────────────────────────────
function DateRangePicker({
  anchor,
  weekStart,
  onChange,
}: {
  anchor: Date
  weekStart: Date
  onChange: (d: Date) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const label = `${format(weekStart, 'd. MMM')} – ${format(addDays(weekStart, 6), 'd. MMM yyyy.')}`

  return (
    <button
      className="relative text-sm font-semibold text-ink-800 hover:text-teal-700 transition-colors min-w-[180px] text-left"
      onClick={() => ref.current?.showPicker()}
      title="Klikni za odabir datuma"
    >
      {label}
      <span className="ml-1 text-ink-300 text-xs">▾</span>
      <input
        ref={ref}
        type="date"
        value={format(anchor, 'yyyy-MM-dd')}
        onChange={(e) => {
          if (e.target.value) onChange(startOfDay(new Date(e.target.value)))
        }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer"
        tabIndex={-1}
      />
    </button>
  )
}
