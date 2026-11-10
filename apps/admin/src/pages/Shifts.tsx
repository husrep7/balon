import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { bs } from 'date-fns/locale'
import { useCloseShift, useOpenShift, useOpenShiftMutation, useShifts } from '@/hooks'
import { Button, Input, Modal } from '@/components/ui'
import { ApiError } from '@/lib/api'
import type { ShiftSession } from '@/lib/types'

function fmtMoney(cents: number) {
  return (cents / 100).toFixed(2) + ' KM'
}

function fmtDatetime(iso: string) {
  return format(parseISO(iso), 'd.MM.yyyy. HH:mm')
}

function shiftLabel(s: ShiftSession): string {
  const h = parseISO(s.opened_at).getHours()
  return h < 15 ? 'Prva smjena' : 'Druga smjena'
}

function shiftOfficialStart(s: ShiftSession): string {
  const h = parseISO(s.opened_at).getHours()
  return h < 15 ? '08:00' : '15:30'
}

function shiftPerson(s: ShiftSession): string {
  const h = parseISO(s.opened_at).getHours()
  return h < 15 ? 'Ishak' : 'Ibrahim'
}

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function Shifts() {
  const { data: openShift, isLoading: loadingOpen } = useOpenShift()
  const { data: shifts = [], isLoading: loadingHistory } = useShifts(20)
  const openMut = useOpenShiftMutation()
  const [closeOpen, setCloseOpen] = useState(false)
  const now = useClock()

  const closedShifts = shifts.filter((s) => s.status === 'closed' || s.status === 'voided')

  return (
    <div className="flex-1 w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Smjene</h1>
        <p className="text-xs text-ink-500 mt-0.5">Upravljanje smjenama i evidencija naplate</p>
      </div>

      {/* Current shift card */}
      <div className="card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-4">
          Trenutna smjena
        </h2>

        {loadingOpen && (
          <p className="text-sm text-ink-400">Učitavanje...</p>
        )}

        {!loadingOpen && !openShift && (
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Nema otvorene smjene. Nova smjena može početi tek nakon što se prethodna zatvori.
            </div>
            <div className="space-y-2">
              <Button
                variant="primary"
                disabled={openMut.isPending}
                onClick={() => openMut.mutate(0)}
              >
                {openMut.isPending ? 'Otvaranje...' : 'Otvori smjenu'}
              </Button>
            </div>
          </div>
        )}

        {!loadingOpen && openShift && (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-2xl font-bold tabular text-ink-800 leading-none">
                  {format(now, 'HH:mm:ss')}
                </div>
                <div className="text-xs text-ink-500 mt-1 capitalize">
                  {format(now, 'EEEE, d. MMMM yyyy.', { locale: bs })}
                </div>
                <div className="text-xs text-ink-400 mt-0.5">
                  {shiftLabel(openShift)} · počela u {shiftOfficialStart(openShift)} · <span className="font-medium text-ink-600">{shiftPerson(openShift)}</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />
                Aktivna
              </span>
            </div>

            <div className="bg-teal-50 border border-teal-200 rounded-md px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-teal-700">Naplaćeno u ovoj smjeni</span>
              <span className="text-xl font-bold tabular text-teal-800">
                {fmtMoney(openShift.cash_collected_cents ?? 0)}
              </span>
            </div>

            <Button variant="primary" onClick={() => setCloseOpen(true)}>
              Zatvori smjenu
            </Button>
          </div>
        )}
      </div>

      {/* Shift rules info */}
      <div className="card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">
          Raspored smjena
        </h2>
        <div className="space-y-2">
          {[
            { label: 'Prva smjena', time: '08:00 – 15:30', person: 'Ishak' },
            { label: 'Druga smjena', time: '15:30 – 23:00', person: 'Ibrahim' },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-4 py-2 border-b border-ink-100 last:border-0">
              <div className="w-28 text-xs font-medium text-ink-700">{row.label}</div>
              <div className="text-xs font-semibold tabular text-teal-700 w-28">{row.time}</div>
              <div className="text-xs font-medium text-ink-800">{row.person}</div>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Historija smjena
          </h2>
        </div>
        {loadingHistory ? (
          <p className="text-xs text-ink-400 p-5">Učitavanje...</p>
        ) : closedShifts.length === 0 ? (
          <p className="text-xs text-ink-400 p-5 text-center">Nema zatvorenih smjena.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-ink-50 border-b border-ink-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600">Smjena</th>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600">Otvorena</th>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600">Zatvorena</th>
                <th className="text-right px-4 py-2.5 font-medium text-ink-600">Predano nadređenom</th>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600">Napomena</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {closedShifts.map((s) => {
                const counted = s.closing_cash_counted_cents ?? 0
                return (
                  <tr key={s.id} className="hover:bg-ink-50/50">
                    <td className="px-4 py-2.5 font-medium text-ink-700">{shiftLabel(s)}</td>
                    <td className="px-4 py-2.5 text-ink-500 tabular">{fmtDatetime(s.opened_at)}</td>
                    <td className="px-4 py-2.5 text-ink-500 tabular">
                      {s.closed_at ? fmtDatetime(s.closed_at) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular font-semibold text-ink-800">{fmtMoney(counted)}</td>
                    <td className="px-4 py-2.5 text-ink-500 text-[11px]">{s.variance_explained || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {openShift && (
        <CloseShiftModal
          shift={openShift}
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
          defaultCounted={(openShift.cash_collected_cents ?? 0) / 100}
        />
      )}
    </div>
  )
}


function CloseShiftModal({ shift, open, onClose, defaultCounted = 0 }: { shift: ShiftSession; open: boolean; onClose: () => void; defaultCounted?: number }) {
  const [counted, setCounted] = useState(defaultCounted > 0 ? defaultCounted.toFixed(2) : '')
  const [varianceExplained, setVarianceExplained] = useState('')
  const [error, setError] = useState<string | null>(null)
  const close = useCloseShift()

  const countedCents = Math.round((parseFloat(counted) || 0) * 100)

  async function handleSubmit() {
    setError(null)
    if (!counted || countedCents < 0) {
      setError('Unesi iznos gotovine koji predaješ nadređenom.')
      return
    }
    try {
      await close.mutateAsync({
        id: shift.id,
        closing_cash_counted_cents: countedCents,
        variance_explained: varianceExplained.trim() || undefined,
      })
      onClose()
    } catch (err: unknown) {
      let body = ''
      if (err instanceof ApiError && typeof err.body === 'object' && err.body && 'error' in err.body) {
        body = String((err.body as { error: unknown }).error)
      }
      if (body.includes('variance') || body.includes('razlika')) {
        setError('Postoji razlika između unesenog iznosa i naplaćene gotovine — upiši objašnjenje u polje Napomena.')
      } else {
        setError(body || (err instanceof Error ? err.message : 'Greška pri zatvaranju smjene.'))
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Zatvori smjenu"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={close.isPending}>Odustani</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={close.isPending}>
            {close.isPending ? 'Zatvaranje...' : 'Zatvori i predaj'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-800">
          Preda novac nadređenom i unesi ukupan iznos gotovine koji predaješ.
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5">
            Gotovina za predaju (KM)
          </label>
          <div className="flex items-baseline gap-2">
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={counted}
              onChange={(e) => { setCounted(e.target.value); setError(null) }}
              className="w-36 text-lg tabular"
              autoFocus
            />
            <span className="text-sm text-ink-500">KM</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5">
            Napomena <span className="normal-case tracking-normal font-normal text-ink-400">(opciono — obavezno ako postoji razlika)</span>
          </label>
          <Input
            placeholder="npr. greška u naplati, povrat..."
            value={varianceExplained}
            onChange={(e) => setVarianceExplained(e.target.value)}
          />
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
