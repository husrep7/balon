import { useEffect, useState } from 'react'
import { addMinutes, parseISO, format } from 'date-fns'
import { clsx } from 'clsx'
import { useAssignCustomer, useBookingPayments, useCancelBooking, useCustomerSearch, useRescheduleBooking, useVoidPayment } from '@/hooks'
import { fmtMoney, fmtTime } from '@/lib/time'
import { Badge, Button, Input, Modal, TierPill } from '@/components/ui'
import { PaymentModal } from './PaymentModal'
import type { Booking, Customer, Payment } from '@/lib/types'

const SLOT_MIN = 75
const RESCHEDULE_SLOTS = Array.from({ length: 12 }, (_, i) => {
  const totalMin = 8 * 60 + i * SLOT_MIN
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return { label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, h, m }
})

interface Props {
  booking: Booking
  onClose: () => void
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Keš',
  card_pos: 'Kartica',
  membership_credit: 'Sezona',
  voucher: 'Vaučer',
  transfer: 'Uplata',
}

export function BookingDetail({ booking, onClose }: Props) {
  const cancel = useCancelBooking()
  const assignCustomer = useAssignCustomer()
  const { data: payments = [] } = useBookingPayments(booking.id)
  const voidPay = useVoidPayment(booking.id)
  const [payOpen, setPayOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [addingCustomer, setAddingCustomer] = useState(false)

  const paidCents = payments.filter((p) => !p.voided_at).reduce((sum, p) => sum + p.amount_cents, 0)
  const remainingCents = Math.max(booking.price_cents - paidCents, 0)
  const fullyPaid = paidCents >= booking.price_cents

  const statusLabel: Record<string, string> = {
    confirmed: 'Potvrđeno',
    cancelled: 'Otkazano',
    no_show: 'Nije došao',
    completed: 'Završeno',
  }

  return (
    <div className="space-y-4">
      {/* Customer + time block */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            {booking.customer_name ? (
              <>
                <div className="text-base font-semibold text-ink-800 leading-tight">
                  {booking.customer_name}
                </div>
                {booking.customer_phone && (
                  <a href={`tel:${booking.customer_phone}`} className="text-xs text-teal-700 hover:underline mt-0.5 block">
                    {booking.customer_phone}
                  </a>
                )}
                {booking.customer_email && (
                  <div className="text-xs text-ink-400 mt-0.5 truncate">{booking.customer_email}</div>
                )}
              </>
            ) : (
              <div className="text-sm text-ink-400 italic">Bez klijenta</div>
            )}
          </div>
          <div className="flex gap-1 shrink-0 flex-wrap justify-end">
            <TierPill tier={booking.customer_tier} />
            {booking.series_id && <Badge tone="info">↻ stalna</Badge>}
            {fullyPaid && <Badge tone="paid">plaćeno</Badge>}
            {paidCents > 0 && !fullyPaid && <Badge tone="unpaid">djelimično</Badge>}
          </div>
        </div>

        {/* Assign customer if missing */}
        {!booking.customer_name && booking.status === 'confirmed' && (
          addingCustomer ? (
            <CustomerAssign
              onSelect={(c) => {
                assignCustomer.mutate({ bookingId: booking.id, customerId: c.id })
                setAddingCustomer(false)
              }}
              onCancel={() => setAddingCustomer(false)}
            />
          ) : (
            <button
              onClick={() => setAddingCustomer(true)}
              className="text-xs text-teal-700 hover:underline mb-2 block"
            >
              + Dodaj klijenta
            </button>
          )
        )}

        <div className="bg-surface-muted rounded-md px-3 py-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-500">Datum</span>
            <span className="text-xs font-medium text-ink-800">
              {format(parseISO(booking.start_at), 'EEEE, d. MMMM yyyy.')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-500">Termin</span>
            <span className="text-xs font-medium text-ink-800 tabular">
              {fmtTime(booking.start_at)} – {fmtTime(booking.end_at)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-500">Status</span>
            <span className="text-xs font-medium text-ink-700">
              {statusLabel[booking.status] ?? booking.status}
            </span>
          </div>
        </div>
      </div>

      {/* Price block */}
      <div className="bg-surface-muted rounded-md px-3 py-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-500">Ukupno</span>
          <span className="text-base font-bold text-ink-800 tabular">
            {fmtMoney(booking.price_cents)}
          </span>
        </div>
        {paidCents > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-500">Plaćeno</span>
              <span className="text-xs text-paid-fg tabular font-medium">
                {fmtMoney(paidCents)}
              </span>
            </div>
            {!fullyPaid && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-500">Ostaje</span>
                <span className="text-xs text-unpaid-fg tabular font-medium">
                  {fmtMoney(remainingCents)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          onClick={() => setPayOpen(true)}
          disabled={fullyPaid || booking.status !== 'confirmed'}
          title={fullyPaid ? 'Termin je u potpunosti plaćen' : undefined}
          className="w-full justify-center"
        >
          {fullyPaid ? '✓ Plaćeno' : paidCents > 0 ? `Doplati ${fmtMoney(remainingCents)}` : 'Naplati'}
        </Button>
        {!confirmCancel ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 justify-center"
              disabled={booking.status !== 'confirmed'}
              onClick={() => setRescheduleOpen(true)}
            >
              Pomjeri
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="flex-1 justify-center"
              disabled={booking.status !== 'confirmed'}
              onClick={() => setConfirmCancel(true)}
            >
              Otkaži
            </Button>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
            <p className="text-xs text-red-700 font-medium">Sigurno otkazati ovaj termin?</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                className="flex-1 justify-center"
                disabled={cancel.isPending}
                onClick={() => {
                  cancel.mutate({ id: booking.id })
                  onClose()
                }}
              >
                {cancel.isPending ? '...' : 'Da, otkaži'}
              </Button>
              <Button
                size="sm"
                className="flex-1 justify-center"
                onClick={() => setConfirmCancel(false)}
              >
                Ne
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Payments list */}
      {payments.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2 font-semibold">
            Naplate
          </div>
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                onVoid={(reason) => voidPay.mutate({ id: p.id, reason })}
                pending={voidPay.isPending && voidPay.variables?.id === p.id}
              />
            ))}
          </ul>
        </div>
      )}

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        booking={booking}
        remainingCents={remainingCents}
      />

      <RescheduleModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        booking={booking}
        onSuccess={onClose}
      />
    </div>
  )
}

function RescheduleModal({
  open,
  onClose,
  booking,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  booking: Booking
  onSuccess: () => void
}) {
  const reschedule = useRescheduleBooking()
  const [dateStr, setDateStr] = useState('')
  const [slotIdx, setSlotIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // Default to today so future slots are immediately available
      setDateStr(format(new Date(), 'yyyy-MM-dd'))
      setSlotIdx(null)
      setError(null)
    }
  }, [open])

  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')

  function isSlotPast(slot: { h: number; m: number }): boolean {
    if (!dateStr || dateStr < today) return true
    if (dateStr > today) return false
    // Today: slot is past/in-progress if it has already started
    const slotStart = new Date(dateStr)
    slotStart.setHours(slot.h, slot.m, 0, 0)
    return slotStart <= now
  }

  async function handleSubmit() {
    if (slotIdx === null) return
    setError(null)
    const slot = RESCHEDULE_SLOTS[slotIdx]
    const startAt = new Date(`${dateStr}T${slot.label}:00`)
    const endAt = addMinutes(startAt, SLOT_MIN)
    try {
      await reschedule.mutateAsync({
        bookingId: booking.id,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
      })
      onSuccess()
      onClose()
    } catch {
      setError('Termin je već zauzet ili je došlo do greške.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pomjeri termin"
      maxWidth="22rem"
      footer={
        <>
          <Button onClick={onClose} disabled={reschedule.isPending}>Otkaži</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={slotIdx === null || !dateStr || reschedule.isPending}
          >
            {reschedule.isPending ? 'Snimam...' : 'Pomjeri'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-surface-muted rounded px-3 py-2 text-xs text-ink-500">
          Trenutno: {format(parseISO(booking.start_at), 'EEEE d. MMM')} ·{' '}
          {fmtTime(booking.start_at)}–{fmtTime(booking.end_at)}
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-ink-500 font-semibold mb-1.5 block">
            Novi datum
          </label>
          <input
            type="date"
            value={dateStr}
            min={today}
            onChange={(e) => { setDateStr(e.target.value); setSlotIdx(null) }}
            className="w-full h-9 px-3 border border-ink-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-surface"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-ink-500 font-semibold mb-1.5 block">
            Novi termin
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {RESCHEDULE_SLOTS.map((slot, i) => {
              const past = isSlotPast(slot)
              return (
                <button
                  key={slot.label}
                  onClick={() => !past && setSlotIdx(i)}
                  disabled={past}
                  className={clsx(
                    'h-9 text-xs rounded border transition-colors tabular',
                    past
                      ? 'border-ink-100 text-ink-300 bg-ink-50 cursor-not-allowed'
                      : slotIdx === i
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                  )}
                >
                  {slot.label}
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

function PaymentRow({
  payment,
  onVoid,
  pending,
}: {
  payment: Payment
  onVoid: (reason: string) => void
  pending: boolean
}) {
  const voided = !!payment.voided_at
  return (
    <li className="flex items-center gap-3 text-xs">
      <span className="tabular text-ink-700 w-20">{fmtMoney(payment.amount_cents)}</span>
      <span className="text-ink-500 w-20">{METHOD_LABEL[payment.method] ?? payment.method}</span>
      <span className="text-ink-400 tabular">
        {format(parseISO(payment.collected_at), 'd.M. HH:mm')}
      </span>
      {voided && (
        <span className="text-ink-400 italic line-through-mark">
          storno: {payment.void_reason ?? '—'}
        </span>
      )}
      <span className="flex-1" />
      {!voided && (
        <button
          onClick={() => {
            const reason = prompt('Razlog storna?')
            if (reason && reason.trim()) onVoid(reason.trim())
          }}
          disabled={pending}
          className="text-red-700 hover:text-red-900 disabled:opacity-50"
        >
          {pending ? '...' : 'Storno'}
        </button>
      )}
    </li>
  )
}

function CustomerAssign({
  onSelect,
  onCancel,
}: {
  onSelect: (c: Customer) => void
  onCancel: () => void
}) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200)
    return () => clearTimeout(t)
  }, [q])

  const { data: customers = [] } = useCustomerSearch(debouncedQ)

  return (
    <div className="relative mb-2">
      <div className="flex gap-1">
        <Input
          placeholder="Traži klijenta..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          className="flex-1 h-8 text-xs"
        />
        <button onClick={onCancel} className="text-xs text-ink-400 hover:text-ink-700 px-1">
          ✕
        </button>
      </div>
      {q.length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-0.5 max-h-44 overflow-auto bg-surface border border-ink-200 rounded shadow-sm z-10">
          {customers.length === 0 ? (
            <div className="p-2 text-xs text-ink-400">nema rezultata</div>
          ) : customers.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left px-3 py-2 hover:bg-ink-50 border-b border-ink-100 last:border-b-0"
            >
              <div className="text-xs font-medium">{c.name}</div>
              <div className="text-[11px] text-ink-400">{c.phone ?? '—'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
