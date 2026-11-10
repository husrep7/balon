import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { differenceInMinutes, endOfDay, format, startOfDay, subDays } from 'date-fns'
import { bs } from 'date-fns/locale'
import { bookingApi } from '@/lib/api'
import { BookingDetail } from '@/components/Calendar/BookingDetail'
import { EmptyState, Modal, TierPill } from '@/components/ui'
import { getUserInfo } from '@/lib/auth'
import type { Booking, BookingStatus } from '@/lib/types'

function fmtMoney(cents: number) {
  if (cents === 0) return '0 KM'
  return (cents / 100).toFixed(0) + ' KM'
}

function fmtDuration(a: string, b: string) {
  const m = differenceInMinutes(new Date(b), new Date(a))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

const DAY_LABELS = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub']

export function Dashboard() {
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const today = useMemo(() => startOfDay(new Date()), [])
  const todayEnd = useMemo(() => endOfDay(new Date()), [])
  const weekStart = useMemo(() => subDays(today, 6), [today])

  const { data: todayBookings = [], isLoading: loadingToday } = useQuery({
    queryKey: ['bookings-dash-today', format(today, 'yyyy-MM-dd')],
    queryFn: () =>
      bookingApi
        .listAll({ from: today.toISOString(), to: todayEnd.toISOString() })
        .then((r) => r.data ?? []),
    staleTime: 30_000,
  })

  const { data: weekBookings = [], isLoading: loadingWeek } = useQuery({
    queryKey: ['bookings-dash-week', format(weekStart, 'yyyy-MM-dd')],
    queryFn: () =>
      bookingApi
        .listAll({ from: weekStart.toISOString(), to: todayEnd.toISOString() })
        .then((r) => r.data ?? []),
    staleTime: 60_000,
  })

  const { data: recentRaw = [], isLoading: loadingRecent } = useQuery({
    queryKey: ['bookings-recent'],
    queryFn: () => bookingApi.listAll({}).then((r) => r.data ?? []),
    staleTime: 15_000,
  })

  const loading = loadingToday || loadingWeek || loadingRecent

  const kpis = useMemo(() => {
    const confirmed = todayBookings.filter((b) => b.status === 'confirmed')
    const revenueCents = todayBookings.reduce((s, b) => s + (b.paid_cents ?? 0), 0)
    const unpaidCents = confirmed.reduce(
      (s, b) => s + Math.max(0, b.price_cents - (b.paid_cents ?? 0)),
      0,
    )
    return { count: confirmed.length, revenueCents, unpaidCents }
  }, [todayBookings])

  const chartDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = subDays(today, 6 - i)
      const dayStr = format(day, 'yyyy-MM-dd')
      const dayBookings = weekBookings.filter(
        (b) => format(new Date(b.start_at), 'yyyy-MM-dd') === dayStr,
      )
      const revenue = dayBookings.reduce((s, b) => s + (b.paid_cents ?? 0), 0)
      const count = dayBookings.filter((b) => b.status === 'confirmed').length
      return { day, revenue, count, label: DAY_LABELS[day.getDay()] }
    })
  }, [weekBookings, today])

  const maxRevenue = Math.max(...chartDays.map((d) => d.revenue), 1)

  const recentBookings = useMemo(
    () =>
      [...recentRaw]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [recentRaw],
  )

  const weekRevenue = chartDays.reduce((s, d) => s + d.revenue, 0)
  const weekCount = chartDays.reduce((s, d) => s + d.count, 0)
  const todaySchedule = todayBookings
    .filter((b) => b.status === 'confirmed')
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const now = new Date()
  const nextUp = todaySchedule.find((b) => new Date(b.end_at) > now)
  const hour = now.getHours()
  const greeting = hour < 11 ? 'Dobro jutro' : hour < 18 ? 'Dobar dan' : 'Dobro veče'
  const firstName = getUserInfo()?.name?.split(' ')[0]

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-ink-900 text-white px-6 sm:px-8 py-7 shadow-lift">
        <PitchLines />
        <div className="pointer-events-none absolute -right-16 -top-20 w-80 h-80 rounded-full bg-teal-500/25 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-lime-400">
              {format(now, 'EEEE, d. MMMM yyyy.', { locale: bs })}
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="mt-2 text-sm text-ink-400 max-w-md">
              {loading
                ? 'Učitavam današnji raspored…'
                : todaySchedule.length === 0
                  ? 'Danas još nema potvrđenih termina.'
                  : nextUp
                    ? `Danas ${todaySchedule.length} ${todaySchedule.length === 1 ? 'termin' : 'termina'}. Sljedeći u ${format(new Date(nextUp.start_at), 'HH:mm')}${nextUp.customer_name ? ` · ${nextUp.customer_name}` : ''}.`
                    : `Danas ${todaySchedule.length} ${todaySchedule.length === 1 ? 'termin' : 'termina'}, svi su završeni.`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/bookings"
              className="h-11 px-4 text-sm rounded-xl bg-white/10 text-white hover:bg-white/15 inline-flex items-center font-medium ring-1 ring-white/10 transition-colors"
            >
              Sve rezervacije
            </Link>
            <Link
              to="/calendar"
              className="h-11 px-5 text-sm rounded-xl bg-lime-400 text-ink-900 hover:bg-lime-300 inline-flex items-center gap-2 font-semibold transition-colors"
            >
              <span className="text-lg leading-none">+</span> Nova rezervacija
            </Link>
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Prihod danas"
          value={loading ? '—' : fmtMoney(kpis.revenueCents)}
          sub="naplaćeno"
          tone="green"
          icon="cash"
        />
        <KpiCard
          label="Termini danas"
          value={loading ? '—' : String(kpis.count)}
          sub="potvrđenih"
          tone="blue"
          icon="ball"
        />
        <KpiCard
          label="Neplaćeno"
          value={loading ? '—' : fmtMoney(kpis.unpaidCents)}
          sub="otvoreni dug danas"
          tone="amber"
          icon="alert"
        />
        <KpiCard
          label="Zadnjih 7 dana"
          value={loading ? '—' : fmtMoney(weekRevenue)}
          sub={`${weekCount} ${weekCount === 1 ? 'termin' : 'termina'}`}
          tone="violet"
          icon="trend"
        />
      </div>

      {/* Chart + Recent Bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 card p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="eyebrow">Prihod</p>
              <p className="mt-1 text-2xl font-bold text-ink-900 tabular">{fmtMoney(weekRevenue)}</p>
              <p className="text-xs text-ink-400">zadnjih 7 dana</p>
            </div>
            <span className="pill bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> danas
            </span>
          </div>
          <div className="relative h-44">
            <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-t border-dashed border-ink-100" />
              ))}
            </div>
            <div className="relative h-full flex items-end gap-3">
              {chartDays.map((d, i) => {
                const isToday = format(d.day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
                const pct = Math.round((d.revenue / maxRevenue) * 100)
                return (
                  <div key={i} className="group flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div className="relative w-full flex-1 flex items-end">
                      <span className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink-900 text-white text-[10px] font-medium px-1.5 py-0.5 tabular opacity-0 group-hover:opacity-100 transition-opacity">
                        {fmtMoney(d.revenue)} · {d.count}
                      </span>
                      <div
                        className={`w-full max-w-[44px] mx-auto rounded-lg transition-all duration-300 ${
                          isToday
                            ? 'bg-gradient-to-t from-teal-600 to-teal-400 shadow-glow'
                            : 'bg-ink-100 group-hover:bg-teal-200'
                        }`}
                        style={{ height: d.revenue > 0 ? `${Math.max(pct, 6)}%` : 4 }}
                      />
                    </div>
                    <span
                      className={`text-[11px] h-4 ${
                        isToday ? 'font-semibold text-teal-700' : 'text-ink-400'
                      }`}
                    >
                      {d.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="eyebrow">Nedavne rezervacije</p>
            <Link to="/bookings" className="text-xs font-medium text-teal-700 hover:text-teal-800">
              Sve →
            </Link>
          </div>
          <div className="space-y-1">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-ink-50 animate-pulse" />
              ))
            ) : recentBookings.length === 0 ? (
              <p className="text-sm text-ink-400 py-8 text-center">Nema rezervacija</p>
            ) : (
              recentBookings.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBooking(b)}
                  className="w-full flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-ink-50 text-left transition-colors"
                >
                  <Avatar name={b.customer_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-ink-900 truncate">
                        {b.customer_name ?? (
                          <span className="text-ink-400 font-normal">Bez klijenta</span>
                        )}
                      </span>
                      <TierPill tier={b.customer_tier} size="sm" />
                    </div>
                    <div className="text-xs text-ink-400 tabular">
                      {format(new Date(b.start_at), 'd.MM.')} · {format(new Date(b.start_at), 'HH:mm')} ·{' '}
                      {fmtDuration(b.start_at, b.end_at)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-ink-900 tabular">
                      {fmtMoney(b.price_cents)}
                    </div>
                    <StatusLabel status={b.status} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Today's schedule */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="eyebrow">Raspored danas</p>
            <p className="text-xs text-ink-400 mt-0.5">Klikni termin za detalje i naplatu</p>
          </div>
          <Link to="/calendar" className="text-xs font-medium text-teal-700 hover:text-teal-800">
            Otvori kalendar →
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-ink-50 animate-pulse" />
            ))}
          </div>
        ) : todaySchedule.length === 0 ? (
          <EmptyState
            title="Nema termina danas"
            description="Kad neko rezerviše teren, termin će se pojaviti ovdje."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {todaySchedule.map((b) => {
              const isPast = new Date(b.end_at) <= now
              const isLive = new Date(b.start_at) <= now && !isPast
              const unpaid = b.price_cents - (b.paid_cents ?? 0) > 0
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBooking(b)}
                  className={`group relative rounded-xl px-4 py-3 text-left ring-1 transition-all hover:-translate-y-0.5 hover:shadow-lift ${
                    isLive
                      ? 'bg-teal-600 text-white ring-teal-600 shadow-glow'
                      : isPast
                        ? 'bg-ink-50 ring-ink-200/70 opacity-70'
                        : 'bg-surface ring-ink-200 hover:ring-teal-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className={`text-sm font-bold tabular ${isLive ? 'text-white' : 'text-ink-900'}`}>
                      {format(new Date(b.start_at), 'HH:mm')}
                      <span className={`font-normal ${isLive ? 'text-teal-100' : 'text-ink-400'}`}>
                        {' – '}{format(new Date(b.end_at), 'HH:mm')}
                      </span>
                    </div>
                    {isLive ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-lime-400 text-ink-900 rounded-full px-1.5 py-0.5">
                        Uživo
                      </span>
                    ) : (
                      <TierPill tier={b.customer_tier} size="sm" />
                    )}
                  </div>
                  <div className={`text-xs truncate mt-1 ${isLive ? 'text-teal-50' : 'text-ink-700'}`}>
                    {b.customer_name ?? '—'}
                  </div>
                  <div className={`mt-1 text-[11px] tabular flex items-center gap-1.5 ${isLive ? 'text-teal-100' : 'text-ink-400'}`}>
                    {fmtMoney(b.price_cents)}
                    {unpaid && !isLive && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Neplaćeno" />}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Booking detail modal */}
      <Modal
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        title="Detalji termina"
        maxWidth="26rem"
      >
        {selectedBooking && (
          <BookingDetail booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
        )}
      </Modal>
    </div>
  )
}

function PitchLines() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 w-full h-full text-white/[0.06]"
      viewBox="0 0 800 220"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="20" y="20" width="760" height="180" rx="6" />
      <path d="M400 20v180" />
      <circle cx="400" cy="110" r="46" />
      <rect x="20" y="62" width="70" height="96" />
      <rect x="710" y="62" width="70" height="96" />
    </svg>
  )
}

function Avatar({ name }: { name?: string }) {
  const letters = (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  const palette = [
    'bg-teal-100 text-teal-800',
    'bg-sky-100 text-sky-800',
    'bg-violet-100 text-violet-800',
    'bg-amber-100 text-amber-800',
    'bg-rose-100 text-rose-800',
  ]
  const idx = name ? [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % palette.length : 0
  return (
    <div
      className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
        name ? palette[idx] : 'bg-ink-100 text-ink-400'
      }`}
    >
      {letters || '?'}
    </div>
  )
}

type KpiIcon = 'cash' | 'ball' | 'alert' | 'trend'

function KpiCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string
  value: string
  sub: string
  tone: 'green' | 'blue' | 'violet' | 'amber'
  icon: KpiIcon
}) {
  const toneCls = {
    green: 'bg-teal-50 text-teal-700 ring-teal-100',
    blue: 'bg-sky-50 text-sky-700 ring-sky-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  }[tone]

  const paths: Record<KpiIcon, JSX.Element> = {
    cash: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 9.5v5M18 9.5v5" />
      </>
    ),
    ball: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7.5 3.5 2.5-1.3 4h-4.4l-1.3-4L12 7.5ZM12 3v4.5M20.5 9.5 15.5 10M17.5 19l-3.3-5M6.5 19l3.3-5M3.5 9.5l5 .5" />
      </>
    ),
    alert: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5M12 16v.5" />
      </>
    ),
    trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  }

  return (
    <div className="card p-5 transition-shadow hover:shadow-lift">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-500">{label}</span>
        <span className={`w-9 h-9 rounded-xl ring-1 flex items-center justify-center ${toneCls}`}>
          <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            {paths[icon]}
          </svg>
        </span>
      </div>
      <div className="mt-3 text-[28px] leading-none font-bold text-ink-900 tabular tracking-tight">{value}</div>
      <div className="text-xs text-ink-400 mt-2">{sub}</div>
    </div>
  )
}

function StatusLabel({ status }: { status: BookingStatus }) {
  const map: Record<BookingStatus, { label: string; cls: string }> = {
    confirmed: { label: 'Aktivno', cls: 'text-teal-600' },
    cancelled: { label: 'Otkazano', cls: 'text-red-500' },
    no_show: { label: 'Nije došao', cls: 'text-amber-600' },
    completed: { label: 'Završeno', cls: 'text-ink-400' },
  }
  const s = map[status] ?? { label: status, cls: 'text-ink-400' }
  return <span className={`text-[11px] font-medium ${s.cls}`}>{s.label}</span>
}
