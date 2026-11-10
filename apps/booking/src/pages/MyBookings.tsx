import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bookingApi, tenantApi } from '../lib/api'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('sr-Latn-BA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtMoney(cents: number) {
  return (cents / 100).toFixed(2) + ' KM'
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'Potvrđeno', color: 'bg-teal-100 text-teal-700' },
  cancelled: { label: 'Otkazano', color: 'bg-red-100 text-red-700' },
  no_show: { label: 'Nije došao', color: 'bg-gray-100 text-gray-600' },
  completed: { label: 'Završeno', color: 'bg-blue-100 text-blue-700' },
}

export function MyBookings() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['my-bookings'], queryFn: bookingApi.list })
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })

  const cancel = useMutation({
    mutationFn: (id: string) => bookingApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bookings'] }),
  })

  const resourceMap = Object.fromEntries((resources?.data ?? []).map((r) => [r.id, r.name]))

  if (isLoading) {
    return <div className="text-center py-16 text-gray-400 text-sm">Učitavanje...</div>
  }

  if (error) {
    return <div className="text-center py-16 text-red-500 text-sm">Greška pri učitavanju rezervacija</div>
  }

  const bookings = data?.data ?? []

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 mb-6">Moje rezervacije</h1>
      {bookings.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Nemate rezervacija. Rezervišite termin na početnoj stranici.
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const isPast = new Date(b.end_at ?? b.start_at) < new Date()
            const s = b.status === 'confirmed' && isPast
              ? { label: 'Isteklo', color: 'bg-gray-100 text-gray-500' }
              : STATUS_LABELS[b.status] ?? { label: b.status, color: 'bg-gray-100 text-gray-600' }
            const canCancel = b.status === 'confirmed' && !isPast
            return (
              <div key={b.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-gray-800 text-sm">
                      {resourceMap[b.resource_id] ?? 'Teren'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{fmtDate(b.start_at)}</div>
                    {b.price_cents > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5">{fmtMoney(b.price_cents)}</div>
                    )}
                    {b.notes && <div className="text-xs text-gray-400 mt-0.5 italic">{b.notes}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                    {canCancel && (
                      <button
                        onClick={() => {
                          if (confirm('Otkazati rezervaciju?')) cancel.mutate(b.id)
                        }}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Otkaži
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
