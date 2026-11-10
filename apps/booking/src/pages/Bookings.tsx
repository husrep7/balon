import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bookingApi, tenantApi, type Booking } from '../lib/api'
import { fmtTime, fmtDuration, fmtMoney, isUpcoming } from '../lib/utils'

interface Props {
  onReschedule: (b: Booking) => void
}

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Potvrđeno', cls: 'bg-teal-50 text-teal-700 ring-teal-200' },
  cancelled: { label: 'Otkazano', cls: 'bg-red-50 text-red-700 ring-red-200' },
  no_show: { label: 'Nije došao', cls: 'bg-gray-100 text-gray-500 ring-gray-200' },
  completed: { label: 'Završeno', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
}

export function Bookings({ onReschedule }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [cancelId, setCancelId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['my-bookings'], queryFn: bookingApi.list })
  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.get })
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })

  const cancel = useMutation({
    mutationFn: (id: string) => bookingApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-bookings'] }); setCancelId(null) },
  })

  const all = data?.data ?? []
  const upcomingCount = all.filter((b) => isUpcoming(b.start_at) && b.status === 'confirmed').length
  const displayed = all
    .filter((b) => tab === 'upcoming'
      ? isUpcoming(b.start_at) && b.status === 'confirmed'
      : !isUpcoming(b.start_at) && b.status !== 'cancelled'
    )
    .sort((a, b) => tab === 'upcoming'
      ? new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      : new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
    )

  return (
    <div className="px-5 pt-6">
      <h1 className="text-[28px] leading-tight font-extrabold text-gray-900">Moji termini</h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">{tenant?.name ?? 'Pregled svih rezervacija'}</p>

      {/* Tabs */}
      <div className="grid grid-cols-2 bg-gray-200/70 rounded-2xl p-1 mb-5">
        {([
          ['upcoming', 'Aktivni'],
          ['past', 'Prošli'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`h-10 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${
              tab === key ? 'bg-white text-gray-900 shadow-card' : 'text-gray-500'
            }`}
          >
            {label}
            {key === 'upcoming' && upcomingCount > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-teal-500 text-white text-[10px] font-bold inline-flex items-center justify-center">
                {upcomingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-200/70 rounded-3xl animate-pulse" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="card text-center py-14 px-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-teal-50 ring-1 ring-teal-100 text-teal-600 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
              <path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-semibold text-gray-900">
            {tab === 'upcoming' ? 'Nemaš aktivnih rezervacija' : 'Još nema odigranih termina'}
          </p>
          <p className="mt-1 text-xs text-gray-500">Rezerviši teren klikom na zeleno dugme ispod.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((b, i) => {
            const s = b.status === 'confirmed' && tab === 'past'
              ? { label: 'Odigrano', cls: 'bg-gray-100 text-gray-500 ring-gray-200' }
              : STATUS[b.status] ?? { label: b.status, cls: 'bg-gray-100 text-gray-600 ring-gray-200' }
            const canChange = b.status === 'confirmed' && isUpcoming(b.start_at)
            const resourceName = resources?.data.find((r) => r.id === b.resource_id)?.name ?? 'Teren'
            const d = new Date(b.start_at)
            return (
              <div key={b.id} className="card overflow-hidden animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="p-4 flex gap-4">
                  <div className={`w-14 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0 ${
                    canChange ? 'bg-gray-900 text-white' : 'bg-gray-50 ring-1 ring-gray-200 text-gray-900'
                  }`}>
                    <span className={`text-[10px] font-semibold uppercase leading-none ${canChange ? 'text-lime-400' : 'text-gray-400'}`}>
                      {d.toLocaleDateString('sr-Latn-BA', { month: 'short' }).replace('.', '')}
                    </span>
                    <span className="text-2xl font-display font-extrabold leading-none mt-1">{d.getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-bold text-gray-900">
                        {fmtTime(b.start_at)} – {fmtTime(b.end_at)}
                      </p>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset shrink-0 ${s.cls}`}>
                        {s.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 first-letter:uppercase">
                      {d.toLocaleDateString('sr-Latn-BA', { weekday: 'long' })} · {fmtDuration(b.start_at, b.end_at)} · {resourceName}
                    </p>
                    {b.price_cents > 0 && (
                      <p className="text-sm font-semibold text-gray-900 mt-2">{fmtMoney(b.price_cents)}</p>
                    )}
                    {b.notes && <p className="text-xs text-gray-400 italic mt-1">„{b.notes}"</p>}
                  </div>
                </div>
                {canChange && (
                  <div className="grid grid-cols-2 border-t border-gray-100">
                    <button
                      onClick={() => onReschedule(b)}
                      className="h-12 text-sm font-semibold text-teal-700 hover:bg-teal-50 transition-colors"
                    >
                      Promijeni termin
                    </button>
                    <button
                      onClick={() => setCancelId(b.id)}
                      className="h-12 text-sm font-semibold text-red-600 hover:bg-red-50 border-l border-gray-100 transition-colors"
                    >
                      Otkaži
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Cancel confirmation sheet */}
      {cancelId && (
        <div className="fixed inset-0 bg-gray-950/50 backdrop-blur-[2px] flex items-end justify-center z-50" onClick={() => setCancelId(null)}>
          <div
            className="bg-white rounded-t-[2rem] w-full max-w-lg p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 rounded-full bg-gray-200 mx-auto mb-6" />
            <div className="w-14 h-14 rounded-2xl bg-red-50 ring-1 ring-red-100 text-red-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M12 8v5M12 16.5v.5" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </div>
            <h3 className="mt-4 text-xl font-display font-extrabold text-gray-900">Otkazati rezervaciju?</h3>
            <p className="text-sm text-gray-500 mt-1">Termin će postati slobodan za druge. Ova akcija se ne može poništiti.</p>
            {cancel.error && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3">
                {cancel.error instanceof Error ? cancel.error.message : 'Greška'}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button onClick={() => setCancelId(null)} className="btn-secondary !h-12">
                Zadrži
              </button>
              <button
                onClick={() => cancel.mutate(cancelId)}
                disabled={cancel.isPending}
                className="h-12 rounded-2xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {cancel.isPending ? 'Otkazujem…' : 'Da, otkaži'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
