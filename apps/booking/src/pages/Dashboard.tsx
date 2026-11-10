import { useQuery } from '@tanstack/react-query'
import { bookingApi, tenantApi, type Booking } from '../lib/api'
import { getUser } from '../lib/auth'
import { PitchLines } from '../components/Brand'
import { fmtDate, fmtTime, fmtDuration, fmtMoney, isUpcoming } from '../lib/utils'
import type { Page } from '../components/Shell'

interface Props {
  onNav: (page: Page) => void
  onReschedule: (b: Booking) => void
}

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Potvrđeno', cls: 'bg-teal-50 text-teal-700 ring-teal-200' },
  cancelled: { label: 'Otkazano', cls: 'bg-red-50 text-red-700 ring-red-200' },
  no_show: { label: 'Nije došao', cls: 'bg-gray-100 text-gray-500 ring-gray-200' },
  completed: { label: 'Završeno', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
}

function greeting() {
  const h = new Date().getHours()
  return h < 11 ? 'Dobro jutro' : h < 18 ? 'Zdravo' : 'Dobro veče'
}

export function Dashboard({ onNav, onReschedule }: Props) {
  const user = getUser()
  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: bookingApi.list,
  })

  const bookings = bookingsData?.data ?? []
  const upcoming = bookings
    .filter((b) => b.status === 'confirmed' && isUpcoming(b.start_at))
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const next = upcoming[0]
  const past = bookings
    .filter((b) => !isUpcoming(b.start_at))
    .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
    .slice(0, 3)
  const played = bookings.filter((b) => !isUpcoming(b.start_at) && b.status !== 'cancelled').length

  return (
    <div className="px-5 pt-6 space-y-6">
      {/* Greeting */}
      <div className="animate-fade-up">
        <p className="text-sm text-gray-500">{greeting()} 👋</p>
        <h1 className="text-[28px] leading-tight font-extrabold text-gray-900 mt-0.5">
          {user?.name ? user.name.split(' ')[0] : 'Dobrodošao'}
        </h1>
      </div>

      {/* Next booking */}
      {isLoading ? (
        <div className="h-48 bg-gray-200/70 rounded-3xl animate-pulse" />
      ) : next ? (
        <NextBookingCard booking={next} onReschedule={onReschedule} onNav={onNav} />
      ) : (
        <button
          onClick={() => onNav('new-booking')}
          className="relative w-full overflow-hidden text-left rounded-3xl bg-gray-900 p-6 shadow-lift animate-fade-up group"
        >
          <PitchLines />
          <div className="pointer-events-none absolute -right-10 -top-16 w-56 h-56 rounded-full bg-teal-500/30 blur-3xl" />
          <div className="relative">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lime-400">
              Nema zakazanih termina
            </span>
            <p className="mt-3 text-2xl font-display font-extrabold text-white leading-tight">
              Vrijeme je
              <br />
              za utakmicu ⚽
            </p>
            <span className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-lime-400 text-gray-900 text-sm font-bold group-active:scale-95 transition-transform">
              Rezerviši termin
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <path d="M4 10h12M11 5l5 5-5 5" />
              </svg>
            </span>
          </div>
        </button>
      )}

      {/* Quick stats */}
      {!isLoading && bookings.length > 0 && (
        <div className="grid grid-cols-2 gap-3 animate-fade-up [animation-delay:80ms]">
          <Stat value={upcoming.length} label={upcoming.length === 1 ? 'nadolazeći termin' : 'nadolazećih termina'} />
          <Stat value={played} label={played === 1 ? 'odigran termin' : 'odigranih termina'} />
        </div>
      )}

      {/* Book now CTA */}
      {next && (
        <button onClick={() => onNav('new-booking')} className="btn-primary">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nova rezervacija
        </button>
      )}

      {/* Upcoming */}
      {upcoming.length > 1 && (
        <section className="space-y-3">
          <SectionHeader title="Nadolazeći" action={upcoming.length > 4 ? `Svi (${upcoming.length})` : undefined} onAction={() => onNav('bookings')} />
          <div className="space-y-2.5">
            {upcoming.slice(1, 4).map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        </section>
      )}

      {/* Recent history */}
      {past.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Nedavno" action="Svi termini" onAction={() => onNav('bookings')} />
          <div className="space-y-2.5">
            {past.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-xs font-semibold text-teal-700">
          {action} →
        </button>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="card px-4 py-4">
      <p className="text-3xl font-display font-extrabold text-gray-900 leading-none">{value}</p>
      <p className="text-xs text-gray-500 mt-1.5">{label}</p>
    </div>
  )
}

function NextBookingCard({ booking: b, onReschedule, onNav }: { booking: Booking; onReschedule: (b: Booking) => void; onNav: (p: Page) => void }) {
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })
  const resourceName = resources?.data.find((r) => r.id === b.resource_id)?.name ?? 'Teren'
  const start = new Date(b.start_at)
  const dayDiff = Math.round(
    (new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() -
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) /
      86_400_000,
  )
  const when = dayDiff === 0 ? 'Danas' : dayDiff === 1 ? 'Sutra' : `Za ${dayDiff} dana`

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white shadow-lift animate-fade-up">
      <PitchLines />
      <div className="pointer-events-none absolute -right-12 -top-16 w-60 h-60 rounded-full bg-teal-500/35 blur-3xl" />
      <div className="relative p-6">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lime-400">Sljedeći termin</span>
          <span className="rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11px] font-semibold">{when}</span>
        </div>
        <p className="mt-4 font-display text-[44px] leading-none font-extrabold tracking-tight">
          {fmtTime(b.start_at)}
          <span className="text-xl text-gray-400 font-bold"> – {fmtTime(b.end_at)}</span>
        </p>
        <p className="mt-2 text-sm text-gray-300">
          {fmtDate(b.start_at)} · {fmtDuration(b.start_at, b.end_at)}
        </p>
        <div className="mt-5 flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-gray-200">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-teal-300" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" />
              <circle cx="12" cy="10" r="2.3" />
            </svg>
            {resourceName}
          </span>
          {b.price_cents > 0 && (
            <>
              <span className="text-gray-600">•</span>
              <span className="font-semibold text-white">{fmtMoney(b.price_cents)}</span>
            </>
          )}
        </div>
      </div>
      {/* Ticket perforation */}
      <div className="relative flex items-center">
        <span className="w-5 h-5 -ml-2.5 rounded-full bg-gray-50" />
        <span className="flex-1 border-t-2 border-dashed border-white/15" />
        <span className="w-5 h-5 -mr-2.5 rounded-full bg-gray-50" />
      </div>
      <div className="relative grid grid-cols-2 gap-2 p-4">
        <button
          onClick={() => onReschedule(b)}
          className="h-11 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold ring-1 ring-white/10 transition-colors"
        >
          Promijeni
        </button>
        <button
          onClick={() => onNav('bookings')}
          className="h-11 rounded-xl bg-lime-400 text-gray-900 hover:bg-lime-300 text-sm font-bold transition-colors"
        >
          Detalji
        </button>
      </div>
    </div>
  )
}

function BookingRow({ booking: b }: { booking: Booking }) {
  const s = STATUS[b.status] ?? { label: b.status, cls: 'bg-gray-100 text-gray-600 ring-gray-200' }
  const d = new Date(b.start_at)
  return (
    <div className="card p-3 flex items-center gap-3.5">
      <div className="w-12 h-12 rounded-2xl bg-gray-50 ring-1 ring-gray-200/80 flex flex-col items-center justify-center shrink-0">
        <span className="text-[10px] font-semibold uppercase text-gray-400 leading-none">
          {d.toLocaleDateString('sr-Latn-BA', { month: 'short' }).replace('.', '')}
        </span>
        <span className="text-lg font-display font-extrabold text-gray-900 leading-none mt-0.5">{d.getDate()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">
          {fmtTime(b.start_at)} – {fmtTime(b.end_at)}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {fmtDuration(b.start_at, b.end_at)}
          {b.price_cents > 0 && ` · ${fmtMoney(b.price_cents)}`}
        </p>
      </div>
      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset shrink-0 ${s.cls}`}>{s.label}</span>
    </div>
  )
}
