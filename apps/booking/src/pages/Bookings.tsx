import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bookingApi, tenantApi, type Booking } from '../lib/api'
import { fmtDate, fmtTime, fmtDuration, fmtMoney, isUpcoming } from '../lib/utils'

interface Props {
  onReschedule: (b: Booking) => void
}

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Potvrđeno', cls: 'bg-teal-100 text-teal-700' },
  cancelled: { label: 'Otkazano', cls: 'bg-red-100 text-red-700' },
  no_show: { label: 'Nije došao', cls: 'bg-gray-100 text-gray-500' },
  completed: { label: 'Završeno', cls: 'bg-blue-100 text-blue-700' },
}

export function Bookings({ onReschedule }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [filterResource, setFilterResource] = useState<string>('all')
  const [cancelId, setCancelId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['my-bookings'], queryFn: bookingApi.list })
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })

  const cancel = useMutation({
    mutationFn: (id: string) => bookingApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-bookings'] }); setCancelId(null) },
  })

  const resourceMap = Object.fromEntries((resources?.data ?? []).map((r) => [r.id, r.name]))
  const all = data?.data ?? []
  const displayed = all
    .filter((b) => tab === 'upcoming'
      ? isUpcoming(b.start_at) && b.status === 'confirmed'
      : !isUpcoming(b.start_at) && b.status !== 'confirmed' && b.status !== 'cancelled'
    )
    .filter((b) => filterResource === 'all' || b.resource_id === filterResource)
    .sort((a, b) => tab === 'upcoming'
      ? new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      : new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
    )

  return (
    <div className="px-4 py-5">
      <h1 className="text-lg font-semibold text-gray-800 mb-4">Moji termini</h1>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
        <button
          onClick={() => setTab('upcoming')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'upcoming' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
        >
          Aktivne {all.filter((b) => isUpcoming(b.start_at) && b.status === 'confirmed').length > 0 &&
            <span className="ml-1 bg-teal-500 text-white text-[10px] rounded-full px-1.5 py-0.5">
              {all.filter((b) => isUpcoming(b.start_at) && b.status === 'confirmed').length}
            </span>}
        </button>
        <button
          onClick={() => setTab('past')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'past' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
        >
          Prošle
        </button>
      </div>

      {/* Filters */}
      {resources && resources.data.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          <FilterPill active={filterResource === 'all'} onClick={() => setFilterResource('all')}>Svi tereni</FilterPill>
          {resources.data.filter((r) => !r.parent_id).map((r) => (
            <FilterPill key={r.id} active={filterResource === r.id} onClick={() => setFilterResource(r.id)}>
              {r.name}
            </FilterPill>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">{tab === 'upcoming' ? 'Nemate aktivnih rezervacija' : 'Nema prošlih rezervacija'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((b) => {
            const s = STATUS[b.status] ?? { label: b.status, cls: 'bg-gray-100 text-gray-600' }
            const canCancel = b.status === 'confirmed' && isUpcoming(b.start_at)
            const canReschedule = b.status === 'confirmed' && isUpcoming(b.start_at)
            return (
              <div key={b.id} className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800 text-sm">{resourceMap[b.resource_id] ?? 'Teren'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {fmtDate(b.start_at)} · {fmtTime(b.start_at)} – {fmtTime(b.end_at)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDuration(b.start_at, b.end_at)}</p>
                    {b.notes && <p className="text-xs text-gray-400 italic mt-0.5">"{b.notes}"</p>}
                    {b.price_cents > 0 && <p className="text-xs text-gray-500 mt-0.5">{fmtMoney(b.price_cents)}</p>}
                  </div>
                </div>
                {(canReschedule || canCancel) && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                    {canReschedule && (
                      <button
                        onClick={() => onReschedule(b)}
                        className="flex-1 text-center text-xs text-teal-600 font-medium py-1.5 border border-teal-200 rounded-lg hover:bg-teal-50"
                      >
                        Promijeni termin
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => setCancelId(b.id)}
                        className="flex-1 text-center text-xs text-red-500 font-medium py-1.5 border border-red-200 rounded-lg hover:bg-red-50"
                      >
                        Otkaži
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Cancel confirmation */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Otkazati rezervaciju?</h3>
            <p className="text-sm text-gray-500">Ova akcija se ne može poništiti.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelId(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700">
                Ne, zadrži
              </button>
              <button
                onClick={() => cancel.mutate(cancelId)}
                disabled={cancel.isPending}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {cancel.isPending ? 'Otkazujem...' : 'Da, otkaži'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors ${
        active ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200'
      }`}
    >
      {children}
    </button>
  )
}
