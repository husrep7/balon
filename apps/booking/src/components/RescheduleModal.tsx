import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bookingApi, tenantApi, type Booking } from '../lib/api'
import { addDays, startOfDay } from '../lib/utils'
// addDays still used for availability query range
import { MonthCalendar } from './MonthCalendar'

const DURATION = 75
const OPEN_HOUR = 8
const CLOSE_MINUTES = 23 * 60
const PEAK_START = 16 * 60
const PRICE_DAY = 8000
const PRICE_PEAK = 11000

function slotPrice(startMin: number) {
  return startMin < PEAK_START ? PRICE_DAY : PRICE_PEAK
}

function minutesToDisplay(m: number) {
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`
}

interface Props {
  booking: Booking
  onClose: () => void
}

export function RescheduleModal({ booking: b, onClose }: Props) {
  const qc = useQueryClient()
  const today = startOfDay(new Date())

  const origStart = new Date(b.start_at)
  const origStartMin = origStart.getHours() * 60 + origStart.getMinutes()

  const [date, setDate] = useState<Date>(startOfDay(origStart))
  const [startMin, setStartMin] = useState<number | null>(origStartMin)

  // Re-render svake minute za filtriranje prošlih termina
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const { data: availability } = useQuery({
    queryKey: ['avail-reschedule', b.resource_id, date.toISOString()],
    queryFn: () => tenantApi.availability(b.resource_id, date.toISOString(), addDays(date, 1).toISOString()),
  })

  const reschedule = useMutation({
    mutationFn: () => {
      if (startMin === null) throw new Error('Odaberi termin')
      const s = new Date(date)
      s.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
      const e = new Date(s.getTime() + DURATION * 60_000)
      return bookingApi.reschedule(b.id, s.toISOString(), e.toISOString())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      onClose()
    },
  })

  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const slots: { startMin: number; endMin: number; busy: boolean; past: boolean }[] = []
  let cur = OPEN_HOUR * 60
  while (cur + DURATION <= CLOSE_MINUTES) {
    const end = cur + DURATION
    const past = isToday && cur <= nowMinutes
    const busy = (availability?.data ?? []).some((bk) => {
      // Isključi trenutnu rezervaciju iz busy provjere
      if (bk.id === b.id) return false
      const bStart = new Date(bk.start_at).getHours() * 60 + new Date(bk.start_at).getMinutes()
      const bEnd = new Date(bk.end_at).getHours() * 60 + new Date(bk.end_at).getMinutes()
      return cur < bEnd && end > bStart
    })
    slots.push({ startMin: cur, endMin: end, busy, past })
    cur += DURATION
  }

  const visibleSlots = slots.filter((s) => !s.past)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Promijeni termin</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Calendar picker */}
        <MonthCalendar
          selected={date}
          today={today}
          onSelect={(d) => { setDate(d); setStartMin(null) }}
        />

        {/* Time slots */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Termin</p>
          {visibleSlots.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nema dostupnih termina za danas.</p>
          ) : (
            <div className="space-y-2">
              {visibleSlots.map(({ startMin: sm, endMin: em, busy }) => (
                <button
                  key={sm}
                  disabled={busy}
                  onClick={() => setStartMin(sm)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                    busy
                      ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                      : startMin === sm
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-800 border-gray-200 hover:border-teal-400 hover:bg-teal-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {minutesToDisplay(sm)} – {minutesToDisplay(em)}
                    </span>
                    {sm >= PEAK_START && !busy && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">večernji</span>
                    )}
                  </div>
                  {busy
                    ? <span className="text-xs text-gray-300">Zauzeto</span>
                    : <span className={`text-sm font-semibold ${startMin === sm ? 'text-white' : 'text-teal-700'}`}>
                        {slotPrice(sm) / 100} KM
                      </span>
                  }
                </button>
              ))}
            </div>
          )}
        </div>

        {reschedule.error && (
          <p className="text-sm text-red-600">
            {reschedule.error instanceof Error ? reschedule.error.message : 'Greška'}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm text-gray-700">
            Odustani
          </button>
          <button
            onClick={() => reschedule.mutate()}
            disabled={reschedule.isPending || startMin === null}
            className="flex-1 bg-teal-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            {reschedule.isPending ? 'Mijenjam...' : 'Potvrdi izmjenu'}
          </button>
        </div>
      </div>
    </div>
  )
}
