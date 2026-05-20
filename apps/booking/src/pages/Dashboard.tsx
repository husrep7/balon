import { useQuery } from '@tanstack/react-query'
import { bookingApi, tenantApi, type Booking } from '../lib/api'
import { getUser } from '../lib/auth'
import { fmtDate, fmtTime, fmtDuration, fmtMoney, isUpcoming } from '../lib/utils'
import type { Page } from '../components/Shell'

interface Props {
  onNav: (page: Page) => void
  onReschedule: (b: Booking) => void
}

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Potvrđeno', cls: 'bg-teal-100 text-teal-700' },
  cancelled: { label: 'Otkazano', cls: 'bg-red-100 text-red-700' },
  no_show: { label: 'Nije došao', cls: 'bg-gray-100 text-gray-500' },
  completed: { label: 'Završeno', cls: 'bg-blue-100 text-blue-700' },
}

export function Dashboard({ onNav, onReschedule }: Props) {
  const user = getUser()
  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: bookingApi.list,
  })
  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.get })

  const bookings = bookingsData?.data ?? []
  const upcoming = bookings
    .filter((b) => b.status === 'confirmed' && isUpcoming(b.start_at))
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const next = upcoming[0]
  const recent = bookings.slice(0, 4)

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">
          Zdravo{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! 👋
        </h1>
        {tenant && <p className="text-sm text-gray-500 mt-0.5">{tenant.name}</p>}
      </div>

{/* Next booking card */}
      {isLoading ? (
        <div className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
      ) : next ? (
        <NextBookingCard booking={next} onReschedule={onReschedule} onNav={onNav} />
      ) : (
        <div className="bg-gradient-to-br from-teal-50 to-teal-100/60 border border-teal-200 rounded-2xl p-4 text-center">
          <p className="text-sm text-teal-700 font-medium">Nemate nadolazećih termina</p>
          <p className="text-xs text-teal-600 mt-1">Rezervišite teren i igrajte!</p>
        </div>
      )}

      {/* Book now CTA */}
      <button
        onClick={() => onNav('new-booking')}
        className="w-full bg-teal-600 text-white rounded-2xl py-4 text-base font-semibold hover:bg-teal-700 active:bg-teal-800 transition-colors shadow-sm"
      >
        Rezerviši termin
      </button>

      {/* Upcoming */}
      {upcoming.length > 1 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Nadolazeći termini</h2>
          <div className="space-y-2">
            {upcoming.slice(1, 4).map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
          {upcoming.length > 4 && (
            <button onClick={() => onNav('bookings')} className="text-xs text-teal-600 mt-2">
              Prikaži sve ({upcoming.length}) →
            </button>
          )}
        </section>
      )}

      {/* Recent history */}
      {recent.filter((b) => !isUpcoming(b.start_at)).length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Nedavno</h2>
            <button onClick={() => onNav('bookings')} className="text-xs text-teal-600">Svi termini →</button>
          </div>
          <div className="space-y-2">
            {recent.filter((b) => !isUpcoming(b.start_at)).map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function NextBookingCard({ booking: b, onReschedule, onNav }: { booking: Booking; onReschedule: (b: Booking) => void; onNav: (p: Page) => void }) {
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: tenantApi.resources })
  const resourceName = resources?.data.find((r) => r.id === b.resource_id)?.name ?? 'Teren'

  return (
    <div className="bg-teal-600 text-white rounded-2xl p-4">
      <p className="text-xs text-teal-200 font-medium uppercase tracking-wider">Sljedeći termin</p>
      <p className="text-lg font-semibold mt-1">{resourceName}</p>
      <p className="text-teal-100 text-sm mt-0.5">
        {fmtDate(b.start_at)} · {fmtTime(b.start_at)} – {fmtTime(b.end_at)}
        {' '}· {fmtDuration(b.start_at, b.end_at)}
      </p>
      {b.price_cents > 0 && (
        <p className="text-teal-200 text-xs mt-1">{fmtMoney(b.price_cents)}</p>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onReschedule(b)}
          className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm py-1.5 rounded-lg transition-colors"
        >
          Promijeni
        </button>
        <button
          onClick={() => onNav('bookings')}
          className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm py-1.5 rounded-lg transition-colors"
        >
          Detalji
        </button>
      </div>
    </div>
  )
}

function BookingRow({ booking: b }: { booking: Booking }) {
  const s = STATUS[b.status] ?? { label: b.status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{fmtDate(b.start_at)}</p>
        <p className="text-xs text-gray-500">{fmtTime(b.start_at)} · {fmtDuration(b.start_at, b.end_at)}</p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${s.cls}`}>{s.label}</span>
    </div>
  )
}
