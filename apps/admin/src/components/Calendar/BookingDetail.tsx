import { useState } from 'react'
import { parseISO, format } from 'date-fns'
import { useBookingPayments, useCancelBooking, useVoidPayment } from '@/hooks'
import { fmtMoney, fmtTime } from '@/lib/time'
import { Badge, Button } from '@/components/ui'
import { PaymentModal } from './PaymentModal'
import type { Booking, Payment } from '@/lib/types'

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
  const { data: payments = [] } = useBookingPayments(booking.id)
  const voidPay = useVoidPayment(booking.id)
  const [payOpen, setPayOpen] = useState(false)

  const paidCents = payments.filter((p) => !p.voided_at).reduce((sum, p) => sum + p.amount_cents, 0)
  const remainingCents = Math.max(booking.price_cents - paidCents, 0)
  const fullyPaid = paidCents >= booking.price_cents

  return (
    <div className="bg-info-bg border border-info-fg/20 rounded-md p-4 space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-ink-800">{booking.notes ?? 'Termin'}</span>
            {booking.series_id && <Badge tone="info">stalna ekipa</Badge>}
            {fullyPaid && <Badge tone="paid">plaćeno</Badge>}
            {paidCents > 0 && !fullyPaid && <Badge tone="unpaid">djelimično</Badge>}
          </div>
          <div className="text-xs text-ink-500">
            {format(parseISO(booking.start_at), 'EEEE d. MMM')} · {fmtTime(booking.start_at)}–
            {fmtTime(booking.end_at)} · {booking.status}
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium text-base text-ink-800 tabular">
            {fmtMoney(booking.price_cents)}
          </div>
          {paidCents > 0 && (
            <div className="text-xs text-ink-500 tabular">
              plaćeno {fmtMoney(paidCents)}
              {!fullyPaid && ` · ostaje ${fmtMoney(remainingCents)}`}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setPayOpen(true)}
            disabled={fullyPaid}
            title={fullyPaid ? 'Termin je već u potpunosti plaćen' : undefined}
          >
            {fullyPaid ? 'Plaćeno' : paidCents > 0 ? `Doplati ${fmtMoney(remainingCents)}` : 'Naplati'}
          </Button>
          <Button size="sm">Pomjeri</Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (confirm('Otkazati termin?')) {
                cancel.mutate({ id: booking.id })
                onClose()
              }
            }}
          >
            Otkaži
          </Button>
        </div>
      </div>

      {payments.length > 0 && (
        <div className="border-t border-info-fg/10 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1.5">Naplate</div>
          <ul className="space-y-1">
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
    </div>
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
