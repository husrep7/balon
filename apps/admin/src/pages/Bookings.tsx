import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bookingApi } from '@/lib/api'
import { useOpenShift, useOpenShiftMutation, useRecordPayment } from '@/hooks'
import type { Booking } from '@/lib/types'
import { Badge, TierPill } from '@/components/ui'

function fmtDate(iso: string) {
  const d = new Date(iso)
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}.`
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}
function fmtMoney(cents: number) {
  return (cents / 100).toFixed(2) + ' KM'
}
function duration(a: string, b: string) {
  const m = (new Date(b).getTime() - new Date(a).getTime()) / 60000
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}


export function Bookings() {
  const qc = useQueryClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [filter, setFilter] = useState<'all' | 'confirmed' | 'cancelled' | 'past'>('all')
  const [search, setSearch] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  const { data: shift } = useOpenShift()
  const openShiftMut = useOpenShiftMutation()
  const recordPayment = useRecordPayment()

  async function handlePay(bookingId: string, priceCents: number, method: 'cash' | 'card_pos') {
    setPayError(null)
    try {
      let activeShift = shift
      if (!activeShift) {
        activeShift = await openShiftMut.mutateAsync(0)
      }
      await recordPayment.mutateAsync({
        shiftId: activeShift.id,
        booking_id: bookingId,
        amount_cents: priceCents,
        method,
      })
      setPayingId(null)
      qc.invalidateQueries({ queryKey: ['bookings-all'] })
    } catch {
      setPayError('Greška pri naplati.')
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['bookings-all'],
    queryFn: () => bookingApi.listAll({}),
  })

  const cancel = useMutation({
    mutationFn: () => bookingApi.cancel(cancelId!, cancelReason || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings-all'] }); setCancelId(null); setCancelReason('') },
  })

  const noShow = useMutation({
    mutationFn: (id: string) => bookingApi.noShow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings-all'] }),
  })

  const now = new Date()
  const bookings = (data?.data ?? []).filter((b) => {
    const isPast = new Date(b.end_at) < now
    if (filter === 'confirmed' && !(b.status === 'confirmed' && !isPast)) return false
    if (filter === 'cancelled' && b.status !== 'cancelled') return false
    if (filter === 'past' && !isPast) return false
    if (search) {
      const s = search.toLowerCase()
      if (!b.customer_name?.toLowerCase().includes(s) && !b.customer_phone?.toLowerCase().includes(s)) return false
    }
    return true
  })

  return (
    <div className="flex-1 w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Sve rezervacije</h1>
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
        {(['all', 'confirmed', 'cancelled', 'past'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-8 px-3 text-xs rounded border transition-colors ${
              filter === f
                ? 'bg-ink-800 text-white border-ink-800'
                : 'bg-surface text-ink-600 border-ink-200 hover:border-ink-400'
            }`}
          >
            {{ all: 'Svi', confirmed: 'Potvrđeni', cancelled: 'Otkazani', past: 'Prošli' }[f]}
          </button>
        ))}
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
                <th className="text-left px-3 py-2 font-medium text-ink-600">Kontakt</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Trajanje</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Cijena</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Plaćanje</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Kreirano</th>
                <th className="text-left px-3 py-2 font-medium text-ink-600">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {bookings.map((b) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  onCancel={() => setCancelId(b.id)}
                  onNoShow={() => noShow.mutate(b.id)}
                  paying={payingId === b.id}
                  payPending={recordPayment.isPending && payingId === b.id}
                  payError={payingId === b.id ? payError : null}
                  onStartPay={() => { setPayingId(b.id); setPayError(null) }}
                  onPay={(method) => handlePay(b.id, b.price_cents - (b.paid_cents ?? 0), method)}
                  onCancelPay={() => setPayingId(null)}
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

const METHOD_LABEL: Record<string, string> = {
  cash: 'Gotovina',
  card_pos: 'Kartica',
  membership_credit: 'Sezona',
  voucher: 'Vaučer',
  transfer: 'Uplata',
}

function BookingRow({ booking: b, onCancel, onNoShow, paying, payPending, payError, onStartPay, onPay, onCancelPay }: {
  booking: Booking
  onCancel: () => void
  onNoShow: () => void
  paying: boolean
  payPending: boolean
  payError: string | null
  onStartPay: () => void
  onPay: (method: 'cash' | 'card_pos') => void
  onCancelPay: () => void
}) {
  const [open, setOpen] = useState(false)
  const isPast = new Date(b.end_at) < new Date()
  const paidCents = b.paid_cents ?? 0
  const fullyPaid = paidCents >= b.price_cents && b.price_cents > 0
  const methods = b.payment_methods ?? []

  return (
    <>
      <tr className="hover:bg-ink-50/50">
        <td className="px-3 py-2 whitespace-nowrap">
          <div className="font-medium text-ink-800">{fmtDate(b.start_at)}</div>
          <div className="text-ink-500">{fmtTime(b.start_at)} – {fmtTime(b.end_at)}</div>
        </td>
        <td className="px-3 py-2">
          {b.customer_name ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-ink-800 font-medium text-xs">{b.customer_name}</span>
                <TierPill tier={b.customer_tier} size="sm" />
              </div>
              {b.customer_email && <div className="text-ink-400 text-[11px]">{b.customer_email}</div>}
            </>
          ) : (
            <span className="text-ink-300 text-xs">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          {b.customer_phone
            ? <a href={`tel:${b.customer_phone}`} className="text-ink-700 hover:text-teal-700 text-xs">{b.customer_phone}</a>
            : <span className="text-ink-300">—</span>
          }
        </td>
        <td className="px-3 py-2 text-ink-500">{duration(b.start_at, b.end_at)}</td>
        <td className="px-3 py-2 text-ink-700 tabular">
          <div>{fmtMoney(b.price_cents)}</div>
          {paidCents > 0 && !fullyPaid && (
            <div className="text-[11px] text-amber-600">plaćeno {fmtMoney(paidCents)}</div>
          )}
        </td>

        {/* Payment column */}
        <td className="px-3 py-2 text-xs">
          {methods.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {methods.map((m) => (
                <span
                  key={m}
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium w-fit ${
                    m === 'card_pos' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
                  }`}
                >
                  {METHOD_LABEL[m] ?? m}
                </span>
              ))}
            </div>
          ) : b.status === 'confirmed' && !paying ? (
            <button
              onClick={onStartPay}
              className="text-xs text-teal-700 hover:underline font-medium"
            >
              Naplati →
            </button>
          ) : (
            <span className="text-ink-300">—</span>
          )}
        </td>

        <td className="px-3 py-2 whitespace-nowrap text-ink-400 text-[11px]">
          {b.created_at ? (
            <>
              <div>{fmtDate(b.created_at)}</div>
              <div>{fmtTime(b.created_at)}</div>
            </>
          ) : <span className="text-ink-300">—</span>}
        </td>
        <td className="px-3 py-2">
          {b.status === 'cancelled'
            ? <Badge tone="unpaid">Otkazano</Badge>
            : isPast
              ? <Badge tone="neutral">Prošlo</Badge>
              : <Badge tone="info">Potvrđeno</Badge>
          }
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

      {/* Inline payment row */}
      {paying && (
        <tr className="bg-teal-50/60 border-t border-teal-100">
          <td colSpan={9} className="px-3 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-ink-700">
                Naplati {fmtMoney(b.price_cents - paidCents)} —
              </span>
              <button
                onClick={() => onPay('cash')}
                disabled={payPending}
                className="h-8 px-4 text-xs rounded border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 disabled:opacity-50 font-medium"
              >
                💵 Gotovina
              </button>
              <button
                onClick={() => onPay('card_pos')}
                disabled={payPending}
                className="h-8 px-4 text-xs rounded border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50 font-medium"
              >
                💳 Kartica
              </button>
              {payPending && <span className="text-xs text-ink-400">Snimam...</span>}
              {payError && <span className="text-xs text-red-600">{payError}</span>}
              <button onClick={onCancelPay} className="text-xs text-ink-400 hover:text-ink-700 ml-auto">
                ✕ Otkaži
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
