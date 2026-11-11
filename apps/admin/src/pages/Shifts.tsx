import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { bs } from 'date-fns/locale'
import { useCloseShift, useOpenShift, useOpenShiftMutation, useShifts } from '@/hooks'
import { clsx } from 'clsx'
import { Button, EmptyState, Input, Modal, Page, Panel } from '@/components/ui'
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

  const totalHanded = closedShifts.reduce((sum, s) => sum + (s.closing_cash_counted_cents ?? 0), 0)

  return (
    <Page title="Smjene i kasa" subtitle="Otvaranje i zatvaranje smjene, gotovina u kasi i predaja novca">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Current shift */}
        <section
          className={clsx(
            'lg:col-span-2 rounded-2xl p-6 relative overflow-hidden',
            openShift ? 'bg-ink-900 text-white' : 'card',
          )}
        >
          {loadingOpen ? (
            <div className="space-y-3">
              <div className="h-5 w-40 rounded bg-ink-100 animate-pulse" />
              <div className="h-10 w-56 rounded bg-ink-100 animate-pulse" />
            </div>
          ) : openShift ? (
            <div className="relative flex flex-col gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-lime-400">
                    <span className="relative flex w-2 h-2">
                      <span className="absolute inset-0 rounded-full bg-lime-400 animate-ping opacity-60" />
                      <span className="relative w-2 h-2 rounded-full bg-lime-400" />
                    </span>
                    {shiftLabel(openShift)} je otvorena
                  </span>
                  <div className="mt-2 text-sm text-ink-300">
                    Počela u {shiftOfficialStart(openShift)} · otvorena {format(parseISO(openShift.opened_at), 'HH:mm')} ·{' '}
                    <span className="text-white font-medium">{shiftPerson(openShift)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular leading-none">{format(now, 'HH:mm:ss')}</div>
                  <div className="text-xs text-ink-400 mt-1 first-letter:uppercase">
                    {format(now, 'EEEE, d. MMMM', { locale: bs })}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs text-ink-400">Naplaćeno u ovoj smjeni</div>
                  <div className="mt-1 text-[44px] leading-none font-semibold tracking-tight">
                    {fmtMoney(openShift.cash_collected_cents ?? 0)}
                  </div>
                </div>
                <button
                  onClick={() => setCloseOpen(true)}
                  className="h-11 px-5 rounded-xl bg-lime-400 text-ink-900 text-sm font-semibold hover:bg-lime-300 transition-colors"
                >
                  Zatvori smjenu i predaj novac
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-ink-900">Nema otvorene smjene</h2>
                <p className="text-sm text-ink-500 mt-1 max-w-md">
                  Otvori smjenu na početku rada. Sve naplate se vežu za otvorenu smjenu, a na kraju se gotovina predaje
                  nadređenom.
                </p>
              </div>
              <div>
                <Button variant="primary" size="lg" disabled={openMut.isPending} onClick={() => openMut.mutate(0)}>
                  {openMut.isPending ? 'Otvaranje…' : 'Otvori smjenu'}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Schedule */}
        <Panel title="Raspored smjena" subtitle="Ko radi i kada">
          <ul className="space-y-2">
            {[
              { label: 'Prva smjena', time: '08:00 – 15:30', person: 'Ishak' },
              { label: 'Druga smjena', time: '15:30 – 23:00', person: 'Ibrahim' },
            ].map((row) => {
              const active = openShift && shiftLabel(openShift) === row.label
              return (
                <li
                  key={row.label}
                  className={clsx(
                    'flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 ring-1 ring-inset',
                    active ? 'bg-teal-50 ring-teal-200' : 'bg-ink-50/60 ring-ink-100',
                  )}
                >
                  <div>
                    <div className="text-sm font-medium text-ink-900">{row.person}</div>
                    <div className="text-xs text-ink-500">{row.label}</div>
                  </div>
                  <div className="text-sm font-semibold tabular text-ink-800">{row.time}</div>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>

      {/* History */}
      <Panel
        title="Historija smjena"
        subtitle={closedShifts.length ? `Zadnjih ${closedShifts.length} · predano ukupno ${fmtMoney(totalHanded)}` : undefined}
        bodyClassName="pb-1"
      >
        {loadingHistory ? (
          <div className="px-5 pb-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-ink-50 animate-pulse" />
            ))}
          </div>
        ) : closedShifts.length === 0 ? (
          <EmptyState title="Nema zatvorenih smjena" description="Zatvorene smjene i predani iznosi pojavit će se ovdje." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Smjena</th>
                  <th>Otvorena</th>
                  <th>Zatvorena</th>
                  <th className="text-right">Predano</th>
                  <th>Napomena</th>
                </tr>
              </thead>
              <tbody>
                {closedShifts.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium text-ink-900">{shiftLabel(s)}</div>
                      <div className="text-xs text-ink-500">{shiftPerson(s)}</div>
                    </td>
                    <td className="tabular">{fmtDatetime(s.opened_at)}</td>
                    <td className="tabular">{s.closed_at ? fmtDatetime(s.closed_at) : '—'}</td>
                    <td className="text-right tabular font-semibold text-ink-900">
                      {fmtMoney(s.closing_cash_counted_cents ?? 0)}
                    </td>
                    <td className="text-ink-500 text-xs">{s.variance_explained || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {openShift && (
        <CloseShiftModal
          shift={openShift}
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
          defaultCounted={(openShift.cash_collected_cents ?? 0) / 100}
        />
      )}
    </Page>
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
