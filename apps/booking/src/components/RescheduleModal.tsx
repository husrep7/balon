import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bookingApi, tenantApi, type Booking } from '../lib/api'
import { DayStrip, SLOT_MIN, SlotGrid, buildSlots, canStartAt, minutesToHHMM } from './Slots'
import { ErrorNote, Sheet } from './ui'

interface Props {
  booking: Booking
  onClose: () => void
}

/** Move a booking to another free time, keeping its length (1 or 2 slots). */
export function RescheduleModal({ booking: b, onClose }: Props) {
  const qc = useQueryClient()
  const origStart = new Date(b.start_at)
  const count = Math.max(1, Math.round((new Date(b.end_at).getTime() - origStart.getTime()) / 60000 / SLOT_MIN))

  const [date, setDate] = useState(() => {
    const d = new Date(origStart)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [startMin, setStartMin] = useState<number | null>(null)

  const to = new Date(date)
  to.setDate(to.getDate() + 1)
  const { data: availability } = useQuery({
    queryKey: ['availability', b.resource_id, date.toISOString()],
    queryFn: () => tenantApi.availability(b.resource_id, date.toISOString(), to.toISOString()),
  })

  const slots = buildSlots(availability?.data ?? [], date, new Date(), b.id)
  const idx = startMin === null ? -1 : slots.findIndex((s) => s.startMin === startMin)
  const valid = idx >= 0 && canStartAt(slots, idx, count)

  const reschedule = useMutation({
    mutationFn: () => {
      if (startMin === null) throw new Error('Odaberi novi termin.')
      const s = new Date(date)
      s.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
      if (s <= new Date()) throw new Error('Ovaj termin je u međuvremenu počeo. Odaberi neki od narednih.')
      const e = new Date(s.getTime() + count * SLOT_MIN * 60_000)
      return bookingApi.reschedule(b.id, s.toISOString(), e.toISOString())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      qc.invalidateQueries({ queryKey: ['availability'] })
      onClose()
    },
  })

  return (
    <Sheet
      open
      onClose={onClose}
      title="Promijeni termin"
      footer={
        <button onClick={() => reschedule.mutate()} disabled={!valid || reschedule.isPending} className="btn-primary">
          {reschedule.isPending
            ? 'Mijenjam…'
            : valid && startMin !== null
              ? `Pomjeri na ${minutesToHHMM(startMin)}`
              : 'Odaberi novi termin'}
        </button>
      }
    >
      <div className="space-y-5">
        <p className="text-[14px] text-gray-500 px-1">
          Trenutno: {origStart.toLocaleDateString('sr-Latn-BA', { weekday: 'long', day: 'numeric', month: 'long' })}, u{' '}
          {minutesToHHMM(origStart.getHours() * 60 + origStart.getMinutes())}
          {count === 2 ? ' · 2 termina zaredom' : ''}
        </p>
        <DayStrip
          value={date}
          onChange={(d) => {
            setDate(d)
            setStartMin(null)
          }}
        />
        <SlotGrid slots={slots} count={count} selected={startMin} onSelect={setStartMin} />
        {reschedule.error && (
          <ErrorNote>{reschedule.error instanceof Error ? reschedule.error.message : 'Promjena nije uspjela.'}</ErrorNote>
        )}
      </div>
    </Sheet>
  )
}
