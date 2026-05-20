import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bookingApi, resourceApi } from '@/lib/api'
import type { Booking, BookingStatus } from '@/lib/types'
import { Badge } from '@/components/ui'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('bs-BA', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' })
}
function fmtMoney(cents: number) {
  return (cents / 100).toFixed(2) + ' KM'
}
function duration(a: string, b: string) {
  const m = (new Date(b).getTime() - new Date(a).getTime()) / 60000
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

const STATUS_TONE: Record<BookingStatus, 'info' | 'paid' | 'unpaid' | 'noshow' | 'neutral'> = {
  confirmed: 'info',
  completed: 'paid',
  cancelled: 'unpaid',
  no_show: 'noshow',
}
const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Potvrđeno',
  completed: 'Završeno',
  cancelled: 'Otkazano',
  no_show: 'Nije došao',
}

export function Bookings() {
  const qc = useQueryClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [status, setStatus] = useState<string>('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['bookings-all', fromDate, toDate, status],
    queryFn: () => bookingApi.listAll({
      from: fromDate ? new Date(fromDate).toISOString() : undefined,
      to: toDate ? new Date(toDate + 'T23:59:59').toISOString() : undefined,
      status: status || undefined,
    }),
  })

  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: resourceApi.list })
  const resourceMap = Object.fromEntries((resources?.data ?? []).map((r) => [r.id, r.name]))

  const cancel = useMutation({
    mutationFn: () => bookingApi.cancel(cancelId!, cancelReason || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings-all'] }); setCancelId(null); setCancelReason('') },
  })

  const noShow = useMutation({
    mutationFn: (id: string) => bookingApi.noShow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings-all'] }),
  })

  const bookings = (data?.data ?? []).filter((b) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      resourceMap[b.resource_id]?.toLowerCase().includes(s) ||
      b.channel?.toLowerCase().includes(s) ||
      b.notes?.toLowerCase().includes(s) ||
      b.id.toLowerCase().startsWith(s)
    )
  })

  return (
    <div className="flex-1 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-medium text-ink-800">Sve rezervacije</h1>
          <p className="text-xs text-ink-500 mt-0.5">{bookings.length} rezervacija</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Pretraži..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 px-3 text-xs border border-ink-200 rounded bg-surface text-ink-800 placeholder-ink-400 focus:outline-none focus:border-teal-500 w-48"
        />
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 px-2 text-xs border border-ink-200 rounded bg-surface text-ink-800 focus:outline-none focus:border-teal-500"
          />
          <span className="text-ink-400 text-xs">–</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 px-2 text-xs border border-ink-200 rounded bg-surface text-ink-800 focus:outline-none focus:border-teal-500"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 px-2 text-xs border border-ink-200 rounded bg-surface text-ink-800 focus:outline-none focus:border-teal-500"
        >
          <option value="">Svi statusi</option>
          <option value="confirmed">Potvrđeno</option>
          <option value="completed">Završeno</option>
          <option value="cancelled">Otkazano</option>
          <option value="no_show">Nije došao</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-xs text-ink-400 py-10 text-center">Učitavanje...</div>
      ) : bookings.length === 0 ? (
        <div className="text-xs text-ink-400 py-10 text-center">Nema rezervacija za odabrane filtere</div>
      ) : (
        <div className="border border-ink-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-ink-50 border-b border-ink-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Datum i sat</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Kupac</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Teren</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Trajanje</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Cijena</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Plaćeno</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Plaćanje</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {bookings.map((b) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  resourceName={resourceMap[b.resource_id] ?? '—'}
                  onCancel={() => setCancelId(b.id)}
                  onNoShow={() => noShow.mutate(b.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cancel modal */}
      {cancelId && (
        <div className="fixed inset-0 bg-ink-900/40 flex items-center justify-center z-50 p-4" onClick={() => setCancelId(null)}>
          <div className="bg-surface rounded-lg border border-ink-200 w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-ink-800">Otkaži rezervaciju</h3>
            <input
              type="text"
              placeholder="Razlog otkazivanja (opcionalno)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-ink-200 rounded focus:outline-none focus:border-teal-500"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCancelId(null)} className="h-8 px-3 text-xs border border-ink-200 rounded text-ink-700 hover:bg-ink-50">
                Nazad
              </button>
              <button
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                className="h-8 px-3 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {cancel.isPending ? 'Otkazujem...' : 'Otkaži rezervaciju'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BookingRow({ booking: b, resourceName, onCancel, onNoShow }: {
  booking: Booking
  resourceName: string
  onCancel: () => void
  onNoShow: () => void
}) {
  const [open, setOpen] = useState(false)
  const isPast = new Date(b.end_at) < new Date()

  const paymentLabel: Record<string, string> = { cash: 'Gotovina', card: 'Kartica' }

  return (
    <tr className="hover:bg-ink-50/50">
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="font-medium text-ink-800">{fmtDate(b.start_at)}</div>
        <div className="text-ink-500">{fmtTime(b.start_at)} – {fmtTime(b.end_at)}</div>
      </td>
      <td className="px-3 py-2">
        {b.customer_name ? (
          <>
            <div className="text-ink-800 font-medium text-xs">{b.customer_name}</div>
            {b.customer_email && <div className="text-ink-400 text-[11px]">{b.customer_email}</div>}
            {b.customer_phone && <div className="text-ink-400 text-[11px]">{b.customer_phone}</div>}
          </>
        ) : (
          <span className="text-ink-300 text-xs">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-ink-700">{resourceName}</td>
      <td className="px-3 py-2 text-ink-500">{duration(b.start_at, b.end_at)}</td>
      <td className="px-3 py-2 text-ink-700">{fmtMoney(b.price_cents)}</td>
      <td className="px-3 py-2">
        {(b.paid_cents ?? 0) > 0
          ? <span className="text-teal-700">{fmtMoney(b.paid_cents!)}</span>
          : <span className="text-ink-300">—</span>}
      </td>
      <td className="px-3 py-2 text-xs">
        {b.payment_preference
          ? <span className={`px-2 py-0.5 rounded-full ${b.payment_preference === 'card' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
              {paymentLabel[b.payment_preference] ?? b.payment_preference}
            </span>
          : <span className="text-ink-300">—</span>
        }
      </td>
      <td className="px-3 py-2">
        <Badge tone={STATUS_TONE[b.status] ?? 'neutral'}>
          {STATUS_LABEL[b.status] ?? b.status}
        </Badge>
      </td>
      <td className="px-3 py-2">
        {b.status === 'confirmed' && (
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-ink-100 text-ink-400"
            >
              ⋯
            </button>
            {open && (
              <div
                className="absolute right-0 top-7 bg-surface border border-ink-200 rounded shadow-md z-10 min-w-[140px]"
                onMouseLeave={() => setOpen(false)}
              >
                {!isPast && (
                  <button
                    onClick={() => { setOpen(false); onNoShow() }}
                    className="w-full text-left px-3 py-2 text-xs text-ink-700 hover:bg-ink-50"
                  >
                    Nije došao
                  </button>
                )}
                <button
                  onClick={() => { setOpen(false); onCancel() }}
                  className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                >
                  Otkaži
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}
