import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { bs } from 'date-fns/locale'
import { bookingApi } from '@/lib/api'
import { useOpenShift, useOpenShiftMutation, useRecordPayment, useResources } from '@/hooks'
import type { Booking } from '@/lib/types'
import { Badge, Button, EmptyState, Input, Modal, Page, Segmented, TierPill } from '@/components/ui'

const nf = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (cents: number) => `${nf.format(cents / 100)} KM`

function duration(a: string, b: string) {
  const m = (new Date(b).getTime() - new Date(a).getTime()) / 60000
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ''}`
}

type Filter = 'upcoming' | 'due' | 'past' | 'cancelled' | 'all'

const METHOD_LABEL: Record<string, string> = {
  cash: 'Gotovina',
  card_pos: 'Kartica',
  membership_credit: 'Sezona',
  voucher: 'Vaučer',
  transfer: 'Uplata',
}

const PAGE_SIZE = 50

export function Bookings() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  const { data: shift } = useOpenShift()
  const openShiftMut = useOpenShiftMutation()
  const recordPayment = useRecordPayment()
  const { data: resources = [] } = useResources()
  const resourceName = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources])

  async function handlePay(bookingId: string, amountCents: number, method: 'cash' | 'card_pos') {
    setPayError(null)
    try {
      let activeShift = shift
      if (!activeShift) activeShift = await openShiftMut.mutateAsync(0)
      await recordPayment.mutateAsync({
        shiftId: activeShift.id,
        booking_id: bookingId,
        amount_cents: amountCents,
        method,
      })
      setPayingId(null)
      qc.invalidateQueries({ queryKey: ['bookings-all'] })
    } catch {
      setPayError('Naplata nije uspjela. Pokušaj ponovo.')
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['bookings-all'],
    queryFn: () => bookingApi.listAll({}),
    refetchInterval: 60_000,
  })

  const cancel = useMutation({
    mutationFn: () => bookingApi.cancel(cancelId!, cancelReason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings-all'] })
      setCancelId(null)
      setCancelReason('')
    },
  })

  const noShow = useMutation({
    mutationFn: (id: string) => bookingApi.noShow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings-all'] }),
  })

  const now = new Date()
  const all = data?.data ?? []
  const due = (b: Booking) => Math.max(0, b.price_cents - (b.paid_cents ?? 0))
  const isLive = (b: Booking) => b.status !== 'cancelled' && b.status !== 'no_show'

  const counts = {
    upcoming: all.filter((b) => isLive(b) && new Date(b.end_at) >= now).length,
    due: all.filter((b) => isLive(b) && new Date(b.start_at) <= now && due(b) > 0).length,
    past: all.filter((b) => new Date(b.end_at) < now && b.status !== 'cancelled').length,
    cancelled: all.filter((b) => b.status === 'cancelled').length,
  }
  const dueTotal = all
    .filter((b) => isLive(b) && new Date(b.start_at) <= now)
    .reduce((s, b) => s + due(b), 0)

  const filtered = all
    .filter((b) => {
      const ended = new Date(b.end_at) < now
      if (filter === 'upcoming' && !(isLive(b) && !ended)) return false
      if (filter === 'due' && !(isLive(b) && new Date(b.start_at) <= now && due(b) > 0)) return false
      if (filter === 'past' && !(ended && b.status !== 'cancelled')) return false
      if (filter === 'cancelled' && b.status !== 'cancelled') return false
      if (search) {
        const s = search.toLowerCase()
        const hay = [b.customer_name, b.customer_phone, b.customer_email, b.team_name, b.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
    .sort((a, b) => {
      const d = new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      return filter === 'upcoming' ? d : -d
    })
  const visible = filtered.slice(0, limit)

  return (
    <Page
      title="Rezervacije"
      subtitle="Svi termini s recepcije i online, s naplatom na jednom mjestu"
    >
      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Predstoji" value={String(counts.upcoming)} onClick={() => setFilter('upcoming')} active={filter === 'upcoming'} />
        <SummaryCard
          label="Za naplatu"
          value={money(dueTotal)}
          hint={`${counts.due} ${counts.due === 1 ? 'termin' : 'termina'}`}
          warn={counts.due > 0}
          onClick={() => setFilter('due')}
          active={filter === 'due'}
        />
        <SummaryCard label="Odigrano" value={String(counts.past)} onClick={() => setFilter('past')} active={filter === 'past'} />
        <SummaryCard label="Otkazano" value={String(counts.cancelled)} onClick={() => setFilter('cancelled')} active={filter === 'cancelled'} />
      </div>

      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-ink-100">
          <div className="relative w-full sm:w-72">
            <svg viewBox="0 0 24 24" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <Input
              id="bookings-search"
              placeholder="Ime, telefon, e-mail ili ekipa…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setLimit(PAGE_SIZE)
              }}
              className="pl-9 h-9"
            />
          </div>
          <Segmented
            value={filter}
            onChange={(f) => {
              setFilter(f)
              setLimit(PAGE_SIZE)
            }}
            options={[
              { value: 'upcoming', label: 'Predstoji' },
              { value: 'due', label: 'Za naplatu' },
              { value: 'past', label: 'Odigrano' },
              { value: 'cancelled', label: 'Otkazano' },
              { value: 'all', label: 'Sve' },
            ]}
          />
          <span className="ml-auto text-xs text-ink-500 tabular">
            {filtered.length} {filtered.length === 1 ? 'rezervacija' : 'rezervacija'}
          </span>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-ink-50 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Nema rezultata' : 'Nema rezervacija u ovom pregledu'}
            description={search ? `Ništa ne odgovara pretrazi „${search}”.` : 'Promijeni filter iznad tabele.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Termin</th>
                  <th>Klijent</th>
                  <th>Teren</th>
                  <th>Kanal</th>
                  <th className="text-right">Cijena</th>
                  <th>Plaćanje</th>
                  <th>Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    resourceName={resourceName.get(b.resource_id)}
                    onCancel={() => setCancelId(b.id)}
                    onNoShow={() => noShow.mutate(b.id)}
                    paying={payingId === b.id}
                    payPending={recordPayment.isPending && payingId === b.id}
                    payError={payingId === b.id ? payError : null}
                    onStartPay={() => {
                      setPayingId(b.id)
                      setPayError(null)
                    }}
                    onPay={(method) => handlePay(b.id, due(b), method)}
                    onCancelPay={() => setPayingId(null)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > limit && (
          <div className="px-4 py-3 border-t border-ink-100 flex items-center justify-between">
            <span className="text-xs text-ink-500">
              Prikazano {visible.length} od {filtered.length}
            </span>
            <Button size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              Prikaži još
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        title="Otkaži rezervaciju"
        maxWidth="26rem"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelId(null)}>
              Nazad
            </Button>
            <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending ? 'Otkazujem…' : 'Otkaži rezervaciju'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 mb-3">Termin se oslobađa odmah i postaje dostupan za novu rezervaciju.</p>
        <Input
          id="cancel-reason"
          placeholder="Razlog otkazivanja (opcionalno)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </Modal>
    </Page>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  warn,
  active,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  warn?: boolean
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'card text-left px-4 py-3.5 transition-all hover:shadow-lift',
        active && 'ring-2 ring-ink-900 border-transparent',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
        {warn && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold text-ink-900 tabular">{value}</div>
      {hint && <div className="text-[11px] text-ink-400 mt-0.5">{hint}</div>}
    </button>
  )
}

function BookingRow({
  booking: b,
  resourceName,
  onCancel,
  onNoShow,
  paying,
  payPending,
  payError,
  onStartPay,
  onPay,
  onCancelPay,
}: {
  booking: Booking
  resourceName?: string
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
  const now = new Date()
  const start = new Date(b.start_at)
  const ended = new Date(b.end_at) < now
  const live = start <= now && !ended
  const paidCents = b.paid_cents ?? 0
  const dueCents = Math.max(0, b.price_cents - paidCents)
  const fullyPaid = dueCents === 0 && b.price_cents > 0
  const methods = b.payment_methods ?? []

  return (
    <>
      <tr>
        <td className="whitespace-nowrap">
          <div className="font-medium text-ink-900 first-letter:uppercase">
            {format(start, 'EEE, d. MMM yyyy.', { locale: bs })}
          </div>
          <div className="text-xs text-ink-500 tabular">
            {format(start, 'HH:mm')} – {format(new Date(b.end_at), 'HH:mm')} · {duration(b.start_at, b.end_at)}
          </div>
        </td>
        <td>
          {b.customer_name || b.team_name ? (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-ink-900 truncate max-w-[200px]">{b.customer_name ?? b.team_name}</span>
                <TierPill tier={b.customer_tier === 'vip' ? 'vip' : undefined} size="sm" />
              </div>
              <div className="text-xs text-ink-500 truncate max-w-[220px]">
                {b.customer_phone ?? b.customer_email ?? (b.team_name && b.customer_name ? b.team_name : '—')}
              </div>
            </div>
          ) : (
            <span className="text-ink-300">—</span>
          )}
        </td>
        <td className="text-ink-600 whitespace-nowrap">{resourceName ?? '—'}</td>
        <td>
          <Badge tone={b.channel === 'online' ? 'info' : 'neutral'}>{b.channel === 'online' ? 'Online' : 'Recepcija'}</Badge>
        </td>
        <td className="text-right tabular whitespace-nowrap">
          <div className="font-medium text-ink-900">{money(b.price_cents)}</div>
          {paidCents > 0 && !fullyPaid && <div className="text-[11px] text-amber-700">plaćeno {money(paidCents)}</div>}
        </td>
        <td>
          {fullyPaid ? (
            <div className="flex flex-wrap gap-1">
              {methods.map((m) => (
                <Badge key={m} tone="paid">
                  {METHOD_LABEL[m] ?? m}
                </Badge>
              ))}
              {methods.length === 0 && <Badge tone="paid">Plaćeno</Badge>}
            </div>
          ) : b.status === 'confirmed' && !paying ? (
            <button
              onClick={onStartPay}
              className={clsx(
                'h-7 px-2.5 rounded-lg text-xs font-semibold ring-1 ring-inset transition-colors',
                start <= now
                  ? 'bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100'
                  : 'bg-surface text-ink-700 ring-ink-200 hover:bg-ink-50',
              )}
            >
              Naplati {money(dueCents)}
            </button>
          ) : (
            <span className="text-ink-300">—</span>
          )}
        </td>
        <td>
          {b.status === 'cancelled' ? (
            <Badge tone="noshow">Otkazano</Badge>
          ) : b.status === 'no_show' ? (
            <Badge tone="unpaid">Nije došao</Badge>
          ) : live ? (
            <Badge tone="paid">U toku</Badge>
          ) : ended ? (
            <Badge tone="neutral">Odigrano</Badge>
          ) : (
            <Badge tone="info">Potvrđeno</Badge>
          )}
        </td>
        <td>
          {b.status === 'confirmed' && (
            <div className="relative">
              <button
                onClick={() => setOpen(!open)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-ink-100 text-ink-500"
                aria-label="Više opcija"
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <circle cx="4" cy="10" r="1.6" />
                  <circle cx="10" cy="10" r="1.6" />
                  <circle cx="16" cy="10" r="1.6" />
                </svg>
              </button>
              {open && (
                <div
                  className="absolute right-0 top-9 bg-surface ring-1 ring-ink-200 rounded-xl shadow-pop z-10 min-w-[160px] p-1 animate-pop-in"
                  onMouseLeave={() => setOpen(false)}
                >
                  {!ended && (
                    <button
                      onClick={() => {
                        setOpen(false)
                        onNoShow()
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-700 hover:bg-ink-50"
                    >
                      Nije došao
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setOpen(false)
                      onCancel()
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
                  >
                    Otkaži rezervaciju
                  </button>
                </div>
              )}
            </div>
          )}
        </td>
      </tr>

      {paying && (
        <tr className="bg-teal-50/50">
          <td colSpan={8}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-ink-800">Naplati {money(dueCents)}</span>
              <Button size="sm" variant="primary" onClick={() => onPay('cash')} disabled={payPending}>
                Gotovina
              </Button>
              <Button size="sm" onClick={() => onPay('card_pos')} disabled={payPending}>
                Kartica (POS)
              </Button>
              {payPending && <span className="text-xs text-ink-500">Snimam…</span>}
              {payError && <span className="text-xs text-red-600">{payError}</span>}
              <button onClick={onCancelPay} className="text-xs text-ink-500 hover:text-ink-800 ml-auto">
                Odustani
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
