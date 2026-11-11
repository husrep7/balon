import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bookingApi, tenantApi, type Booking } from '../lib/api'
import { fmtDuration, fmtMoney, fmtTime } from '../lib/utils'
import type { Route } from '../lib/router'
import { ErrorNote, Group, Icon, Row, Screen, SegmentedControl, Sheet } from '../components/ui'
import { BookingLine } from './Dashboard'

interface Props {
  onReschedule: (b: Booking) => void
  onNav: (r: Route) => void
}

type Tab = 'upcoming' | 'past' | 'cancelled'

export function Bookings({ onReschedule, onNav }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['my-bookings'], queryFn: bookingApi.list })
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })
  const resourceName = (id: string) => resources?.data.find((r) => r.id === id)?.name ?? 'Teren'

  const cancel = useMutation({
    mutationFn: (id: string) => bookingApi.cancel(id),
    onSuccess: () => {
      // The slot is released on the server in the same request; refresh every
      // view that shows availability so it appears free right away.
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      qc.invalidateQueries({ queryKey: ['availability'] })
      setConfirmCancel(false)
      setOpenId(null)
    },
  })

  const now = new Date()
  const all = data?.data ?? []
  const lists: Record<Tab, Booking[]> = {
    upcoming: all
      .filter((b) => b.status === 'confirmed' && new Date(b.end_at) > now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    past: all
      .filter((b) => b.status !== 'cancelled' && new Date(b.end_at) <= now)
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()),
    cancelled: all
      .filter((b) => b.status === 'cancelled')
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()),
  }
  const shown = lists[tab]
  const open = all.find((b) => b.id === openId) ?? null
  const canChange = !!open && open.status === 'confirmed' && new Date(open.start_at) > now

  function closeSheet() {
    setOpenId(null)
    setConfirmCancel(false)
    cancel.reset()
  }

  return (
    <Screen title="Moji termini">
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: `Zakazani${lists.upcoming.length ? ` · ${lists.upcoming.length}` : ''}` },
          { value: 'past', label: 'Odigrani' },
          { value: 'cancelled', label: 'Otkazani' },
        ]}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-2xl bg-gray-200/70 animate-pulse" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card px-5 py-10 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center">
            <Icon name="calendar" className="w-6 h-6" />
          </div>
          <p className="mt-4 text-[16px] font-semibold text-gray-900">
            {tab === 'upcoming' ? 'Nemaš zakazanih termina' : tab === 'past' ? 'Još nema odigranih termina' : 'Nema otkazanih termina'}
          </p>
          {tab === 'upcoming' && (
            <button onClick={() => onNav('book')} className="mt-4 text-[15px] font-semibold text-teal-700 active:opacity-60">
              Rezerviši termin
            </button>
          )}
        </div>
      ) : (
        <Group>
          {shown.map((b) => (
            <BookingLine key={b.id} booking={b} resource={resourceName(b.resource_id)} past={tab === 'past'} onClick={() => setOpenId(b.id)} />
          ))}
        </Group>
      )}

      <Sheet
        open={!!open}
        onClose={closeSheet}
        title={confirmCancel ? 'Otkazati termin?' : 'Detalji termina'}
        footer={
          canChange ? (
            confirmCancel ? (
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => setConfirmCancel(false)} className="btn-secondary">
                  Zadrži termin
                </button>
                <button
                  onClick={() => open && cancel.mutate(open.id)}
                  disabled={cancel.isPending}
                  className="h-12 rounded-2xl bg-red-600 text-white text-[15px] font-semibold active:scale-[0.98] disabled:opacity-50"
                >
                  {cancel.isPending ? 'Otkazujem…' : 'Da, otkaži'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => setConfirmCancel(true)} className="h-12 rounded-2xl bg-white text-red-600 text-[15px] font-semibold shadow-card active:scale-[0.98]">
                  Otkaži
                </button>
                <button
                  onClick={() => {
                    if (open) onReschedule(open)
                    closeSheet()
                  }}
                  className="h-12 rounded-2xl bg-gray-900 text-white text-[15px] font-semibold active:scale-[0.98]"
                >
                  Promijeni termin
                </button>
              </div>
            )
          ) : undefined
        }
      >
        {open && (
          <div className="space-y-4">
            {confirmCancel ? (
              <p className="text-[15px] text-gray-600">
                Termin {fmtTime(open.start_at)} – {fmtTime(open.end_at)} se oslobađa odmah i drugi ga mogu rezervisati. Ovo se ne može vratiti.
              </p>
            ) : (
              <>
                <div className="bg-white rounded-2xl shadow-card px-4 py-4">
                  <div className="text-[13px] text-gray-500 first-letter:uppercase">
                    {new Date(open.start_at).toLocaleDateString('sr-Latn-BA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                  <div className="mt-1 text-[32px] font-bold text-gray-900 leading-none tabular-nums">
                    {fmtTime(open.start_at)}
                    <span className="text-[18px] text-gray-400 font-semibold"> – {fmtTime(open.end_at)}</span>
                  </div>
                </div>
                <Group>
                  <Row icon="pin" iconTone="green" label={resourceName(open.resource_id)} />
                  <Row icon="clock" label="Trajanje" value={fmtDuration(open.start_at, open.end_at)} />
                  {open.price_cents > 0 && <Row icon="cash" label="Cijena" value={fmtMoney(open.price_cents)} />}
                  {open.notes && <Row icon="note" label="Napomena" detail={open.notes} />}
                </Group>
                {!canChange && open.status === 'confirmed' && (
                  <p className="text-[13px] text-gray-500 px-1">Termin je počeo ili je završen, pa se više ne može mijenjati ni otkazati.</p>
                )}
              </>
            )}
            {cancel.error && <ErrorNote>{cancel.error instanceof Error ? cancel.error.message : 'Otkazivanje nije uspjelo.'}</ErrorNote>}
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
