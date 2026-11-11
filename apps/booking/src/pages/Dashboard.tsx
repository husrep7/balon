import { useQuery } from '@tanstack/react-query'
import { bookingApi, tenantApi, type Booking } from '../lib/api'
import { getUser } from '../lib/auth'
import { fmtDuration, fmtMoney, fmtTime } from '../lib/utils'
import type { Route } from '../lib/router'
import { Avatar, Group, Icon, Row, Screen, Section, StatusPill } from '../components/ui'

interface Props {
  onNav: (r: Route) => void
  onReschedule: (b: Booking) => void
}

function greeting() {
  const h = new Date().getHours()
  return h < 11 ? 'Dobro jutro' : h < 18 ? 'Dobar dan' : 'Dobro veče'
}

function dayLabel(d: Date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const that = new Date(d)
  that.setHours(0, 0, 0, 0)
  const diff = Math.round((that.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Danas'
  if (diff === 1) return 'Sutra'
  return d.toLocaleDateString('sr-Latn-BA', { weekday: 'long' })
}

export function Dashboard({ onNav, onReschedule }: Props) {
  const user = getUser()
  const { data, isLoading } = useQuery({ queryKey: ['my-bookings'], queryFn: bookingApi.list })
  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.get })
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })
  const resourceName = (id: string) => resources?.data.find((r) => r.id === id)?.name ?? 'Teren'

  const now = new Date()
  const bookings = data?.data ?? []
  const upcoming = bookings
    .filter((b) => b.status === 'confirmed' && new Date(b.end_at) > now)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const next = upcoming[0]
  const later = upcoming.slice(1, 4)
  const played = bookings.filter((b) => new Date(b.end_at) <= now && b.status !== 'cancelled')
  const hours = Math.round(played.reduce((s, b) => s + (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()), 0) / 3_600_000)
  const recent = [...played].sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()).slice(0, 3)

  return (
    <Screen
      eyebrow={greeting()}
      title={user?.name?.split(' ')[0] ?? 'Dobrodošao'}
      trailing={
        <button onClick={() => onNav('profile')} aria-label="Profil" className="active:opacity-70">
          <Avatar name={user?.name} />
        </button>
      }
    >
      {/* Next game */}
      <Section title="Sljedeći termin">
        {isLoading ? (
          <div className="h-44 rounded-3xl bg-gray-200/70 animate-pulse" />
        ) : next ? (
          <NextCard booking={next} resource={resourceName(next.resource_id)} onReschedule={onReschedule} onNav={onNav} />
        ) : (
          <div className="bg-white rounded-3xl shadow-card px-5 py-6">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Icon name="calendar" className="w-6 h-6" />
            </div>
            <p className="mt-4 text-[17px] font-semibold text-gray-900">Nemaš zakazanih termina</p>
            <p className="mt-1 text-[14px] text-gray-500">
              Novi termin rezervišeš u kartici <span className="font-semibold text-gray-700">Rezerviši</span> na dnu ekrana.
            </p>
          </div>
        )}
      </Section>

      {/* Stats */}
      {!isLoading && bookings.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat value={upcoming.length} label="zakazano" />
          <Stat value={played.length} label="odigrano" />
          <Stat value={hours} label={hours === 1 ? 'sat igre' : 'sati igre'} />
        </div>
      )}

      {later.length > 0 && (
        <Section
          title="Nakon toga"
          action={
            <button onClick={() => onNav('bookings')} className="text-[15px] text-teal-700 font-medium active:opacity-60">
              Svi
            </button>
          }
        >
          <Group>
            {later.map((b) => (
              <BookingLine key={b.id} booking={b} resource={resourceName(b.resource_id)} onClick={() => onNav('bookings')} />
            ))}
          </Group>
        </Section>
      )}

      {recent.length > 0 && (
        <Section title="Nedavno odigrano">
          <Group>
            {recent.map((b) => (
              <BookingLine key={b.id} booking={b} resource={resourceName(b.resource_id)} past onClick={() => onNav('bookings')} />
            ))}
          </Group>
        </Section>
      )}

      <Section title="Teren">
        <Group>
          <Row icon="pin" iconTone="green" label={tenant?.name ?? 'Balon'} detail={resources?.data.filter((r) => !r.parent_id).map((r) => r.name).join(', ')} />
          <Row icon="clock" label="Radno vrijeme" value="08:00 – 23:00" />
          <Row icon="ball" label="Trajanje termina" value="75 min" />
        </Group>
      </Section>
    </Screen>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-card px-3.5 py-3">
      <div className="text-[22px] font-bold text-gray-900 leading-none tabular-nums">{value}</div>
      <div className="text-[12px] text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function NextCard({
  booking: b,
  resource,
  onReschedule,
  onNav,
}: {
  booking: Booking
  resource: string
  onReschedule: (b: Booking) => void
  onNav: (r: Route) => void
}) {
  const start = new Date(b.start_at)
  const live = start <= new Date()
  return (
    <div className="rounded-3xl bg-gray-900 text-white overflow-hidden shadow-lift">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-lime-400 first-letter:uppercase">
            {live && <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />}
            {live ? 'U toku' : dayLabel(start)}
          </span>
          <span className="text-[13px] text-gray-400">{start.toLocaleDateString('sr-Latn-BA', { day: 'numeric', month: 'long' })}</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[44px] leading-none font-bold tracking-tight tabular-nums">{fmtTime(b.start_at)}</span>
          <span className="text-[17px] text-gray-400 tabular-nums">– {fmtTime(b.end_at)}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[14px] text-gray-300">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="pin" className="w-4 h-4 text-gray-500" />
            {resource}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" className="w-4 h-4 text-gray-500" />
            {fmtDuration(b.start_at, b.end_at)}
          </span>
          {b.price_cents > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="cash" className="w-4 h-4 text-gray-500" />
              {fmtMoney(b.price_cents)}
            </span>
          )}
        </div>
      </div>
      {!live && (
        <div className="grid grid-cols-2 border-t border-white/10">
          <button onClick={() => onReschedule(b)} className="h-12 text-[15px] font-semibold text-white active:bg-white/5">
            Promijeni
          </button>
          <button onClick={() => onNav('bookings')} className="h-12 text-[15px] font-semibold text-lime-400 border-l border-white/10 active:bg-white/5">
            Detalji
          </button>
        </div>
      )}
    </div>
  )
}

export function BookingLine({
  booking: b,
  resource,
  past,
  onClick,
}: {
  booking: Booking
  resource: string
  past?: boolean
  onClick?: () => void
}) {
  const d = new Date(b.start_at)
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 px-4 py-3 text-left active:bg-gray-50">
      <div className="w-11 h-12 rounded-xl bg-gray-100 flex flex-col items-center justify-center shrink-0">
        <span className="text-[10px] font-semibold uppercase text-gray-500 leading-none">
          {d.toLocaleDateString('sr-Latn-BA', { month: 'short' }).replace('.', '')}
        </span>
        <span className="text-[17px] font-bold text-gray-900 leading-none mt-0.5 tabular-nums">{d.getDate()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-gray-900 tabular-nums">
          {fmtTime(b.start_at)} – {fmtTime(b.end_at)}
        </div>
        <div className="text-[13px] text-gray-500 truncate first-letter:uppercase">
          {d.toLocaleDateString('sr-Latn-BA', { weekday: 'long' })} · {resource}
        </div>
      </div>
      <StatusPill status={b.status} past={past} />
      <Icon name="chevron-right" className="w-4 h-4 text-gray-300" strokeWidth={2.4} />
    </button>
  )
}
