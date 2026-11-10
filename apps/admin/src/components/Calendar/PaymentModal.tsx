import { useEffect, useState } from 'react'
import { Badge, Button, Input, Modal } from '@/components/ui'
import { useOpenShift, useOpenShiftMutation, useRecordPayment } from '@/hooks'
import { fmtMoney } from '@/lib/time'
import { ApiError } from '@/lib/api'
import type { Booking } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  booking: Booking
  /** Outstanding amount to charge. Defaults to full price for backwards-compat. */
  remainingCents?: number
}

type Method = 'cash' | 'card_pos'

export function PaymentModal({ open, onClose, booking, remainingCents }: Props) {
  const { data: shift, isLoading: shiftLoading } = useOpenShift()
  const openShift = useOpenShiftMutation()
  const record = useRecordPayment()

  const initial = remainingCents ?? booking.price_cents
  const [amount, setAmount] = useState<number>(initial)
  const [method, setMethod] = useState<Method>('cash')
  const [terminalRef, setTerminalRef] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setAmount(remainingCents ?? booking.price_cents)
      setMethod('cash')
      setTerminalRef('')
      setError(null)
    }
  }, [open, booking.price_cents, remainingCents])

  async function handleQuickOpenShift() {
    setError(null)
    try {
      await openShift.mutateAsync(0)
    } catch (err) {
      setError(extractError(err, 'Otvaranje smjene neuspjelo'))
    }
  }

  async function handleSubmit() {
    setError(null)
    if (!shift) return
    if (amount <= 0) {
      setError('Iznos mora biti veći od nule')
      return
    }
    try {
      await record.mutateAsync({
        shiftId: shift.id,
        booking_id: booking.id,
        amount_cents: amount,
        method,
        card_terminal_ref: method === 'card_pos' ? terminalRef.trim() : undefined,
      })
      onClose()
    } catch (err) {
      setError(extractError(err, 'Greška pri naplati'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Naplata · ${fmtMoney(booking.price_cents)}`}
      footer={
        shift ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={record.isPending}>
              Odustani
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={record.isPending}>
              {record.isPending ? 'Snimam...' : 'Naplati'}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Zatvori
          </Button>
        )
      }
    >
      {shiftLoading && <div className="text-sm text-ink-500">učitavam smjenu...</div>}

      {!shiftLoading && !shift && (
        <div className="space-y-3">
          <div className="text-sm text-ink-700 bg-amber-50 border border-amber-200 rounded p-3">
            Nema otvorene smjene. Plaćanja se moraju vezati za aktivnu smjenu.
          </div>
          <Button
            variant="primary"
            onClick={handleQuickOpenShift}
            disabled={openShift.isPending}
          >
            {openShift.isPending ? 'Otvaram...' : 'Otvori smjenu (početni keš 0)'}
          </Button>
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
      )}

      {!shiftLoading && shift && (
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-500 mb-1.5">Iznos</div>
            <div className="flex items-baseline gap-2">
              <Input
                type="number"
                min={1}
                step={50}
                value={Math.round(amount / 100)}
                onChange={(e) => setAmount((parseInt(e.target.value) || 0) * 100)}
                className="w-32 tabular text-lg"
              />
              <span className="text-sm text-ink-500">KM</span>
              {amount !== booking.price_cents && (
                <Badge tone="info" className="ml-2">
                  baza {fmtMoney(booking.price_cents)}
                </Badge>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-ink-500 mb-1.5">Način</div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={method === 'cash' ? 'primary' : 'outline'}
                onClick={() => setMethod('cash')}
              >
                Keš
              </Button>
              <Button
                type="button"
                size="sm"
                variant={method === 'card_pos' ? 'primary' : 'outline'}
                onClick={() => setMethod('card_pos')}
              >
                Kartica (POS)
              </Button>
            </div>
          </div>

          {method === 'card_pos' && (
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-500 mb-1.5">
                Referenca terminala <span className="normal-case tracking-normal font-normal text-ink-400">(opciono)</span>
              </div>
              <Input
                placeholder="broj transakcije sa POS-a"
                value={terminalRef}
                onChange={(e) => setTerminalRef(e.target.value)}
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function extractError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.body === 'object' && err.body && 'error' in err.body) {
    return String((err.body as { error: unknown }).error)
  }
  if (err instanceof Error) return err.message
  return fallback
}
