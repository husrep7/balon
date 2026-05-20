import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi, bookingApi, type Resource, type Booking } from '../lib/api'
import { isAuthenticated } from '../lib/auth'

interface Props {
  onLoginRequired: () => void
}

function fmt(cents: number) {
  return (cents / 100).toFixed(2) + ' KM'
}

function toLocalISO(date: Date) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('bs-BA', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function Home({ onLoginRequired }: Props) {
  const qc = useQueryClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  const [selectedDate, setSelectedDate] = useState(today)
  const [bookingForm, setBookingForm] = useState<{ startAt: string; endAt: string; notes: string } | null>(null)
  const [bookingSuccess, setBookingSuccess] = useState(false)

  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.get })
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })

  const from = new Date(selectedDate)
  from.setHours(0, 0, 0, 0)
  const to = addDays(from, 1)

  const { data: availability } = useQuery({
    queryKey: ['availability', selectedResource?.id, selectedDate.toISOString()],
    queryFn: () => tenantApi.availability(selectedResource!.id, from.toISOString(), to.toISOString()),
    enabled: !!selectedResource,
  })

  const createBooking = useMutation({
    mutationFn: () =>
      bookingApi.create(
        selectedResource!.id,
        new Date(bookingForm!.startAt).toISOString(),
        new Date(bookingForm!.endAt).toISOString(),
        bookingForm!.notes,
      ),
    onSuccess: () => {
      setBookingForm(null)
      setBookingSuccess(true)
      qc.invalidateQueries({ queryKey: ['availability'] })
      setTimeout(() => setBookingSuccess(false), 4000)
    },
  })

  const topResources = resources?.data.filter((r) => !r.parent_id) ?? []

  const slots = generateSlots(from, availability?.data ?? [])

  function handleSlotClick(startAt: Date) {
    if (!isAuthenticated()) {
      onLoginRequired()
      return
    }
    const endAt = new Date(startAt)
    endAt.setHours(endAt.getHours() + 1, 30)
    setBookingSuccess(false)
    setBookingForm({
      startAt: toLocalISO(startAt),
      endAt: toLocalISO(endAt),
      notes: '',
    })
  }

  return (
    <div>
      {tenant && (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800">{tenant.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Rezervišite termin online</p>
        </div>
      )}

      {bookingSuccess && (
        <div className="mb-4 bg-teal-50 border border-teal-200 rounded-md px-4 py-3 text-sm text-teal-800">
          Rezervacija uspješno kreirana!
        </div>
      )}

      {/* Resource picker */}
      <div className="mb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Odaberite teren</p>
        <div className="flex flex-wrap gap-2">
          {topResources.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedResource(r)}
              className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                selectedResource?.id === r.id
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-teal-400'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {selectedResource && (
        <>
          {/* Date picker */}
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Odaberite datum</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((d) => {
                const active = d.toDateString() === selectedDate.toDateString()
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => setSelectedDate(d)}
                    className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-lg border text-xs transition-colors ${
                      active
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300'
                    }`}
                  >
                    <span className="uppercase">{d.toLocaleDateString('bs-BA', { weekday: 'short' })}</span>
                    <span className="text-base font-semibold leading-none mt-0.5">{d.getDate()}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time slots */}
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Dostupni termini — {selectedDate.toLocaleDateString('bs-BA', { day: 'numeric', month: 'long' })}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {slots.map(({ time, busy }) => (
                <button
                  key={time.toISOString()}
                  disabled={busy}
                  onClick={() => handleSlotClick(time)}
                  className={`py-2 rounded-md text-sm border transition-colors ${
                    busy
                      ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700'
                  }`}
                >
                  {time.toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' })}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">Slobodan termin — kliknite da rezervišete</p>
          </div>

          {/* Booking form modal */}
          {bookingForm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg border border-gray-200 w-full max-w-sm p-6">
                <h2 className="text-base font-semibold text-gray-800 mb-4">Potvrdi rezervaciju</h2>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Teren</label>
                    <p className="text-sm text-gray-800">{selectedResource.name}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Početak</label>
                    <input
                      type="datetime-local"
                      value={bookingForm.startAt}
                      onChange={(e) => setBookingForm((f) => f && { ...f, startAt: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Kraj</label>
                    <input
                      type="datetime-local"
                      value={bookingForm.endAt}
                      onChange={(e) => setBookingForm((f) => f && { ...f, endAt: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Napomena (opcionalno)</label>
                    <input
                      type="text"
                      value={bookingForm.notes}
                      onChange={(e) => setBookingForm((f) => f && { ...f, notes: e.target.value })}
                      placeholder="npr. ekipa 5 na 5"
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5"
                    />
                  </div>
                </div>
                {createBooking.error && (
                  <p className="text-xs text-red-600 mb-3">
                    {createBooking.error instanceof Error ? createBooking.error.message : 'Greška'}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setBookingForm(null)}
                    className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm"
                  >
                    Odustani
                  </button>
                  <button
                    onClick={() => createBooking.mutate()}
                    disabled={createBooking.isPending}
                    className="flex-1 bg-teal-600 text-white py-2 rounded text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                  >
                    {createBooking.isPending ? 'Rezervišem...' : 'Rezerviši'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!selectedResource && (
        <div className="text-center py-16 text-gray-400 text-sm">
          Odaberite teren gore da vidite dostupne termine
        </div>
      )}
    </div>
  )
}

interface Slot { time: Date; busy: boolean }

function generateSlots(date: Date, busyBookings: Booking[]): Slot[] {
  const slots: Slot[] = []
  for (let h = 8; h < 23; h++) {
    const t = new Date(date)
    t.setHours(h, 0, 0, 0)
    const busy = busyBookings.some((b) => {
      const start = new Date(b.start_at)
      const end = new Date(b.end_at)
      return t >= start && t < end
    })
    slots.push({ time: t, busy })
  }
  return slots
}
