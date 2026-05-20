import { clsx } from 'clsx'
import { addDays, addWeeks, format, parseISO, subWeeks } from 'date-fns'
import { useMemo, useState } from 'react'

import { useBookings, useResources } from '@/hooks'
import { fmtMoney, fmtTime, weekDays } from '@/lib/time'
import type { Booking, Resource } from '@/lib/types'
import { Button } from '@/components/ui'
import { BookingDetail } from './BookingDetail'
import { CreateBookingModal } from './CreateBookingModal'

const GRID_START_HOUR = 16
const GRID_END_HOUR = 23
const ROWS_PER_HOUR = 2
const ROW_HEIGHT_PX = 28

const hours = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
)

interface SlotClick {
  date: Date
  hour: number
  half: 0 | 1
}

export function WeekView() {
  const { data: resources = [] } = useResources()
  const [selectedResourceId, setSelectedResourceId] = useState<string | undefined>()
  const [anchor, setAnchor] = useState(() => new Date())
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [modalSlot, setModalSlot] = useState<Date | null>(null)

  const currentResource = useMemo(() => {
    if (!resources.length) return undefined
    return resources.find((r) => r.id === selectedResourceId) ?? resources[0]
  }, [resources, selectedResourceId])

  const days = useMemo(() => weekDays(anchor, 5), [anchor])
  const weekFrom = days[0]
  const weekTo = addDays(days[days.length - 1], 1)

  const { data: bookings = [], isLoading } = useBookings(
    currentResource?.id,
    weekFrom.toISOString(),
    weekTo.toISOString(),
  )

  const bookingsByDay = useMemo(() => {
    const grouped = new Map<string, Booking[]>()
    bookings.forEach((b) => {
      const key = format(parseISO(b.start_at), 'yyyy-MM-dd')
      const arr = grouped.get(key) ?? []
      arr.push(b)
      grouped.set(key, arr)
    })
    return grouped
  }, [bookings])

  function handleSlotClick(click: SlotClick) {
    const d = new Date(click.date)
    d.setHours(click.hour, click.half * 30, 0, 0)
    setModalSlot(d)
  }

  if (!resources.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="text-center max-w-sm">
          <p className="text-ink-500 text-sm">
            Nema resursa konfigurisanih. Dodaj prvo veliki teren da bi mogao primati rezervacije.
          </p>
          <Button variant="primary" className="mt-4">+ Dodaj teren</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="px-5 py-3 flex items-center gap-3 border-b border-ink-200 bg-surface">
        <div className="flex gap-1">
          {resources.map((r: Resource) => (
            <button
              key={r.id}
              onClick={() => setSelectedResourceId(r.id)}
              className={clsx(
                'px-3 py-1.5 text-sm rounded transition-colors',
                currentResource?.id === r.id
                  ? 'bg-ink-100 text-ink-800 font-medium'
                  : 'text-ink-500 hover:bg-ink-50',
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-sm">
          <button
            onClick={() => setAnchor((a) => subWeeks(a, 1))}
            className="w-7 h-7 inline-flex items-center justify-center rounded hover:bg-ink-100 text-ink-500"
            aria-label="Prethodna sedmica"
          >
            ‹
          </button>
          <span className="px-2 font-medium tabular text-ink-700">
            {format(weekFrom, 'd.')}–{format(days[days.length - 1], 'd. MMM yyyy.')}
          </span>
          <button
            onClick={() => setAnchor((a) => addWeeks(a, 1))}
            className="w-7 h-7 inline-flex items-center justify-center rounded hover:bg-ink-100 text-ink-500"
            aria-label="Naredna sedmica"
          >
            ›
          </button>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            const d = new Date(days[0])
            d.setHours(GRID_START_HOUR + 3, 0, 0, 0)
            setModalSlot(d)
          }}
        >
          + Novi termin
        </Button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-surface-alt">
        <div className="m-5 bg-surface border border-ink-200 rounded-lg overflow-hidden">
          {/* Day header row */}
          <div
            className="grid border-b border-ink-200"
            style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}
          >
            <div className="bg-surface-muted" />
            {days.map((d) => {
              const today = format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
              return (
                <div
                  key={d.toISOString()}
                  className={clsx(
                    'border-l border-ink-200 px-2 py-2 text-center bg-surface-muted',
                    today && 'bg-teal-50',
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">
                    {format(d, 'EEEEEE')}
                  </div>
                  <div
                    className={clsx(
                      'text-base font-medium tabular',
                      today ? 'text-teal-700' : 'text-ink-800',
                    )}
                  >
                    {format(d, 'd')}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Hour rows with day columns */}
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: `52px repeat(${days.length}, 1fr)`,
              gridAutoRows: `${ROW_HEIGHT_PX}px`,
            }}
          >
            {hours.map((h) => (
              <Hour
                key={h}
                hour={h}
                days={days}
                bookingsByDay={bookingsByDay}
                onSelectBooking={setSelectedBooking}
                onSelectSlot={handleSlotClick}
                selectedBookingId={selectedBooking?.id}
              />
            ))}
          </div>
        </div>

        {isLoading && <div className="px-5 pb-2 text-xs text-ink-400">učitavam...</div>}

        {/* Legend */}
        <div className="px-5 pb-4 flex items-center gap-4 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-paid-bg border border-paid-fg/30" />
            plaćeno
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-unpaid-bg border border-unpaid-fg/30" />
            neplaćeno
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-noshow-bg border border-noshow-fg/30" />
            no-show
          </span>
          <span className="inline-flex items-center gap-1.5">↻ stalna ekipa</span>
        </div>

        {/* Detail panel */}
        {selectedBooking && (
          <div className="mx-5 mb-4">
            <BookingDetail booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
          </div>
        )}
      </div>

      {/* Create booking modal */}
      {modalSlot && currentResource && (
        <CreateBookingModal
          open={!!modalSlot}
          onClose={() => setModalSlot(null)}
          resourceId={currentResource.id}
          startAt={modalSlot}
        />
      )}
    </div>
  )
}

interface HourProps {
  hour: number
  days: Date[]
  bookingsByDay: Map<string, Booking[]>
  onSelectBooking: (b: Booking) => void
  onSelectSlot: (s: SlotClick) => void
  selectedBookingId?: string
}

function Hour({
  hour,
  days,
  bookingsByDay,
  onSelectBooking,
  onSelectSlot,
  selectedBookingId,
}: HourProps) {
  return (
    <>
      <div
        className="text-[10px] text-ink-400 text-right pr-2 border-t border-ink-100 leading-7"
        style={{ gridRow: 'span 2' }}
      >
        {String(hour).padStart(2, '0')}:00
      </div>
      {days.map((day, dayIdx) => {
        const dayKey = format(day, 'yyyy-MM-dd')
        const dayBookings = bookingsByDay.get(dayKey) ?? []
        const bookingsHere = dayBookings.filter((b) => parseISO(b.start_at).getHours() === hour)

        return (
          <div
            key={`slot-${hour}-${dayIdx}`}
            className="relative border-l border-t border-ink-100 group"
            style={{ gridRow: 'span 2' }}
          >
            {/* Two clickable halves */}
            <button
              onClick={() => onSelectSlot({ date: day, hour, half: 0 })}
              className="absolute inset-x-0 top-0 h-1/2 hover:bg-teal-50/40 cursor-pointer"
              aria-label={`Novi termin u ${hour}:00`}
            />
            <button
              onClick={() => onSelectSlot({ date: day, hour, half: 1 })}
              className="absolute inset-x-0 top-1/2 h-1/2 hover:bg-teal-50/40 cursor-pointer"
              aria-label={`Novi termin u ${hour}:30`}
            />
            <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-ink-100 pointer-events-none" />

            {bookingsHere.map((b) => (
              <BookingBlock
                key={b.id}
                booking={b}
                onSelect={onSelectBooking}
                selected={b.id === selectedBookingId}
              />
            ))}
          </div>
        )
      })}
    </>
  )
}

function BookingBlock({
  booking,
  onSelect,
  selected,
}: {
  booking: Booking
  onSelect: (b: Booking) => void
  selected: boolean
}) {
  const start = parseISO(booking.start_at)
  const end = parseISO(booking.end_at)
  const durationMin = (end.getTime() - start.getTime()) / 60000
  const startOffsetMin = start.getMinutes()

  const top = (startOffsetMin / 60) * (ROW_HEIGHT_PX * ROWS_PER_HOUR)
  const height = (durationMin / 60) * (ROW_HEIGHT_PX * ROWS_PER_HOUR) - 2

  const paidCents = booking.paid_cents ?? 0
  const methods = booking.payment_methods ?? []
  const fullyPaid = paidCents >= booking.price_cents && booking.price_cents > 0
  const partiallyPaid = paidCents > 0 && !fullyPaid

  const tone: 'paid' | 'unpaid' | 'noshow' =
    booking.status === 'no_show' || booking.status === 'cancelled'
      ? 'noshow'
      : fullyPaid
        ? 'paid'
        : 'unpaid'

  const isRecurring = !!booking.series_id

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onSelect(booking)
      }}
      className={clsx(
        'absolute left-1 right-1 px-1.5 py-1 rounded text-[11px] text-left overflow-hidden leading-tight z-10',
        tone === 'paid' && 'bg-paid-bg text-paid-fg',
        tone === 'unpaid' && 'bg-unpaid-bg text-unpaid-fg',
        tone === 'noshow' && 'bg-noshow-bg text-noshow-fg line-through',
        selected && 'ring-2 ring-teal-500 ring-offset-1',
      )}
      style={{ top, height }}
    >
      <div className="flex items-center gap-1 font-medium">
        {isRecurring && <span className="text-[9px]">↻</span>}
        <span className="truncate flex-1">{booking.notes ?? 'Termin'}</span>
        <PaymentBadge fullyPaid={fullyPaid} partiallyPaid={partiallyPaid} methods={methods} />
      </div>
      <div className="opacity-80 tabular">
        {fmtTime(booking.start_at)}–{fmtTime(booking.end_at)} · {fmtMoney(booking.price_cents)}
      </div>
    </button>
  )
}

function PaymentBadge({
  fullyPaid,
  partiallyPaid,
  methods,
}: {
  fullyPaid: boolean
  partiallyPaid: boolean
  methods: string[]
}) {
  if (!fullyPaid && !partiallyPaid) return null
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] leading-none">
      {fullyPaid && <span title="Plaćeno">✓</span>}
      {partiallyPaid && <span title="Djelimično plaćeno">½</span>}
      {methods.map((m) => (
        <MethodIcon key={m} method={m} />
      ))}
    </span>
  )
}

function MethodIcon({ method }: { method: string }) {
  if (method === 'cash') {
    return (
      <span title="Keš" aria-label="keš">
        💵
      </span>
    )
  }
  if (method === 'card_pos') {
    return (
      <span title="Kartica" aria-label="kartica">
        💳
      </span>
    )
  }
  if (method === 'membership_credit') {
    return (
      <span title="Sezona" aria-label="sezona">
        🎫
      </span>
    )
  }
  return null
}
