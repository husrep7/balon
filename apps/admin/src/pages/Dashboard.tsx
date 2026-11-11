import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { addDays, endOfDay, format, isSameDay, startOfDay, subDays } from 'date-fns'
import { bs } from 'date-fns/locale'
import { bookingApi } from '@/lib/api'
import { useResources } from '@/hooks'
import { BookingDetail } from '@/components/Calendar/BookingDetail'
import { Badge, EmptyState, Modal, Page, Panel, Segmented, TierPill } from '@/components/ui'
import { getUserInfo } from '@/lib/auth'
import type { Booking, BookingStatus, Resource } from '@/lib/types'

// ── Constants ───────────────────────────────────────────────────────────────
const OPEN_H = 8
const CLOSE_H = 23
const OPEN_MIN = OPEN_H * 60
const DAY_MIN = (CLOSE_H - OPEN_H) * 60 // 900 radnih minuta
const HOURS = Array.from({ length: CLOSE_H - OPEN_H }, (_, i) => OPEN_H + i)
const WEEKDAYS_MON_FIRST = [
  { idx: 1, short: 'Pon', long: 'Ponedjeljak' },
  { idx: 2, short: 'Uto', long: 'Utorak' },
  { idx: 3, short: 'Sri', long: 'Srijeda' },
  { idx: 4, short: 'Čet', long: 'Četvrtak' },
  { idx: 5, short: 'Pet', long: 'Petak' },
  { idx: 6, short: 'Sub', long: 'Subota' },
  { idx: 0, short: 'Ned', long: 'Nedjelja' },
]

// ── Formatting ──────────────────────────────────────────────────────────────
const nf = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 })
const km = (cents: number) => `${nf.format(Math.round(cents / 100))} KM`
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')
const isActive = (b: Booking) => b.status !== 'cancelled' && b.status !== 'no_show'
const dueOf = (b: Booking) => Math.max(0, b.price_cents - (b.paid_cents ?? 0))

function minutesInDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes()
}

// ── Resource helpers ────────────────────────────────────────────────────────
/** Share of the whole pitch a resource represents (a half = 0.5). */
function resourceWeights(resources: Resource[]) {
  const childCount = new Map<string, number>()
  resources.forEach((r) => {
    if (r.parent_id) childCount.set(r.parent_id, (childCount.get(r.parent_id) ?? 0) + 1)
  })
  const w = new Map<string, number>()
  resources.forEach((r) => {
    w.set(r.id, r.parent_id ? 1 / (childCount.get(r.parent_id) ?? 1) : 1)
  })
  return w
}

/** Minutes of [start,end) that fall inside opening hours of `day`. */
function openOverlap(b: Booking, day: Date, fromMin = OPEN_MIN, toMin = OPEN_MIN + DAY_MIN) {
  const s = new Date(b.start_at)
  const e = new Date(b.end_at)
  if (!isSameDay(s, day)) return 0
  const a = Math.max(minutesInDay(s), fromMin)
  const z = Math.min(isSameDay(e, day) ? minutesInDay(e) : 24 * 60, toMin)
  return Math.max(0, z - a)
}

// ── Hooks ───────────────────────────────────────────────────────────────────
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

// ════════════════════════════════════════════════════════════════════════════
export function Dashboard() {
  const now = useNow()
  const today = useMemo(() => startOfDay(new Date()), [])
  const rangeStart = useMemo(() => subDays(today, 34), [today])
  const [selected, setSelected] = useState<Booking | null>(null)

  const { data: resources = [] } = useResources()
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings-dash-range', dayKey(rangeStart)],
    queryFn: () =>
      bookingApi
        .listAll({ from: rangeStart.toISOString(), to: endOfDay(today).toISOString() })
        .then((r) => r.data ?? []),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const { data: recentRaw = [] } = useQuery({
    queryKey: ['bookings-recent'],
    queryFn: () => bookingApi.listAll({}).then((r) => r.data ?? []),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const weights = useMemo(() => resourceWeights(resources), [resources])
  const active = useMemo(() => bookings.filter(isActive), [bookings])

  // Per-day series for the last 35 days
  const days = useMemo(() => {
    return Array.from({ length: 35 }, (_, i) => {
      const day = addDays(rangeStart, i)
      const list = active.filter((b) => isSameDay(new Date(b.start_at), day))
      const revenue = list.reduce((s, b) => s + (b.paid_cents ?? 0), 0)
      const booked = list.reduce((s, b) => s + openOverlap(b, day) * (weights.get(b.resource_id) ?? 1), 0)
      return { day, revenue, count: list.length, occupancy: Math.min(1, booked / DAY_MIN) }
    })
  }, [active, rangeStart, weights])

  const todayStats = days[days.length - 1]
  const lastWeek = days[days.length - 8]
  const last14 = days.slice(-14)

  const unpaid = useMemo(
    () =>
      active
        .filter((b) => new Date(b.start_at) <= now && dueOf(b) > 0)
        .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()),
    [active, now],
  )
  const unpaidTotal = unpaid.reduce((s, b) => s + dueOf(b), 0)

  const todaySchedule = active
    .filter((b) => isSameDay(new Date(b.start_at), today))
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const nextUp = todaySchedule.find((b) => new Date(b.start_at) > now)
  const liveNow = todaySchedule.find((b) => new Date(b.start_at) <= now && new Date(b.end_at) > now)

  const recent = useMemo(
    () =>
      [...recentRaw]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 7),
    [recentRaw],
  )

  const hour = now.getHours()
  const greeting = hour < 11 ? 'Dobro jutro' : hour < 18 ? 'Dobar dan' : 'Dobro veče'
  const firstName = getUserInfo()?.name?.split(' ')[0]
  const lastWeekDay = format(lastWeek?.day ?? today, 'EEEE', { locale: bs })

  const summary = isLoading
    ? 'Učitavam današnji raspored…'
    : todaySchedule.length === 0
      ? 'Danas još nema rezervisanih termina.'
      : [
          `Danas ${todaySchedule.length} ${todaySchedule.length === 1 ? 'termin' : 'termina'}`,
          liveNow ? `uživo: ${liveNow.customer_name ?? 'termin'} do ${format(new Date(liveNow.end_at), 'HH:mm')}` : null,
          nextUp ? `sljedeći u ${format(new Date(nextUp.start_at), 'HH:mm')}` : 'svi termini su odigrani',
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <Page
      title={`${greeting}${firstName ? `, ${firstName}` : ''}`}
      subtitle={summary}
      actions={
        <>
          <Link
            to="/bookings"
            className="h-9 px-3.5 rounded-xl text-sm font-medium bg-surface ring-1 ring-ink-200 text-ink-700 hover:bg-ink-50 inline-flex items-center"
          >
            Sve rezervacije
          </Link>
          <Link
            to="/calendar"
            className="h-9 px-3.5 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 inline-flex items-center"
          >
            Otvori kalendar
          </Link>
        </>
      }
    >
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          label="Prihod danas"
          value={km(todayStats?.revenue ?? 0)}
          delta={pctDelta(todayStats?.revenue ?? 0, lastWeek?.revenue ?? 0)}
          deltaNote={`vs. prošli ${lastWeekDay}`}
          series={last14.map((d) => d.revenue)}
          loading={isLoading}
        />
        <StatTile
          label="Termini danas"
          value={String(todayStats?.count ?? 0)}
          delta={absDelta(todayStats?.count ?? 0, lastWeek?.count ?? 0, '')}
          deltaNote={`vs. prošli ${lastWeekDay}`}
          series={last14.map((d) => d.count)}
          loading={isLoading}
        />
        <StatTile
          label="Popunjenost danas"
          value={`${Math.round((todayStats?.occupancy ?? 0) * 100)}%`}
          delta={absDelta(
            Math.round((todayStats?.occupancy ?? 0) * 100),
            Math.round((lastWeek?.occupancy ?? 0) * 100),
            ' p.p.',
          )}
          deltaNote={`od 08 do 23h`}
          series={last14.map((d) => d.occupancy)}
          loading={isLoading}
        />
        <StatTile
          label="Za naplatu"
          value={km(unpaidTotal)}
          note={
            unpaid.length === 0
              ? 'Svi odigrani termini su naplaćeni'
              : `${unpaid.length} ${unpaid.length === 1 ? 'termin nije naplaćen' : 'termina nije naplaćeno'}`
          }
          tone={unpaid.length > 0 ? 'warning' : 'good'}
          loading={isLoading}
        />
      </div>

      {/* Today board + unpaid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel
          className="xl:col-span-8"
          title="Teren danas"
          subtitle={format(today, "EEEE, d. MMMM", { locale: bs })}
          action={
            <Link to="/calendar" className="text-xs font-medium text-teal-700 hover:text-teal-800">
              Kalendar →
            </Link>
          }
        >
          <TodayBoard resources={resources} bookings={todaySchedule} now={now} onSelect={setSelected} />
        </Panel>

        <Panel
          className="xl:col-span-4"
          title="Za naplatu"
          subtitle="Odigrani i započeti termini bez uplate"
          bodyClassName="px-2 pb-3"
          action={
            unpaid.length > 0 ? (
              <span className="text-xs font-semibold text-ink-900 tabular">{km(unpaidTotal)}</span>
            ) : undefined
          }
        >
          {unpaid.length === 0 ? (
            <EmptyState title="Sve je naplaćeno" description="Kad termin počne, a nije plaćen, pojavit će se ovdje." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {unpaid.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => setSelected(b)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-ink-50 text-left transition-colors"
                  >
                    <Avatar name={b.customer_name} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink-900 truncate">
                        {b.customer_name ?? b.team_name ?? 'Bez klijenta'}
                      </div>
                      <div className="text-xs text-ink-500 tabular">
                        {format(new Date(b.start_at), 'EEE d.M. · HH:mm', { locale: bs })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-ink-900 tabular">{km(dueOf(b))}</div>
                      <div className="text-[11px] font-medium text-teal-700">Naplati →</div>
                    </div>
                  </button>
                </li>
              ))}
              {unpaid.length > 6 && (
                <li className="px-3 pt-2.5 text-xs text-ink-500">
                  + još {unpaid.length - 6} u{' '}
                  <Link to="/bookings" className="font-medium text-teal-700 hover:text-teal-800">
                    rezervacijama
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>

      {/* Revenue + heatmap */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <RevenuePanel days={days} className="xl:col-span-7" />
        <Panel
          className="xl:col-span-5"
          title="Popunjenost po satima"
          subtitle="Prosjek zadnje 4 sedmice · cijeli teren = 100%"
        >
          <Heatmap bookings={active} weights={weights} today={today} />
        </Panel>
      </div>

      {/* Recent + top clients */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel
          className="xl:col-span-8"
          title="Nedavne rezervacije"
          subtitle="Najnovije prve, s recepcije i online"
          bodyClassName="pb-2"
          action={
            <Link to="/bookings" className="text-xs font-medium text-teal-700 hover:text-teal-800">
              Sve rezervacije →
            </Link>
          }
        >
          <RecentTable bookings={recent} resources={resources} onSelect={setSelected} />
        </Panel>
        <Panel className="xl:col-span-4" title="Najbolji klijenti" subtitle="Naplaćeno u zadnjih 30 dana">
          <TopClients bookings={active.filter((b) => new Date(b.start_at) >= subDays(today, 29))} />
        </Panel>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Detalji termina" maxWidth="26rem">
        {selected && <BookingDetail booking={selected} onClose={() => setSelected(null)} />}
      </Modal>
    </Page>
  )
}

// ── Stat tile ───────────────────────────────────────────────────────────────
interface Delta {
  text: string
  dir: 'up' | 'down' | 'flat'
}

function pctDelta(cur: number, prev: number): Delta | undefined {
  if (prev === 0 && cur === 0) return { text: 'bez promjene', dir: 'flat' }
  if (prev === 0) return { text: `+${km(cur)}`, dir: 'up' }
  const p = Math.round(((cur - prev) / prev) * 100)
  return { text: `${p > 0 ? '+' : ''}${p}%`, dir: p > 0 ? 'up' : p < 0 ? 'down' : 'flat' }
}

function absDelta(cur: number, prev: number, unit: string): Delta {
  const d = cur - prev
  return { text: d === 0 ? 'bez promjene' : `${d > 0 ? '+' : ''}${d}${unit}`, dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' }
}

function StatTile({
  label,
  value,
  delta,
  deltaNote,
  note,
  series,
  tone,
  loading,
}: {
  label: string
  value: string
  delta?: Delta
  deltaNote?: string
  note?: string
  series?: number[]
  tone?: 'good' | 'warning'
  loading?: boolean
}) {
  return (
    <div className="card p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-500">{label}</span>
        {tone && (
          <span
            className={clsx(
              'pill ring-1 ring-inset text-[11px]',
              tone === 'warning' ? 'bg-unpaid-bg text-unpaid-fg ring-amber-200' : 'bg-paid-bg text-paid-fg ring-green-200',
            )}
          >
            <span className={clsx('w-1.5 h-1.5 rounded-full', tone === 'warning' ? 'bg-amber-500' : 'bg-green-600')} />
            {tone === 'warning' ? 'Otvoreno' : 'Uredno'}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        {loading ? (
          <div className="h-8 w-28 rounded-lg bg-ink-100 animate-pulse" />
        ) : (
          <div className="text-[30px] leading-none font-semibold tracking-tight text-ink-900">{value}</div>
        )}
        {series && !loading && <Sparkline values={series} />}
      </div>
      <div className="text-xs text-ink-500 flex items-center gap-1.5 min-h-[18px]">
        {delta && !loading && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 font-semibold',
              delta.dir === 'up' && 'text-teal-700',
              delta.dir === 'down' && 'text-red-600',
              delta.dir === 'flat' && 'text-ink-500',
            )}
          >
            {delta.dir === 'up' && <span aria-hidden="true">▲</span>}
            {delta.dir === 'down' && <span aria-hidden="true">▼</span>}
            {delta.text}
          </span>
        )}
        {deltaNote && <span>{deltaNote}</span>}
        {note && <span>{note}</span>}
      </div>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const W = 96
  const H = 30
  const max = Math.max(...values, 1e-9)
  const step = W / Math.max(values.length - 1, 1)
  const pts = values.map((v, i) => [i * step, H - 4 - (v / max) * (H - 8)] as const)
  const last = pts[pts.length - 1]
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden="true">
      <polyline
        points={pts.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="#c3c9d2"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <circle cx={last[0]} cy={last[1]} r={4} fill="#0c9449" stroke="#ffffff" strokeWidth={2} />}
    </svg>
  )
}

// ── Today board (timeline per resource) ────────────────────────────────────
function TodayBoard({
  resources,
  bookings,
  now,
  onSelect,
}: {
  resources: Resource[]
  bookings: Booking[]
  now: Date
  onSelect: (b: Booking) => void
}) {
  const rows = useMemo(() => [...resources].sort((a, b) => a.path.localeCompare(b.path)), [resources])
  const pathOf = useMemo(() => new Map(resources.map((r) => [r.id, r.path])), [resources])
  const pct = (min: number) => `${((min - OPEN_MIN) / DAY_MIN) * 100}%`
  const nowMin = minutesInDay(now)
  const showNow = nowMin >= OPEN_MIN && nowMin <= OPEN_MIN + DAY_MIN

  if (rows.length === 0) {
    return <EmptyState title="Nema terena" description="Dodaj teren da bi se raspored prikazao." />
  }

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[680px]">
          {/* Hour axis */}
          <div className="flex pl-32">
            <div className="relative flex-1 h-5">
              {HOURS.filter((h) => h % 2 === 0).map((h) => (
                <span
                  key={h}
                  className="absolute -translate-x-1/2 text-[10px] text-ink-400 tabular"
                  style={{ left: pct(h * 60) }}
                >
                  {String(h).padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((r) => {
              const own = bookings.filter((b) => b.resource_id === r.id)
              const blockers = bookings.filter((b) => {
                const p = pathOf.get(b.resource_id)
                return p && b.resource_id !== r.id && (p.startsWith(r.path + '.') || r.path.startsWith(p + '.'))
              })
              return (
                <div key={r.id} className="flex items-center">
                  <div className="w-32 pr-3 shrink-0">
                    <div className={clsx('text-xs font-medium truncate', r.parent_id ? 'text-ink-600 pl-3' : 'text-ink-900')}>
                      {r.parent_id && <span className="text-ink-300 mr-1">└</span>}
                      {r.name}
                    </div>
                  </div>
                  <div className="relative flex-1 h-12 rounded-lg bg-ink-50 ring-1 ring-inset ring-ink-100 overflow-hidden">
                    {HOURS.slice(1).map((h) => (
                      <span key={h} className="absolute inset-y-0 w-px bg-ink-100" style={{ left: pct(h * 60) }} />
                    ))}
                    {blockers.map((b) => {
                      const s = Math.max(minutesInDay(new Date(b.start_at)), OPEN_MIN)
                      const e = Math.min(minutesInDay(new Date(b.end_at)) || 24 * 60, OPEN_MIN + DAY_MIN)
                      return (
                        <span
                          key={`blk-${b.id}`}
                          className="absolute inset-y-1 rounded-md hatch"
                          style={{ left: pct(s), width: `${((e - s) / DAY_MIN) * 100}%` }}
                          title="Zauzeto zbog rezervacije na povezanom terenu"
                        />
                      )
                    })}
                    {own.map((b) => {
                      const start = new Date(b.start_at)
                      const end = new Date(b.end_at)
                      const s = Math.max(minutesInDay(start), OPEN_MIN)
                      const e = Math.min(minutesInDay(end) || 24 * 60, OPEN_MIN + DAY_MIN)
                      const state = blockState(b, now)
                      return (
                        <button
                          key={b.id}
                          onClick={() => onSelect(b)}
                          className={clsx(
                            'absolute inset-y-1 rounded-md px-2 text-left overflow-hidden transition-shadow hover:shadow-lift focus-visible:outline-none focus-visible:shadow-focus',
                            STATE_STYLE[state].block,
                          )}
                          style={{ left: `calc(${pct(s)} + 1px)`, width: `calc(${((e - s) / DAY_MIN) * 100}% - 2px)` }}
                          title={`${format(start, 'HH:mm')}–${format(end, 'HH:mm')} · ${b.customer_name ?? 'Bez klijenta'} · ${STATE_STYLE[state].label}`}
                        >
                          <div className="text-[11px] font-semibold leading-tight truncate tabular">
                            {format(start, 'HH:mm')}
                          </div>
                          <div className="text-[11px] leading-tight truncate opacity-90">
                            {b.customer_name ?? b.team_name ?? '—'}
                          </div>
                        </button>
                      )
                    })}
                    {showNow && (
                      <span className="absolute inset-y-0 w-0.5 bg-red-500 z-10" style={{ left: pct(nowMin) }}>
                        <span className="absolute -top-0.5 -left-[3px] w-2 h-2 rounded-full bg-red-500" />
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-500">
        {(['live', 'paid', 'due', 'upcoming'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={clsx('w-3 h-3 rounded', STATE_STYLE[k].swatch)} />
            {STATE_STYLE[k].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded hatch ring-1 ring-inset ring-ink-200" />
          Blokirano povezanim terenom
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-0.5 h-3 bg-red-500" />
          Sada
        </span>
      </div>
    </div>
  )
}

type BlockState = 'live' | 'paid' | 'due' | 'upcoming'

function blockState(b: Booking, now: Date): BlockState {
  const start = new Date(b.start_at)
  const end = new Date(b.end_at)
  if (start <= now && end > now) return 'live'
  if (dueOf(b) === 0) return 'paid'
  if (start <= now) return 'due'
  return 'upcoming'
}

const STATE_STYLE: Record<BlockState, { label: string; block: string; swatch: string }> = {
  live: { label: 'U toku', block: 'bg-ink-900 text-white', swatch: 'bg-ink-900' },
  paid: { label: 'Plaćeno', block: 'bg-teal-600 text-white', swatch: 'bg-teal-600' },
  due: { label: 'Odigrano, nije plaćeno', block: 'bg-amber-200 text-amber-950 ring-1 ring-inset ring-amber-400', swatch: 'bg-amber-200 ring-1 ring-inset ring-amber-400' },
  upcoming: { label: 'Predstoji', block: 'bg-surface text-ink-800 ring-1 ring-inset ring-ink-300', swatch: 'bg-surface ring-1 ring-inset ring-ink-300' },
}

// ── Revenue chart ───────────────────────────────────────────────────────────
function niceStep(raw: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}

function RevenuePanel({
  days,
  className,
}: {
  days: { day: Date; revenue: number; count: number }[]
  className?: string
}) {
  const [range, setRange] = useState<'14' | '30'>('30')
  const data = days.slice(-Number(range))
  const total = data.reduce((s, d) => s + d.revenue, 0)
  const playedDays = data.filter((d) => d.count > 0).length

  return (
    <Panel
      className={className}
      title="Prihod"
      subtitle={`${km(total)} naplaćeno · prosjek ${km(playedDays ? total / playedDays : 0)} po radnom danu`}
      action={
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '14', label: '14 dana' },
            { value: '30', label: '30 dana' },
          ]}
        />
      }
    >
      <RevenueChart data={data} />
    </Panel>
  )
}

function RevenueChart({ data }: { data: { day: Date; revenue: number; count: number }[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 220
  const M = { top: 12, right: 4, bottom: 24, left: 52 }
  const innerW = Math.max(0, width - M.left - M.right)
  const innerH = H - M.top - M.bottom

  const maxKm = Math.max(...data.map((d) => d.revenue / 100), 0)
  const step = niceStep(Math.max(maxKm, 40) / 4)
  const top = Math.max(step * Math.ceil(maxKm / step), step * 4)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const y = (v: number) => M.top + innerH - (v / top) * innerH
  const band = data.length ? innerW / data.length : 0
  const barW = Math.min(24, band * 0.62)
  const labelEvery = data.length > 20 ? 5 : 2
  const today = new Date()

  function barPath(x: number, v: number) {
    const y0 = y(0)
    const y1 = y(v)
    const h = y0 - y1
    if (h <= 0) return ''
    const r = Math.min(4, h, barW / 2)
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0} Z`
  }

  const hd = hover !== null ? data[hover] : null

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Dnevni prihod">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="#eceef2" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-400 text-[10px] tabular">
                {t === 0 ? '0' : `${nf.format(t)} KM`}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = M.left + i * band + (band - barW) / 2
            const isToday = isSameDay(d.day, today)
            const isHover = hover === i
            return (
              <g key={i}>
                <path
                  d={barPath(x, d.revenue / 100)}
                  fill={isToday || isHover ? '#0c9449' : '#7de8aa'}
                />
                {(i % labelEvery === labelEvery - 1 || isToday) && (
                  <text
                    x={x + barW / 2}
                    y={H - 6}
                    textAnchor="middle"
                    className={clsx('text-[10px] tabular', isToday ? 'fill-ink-900 font-semibold' : 'fill-ink-400')}
                  >
                    {isToday ? 'danas' : format(d.day, 'd.M.')}
                  </text>
                )}
                <rect
                  x={M.left + i * band}
                  y={M.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            )
          })}
          <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke="#c3c9d2" strokeWidth={1} />
        </svg>
      )}
      {hd && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink-900 text-white px-2.5 py-1.5 text-xs shadow-pop whitespace-nowrap"
          style={{
            left: Math.min(Math.max(M.left + hover * band + band / 2, 70), width - 70),
            top: y(hd.revenue / 100) - 8,
          }}
        >
          <div className="font-semibold first-letter:uppercase">{format(hd.day, 'EEEE, d. MMM', { locale: bs })}</div>
          <div className="text-ink-300 tabular">
            {km(hd.revenue)} · {hd.count} {hd.count === 1 ? 'termin' : 'termina'}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Heatmap ─────────────────────────────────────────────────────────────────
const HEAT_STEPS = [
  { max: 0, cls: 'bg-ink-100', label: '0%' },
  { max: 0.25, cls: 'bg-teal-100', label: 'do 25%' },
  { max: 0.5, cls: 'bg-teal-300', label: 'do 50%' },
  { max: 0.75, cls: 'bg-teal-500', label: 'do 75%' },
  { max: 1, cls: 'bg-teal-700', label: 'do 100%' },
]
function heatClass(v: number) {
  if (v <= 0) return HEAT_STEPS[0].cls
  return (HEAT_STEPS.find((s) => v <= s.max + 1e-9) ?? HEAT_STEPS[4]).cls
}

function Heatmap({ bookings, weights, today }: { bookings: Booking[]; weights: Map<string, number>; today: Date }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null)

  const grid = useMemo(() => {
    const from = subDays(today, 28)
    const dayCounts = new Map<number, number>()
    for (let i = 0; i < 28; i++) {
      const d = addDays(from, i).getDay()
      dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1)
    }
    const sums = new Map<string, number>()
    bookings.forEach((b) => {
      const s = new Date(b.start_at)
      if (s < from || s >= today) return
      const w = weights.get(b.resource_id) ?? 1
      HOURS.forEach((h) => {
        const m = openOverlap(b, startOfDay(s), h * 60, h * 60 + 60)
        if (m > 0) {
          const k = `${s.getDay()}-${h}`
          sums.set(k, (sums.get(k) ?? 0) + (m / 60) * w)
        }
      })
    })
    const val = (d: number, h: number) => Math.min(1, (sums.get(`${d}-${h}`) ?? 0) / (dayCounts.get(d) ?? 1))
    return { val }
  }, [bookings, weights, today])

  const hv = hover ? grid.val(hover.d, hover.h) : 0
  const hd = hover ? WEEKDAYS_MON_FIRST.find((w) => w.idx === hover.d) : null

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: `36px repeat(${HOURS.length}, minmax(0, 1fr))` }}>
            <span />
            {HOURS.map((h) => (
              <span key={h} className="text-[10px] text-ink-400 text-center tabular">
                {h % 2 === 0 ? String(h).padStart(2, '0') : ''}
              </span>
            ))}
            {WEEKDAYS_MON_FIRST.map((w) => (
              <HeatRow key={w.idx} w={w} val={grid.val} onHover={setHover} hover={hover} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-ink-500 min-h-[18px]">
          {hover && hd ? (
            <>
              <span className="font-medium text-ink-900">
                {hd.long}, {String(hover.h).padStart(2, '0')}–{String(hover.h + 1).padStart(2, '0')}h
              </span>{' '}
              · {Math.round(hv * 100)}% popunjeno
            </>
          ) : (
            'Pređi preko polja za detalje'
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-ink-400">
          <span>0%</span>
          {HEAT_STEPS.map((s) => (
            <span key={s.label} className={clsx('w-4 h-3 rounded-sm', s.cls)} title={s.label} />
          ))}
          <span>100%</span>
        </div>
      </div>
    </div>
  )
}

function HeatRow({
  w,
  val,
  onHover,
  hover,
}: {
  w: (typeof WEEKDAYS_MON_FIRST)[number]
  val: (d: number, h: number) => number
  onHover: (v: { d: number; h: number } | null) => void
  hover: { d: number; h: number } | null
}) {
  return (
    <>
      <span className="text-[11px] text-ink-500 self-center">{w.short}</span>
      {HOURS.map((h) => {
        const v = val(w.idx, h)
        const isHover = hover?.d === w.idx && hover?.h === h
        return (
          <span
            key={h}
            onMouseEnter={() => onHover({ d: w.idx, h })}
            onMouseLeave={() => onHover(null)}
            className={clsx('h-6 rounded-[4px] transition-shadow', heatClass(v), isHover && 'ring-2 ring-ink-900')}
            aria-label={`${w.long} ${h}h: ${Math.round(v * 100)}%`}
          />
        )
      })}
    </>
  )
}

// ── Recent bookings table ───────────────────────────────────────────────────
const STATUS: Record<BookingStatus, { label: string; tone: 'paid' | 'neutral' | 'noshow' | 'unpaid' | 'info' }> = {
  confirmed: { label: 'Potvrđeno', tone: 'info' },
  completed: { label: 'Završeno', tone: 'neutral' },
  cancelled: { label: 'Otkazano', tone: 'noshow' },
  no_show: { label: 'Nije došao', tone: 'unpaid' },
}

function RecentTable({
  bookings,
  resources,
  onSelect,
}: {
  bookings: Booking[]
  resources: Resource[]
  onSelect: (b: Booking) => void
}) {
  const names = new Map(resources.map((r) => [r.id, r.name]))
  if (bookings.length === 0) {
    return <EmptyState title="Još nema rezervacija" description="Nove rezervacije s recepcije i online pojavit će se ovdje." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[620px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-400 border-y border-ink-100 bg-ink-50/60">
            <th className="font-semibold px-5 py-2">Klijent</th>
            <th className="font-semibold px-3 py-2">Termin</th>
            <th className="font-semibold px-3 py-2">Teren</th>
            <th className="font-semibold px-3 py-2">Kanal</th>
            <th className="font-semibold px-3 py-2 text-right">Iznos</th>
            <th className="font-semibold px-5 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {bookings.map((b) => (
            <tr key={b.id} onClick={() => onSelect(b)} className="cursor-pointer hover:bg-ink-50/80 transition-colors">
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={b.customer_name} size="sm" />
                  <span className="font-medium text-ink-900 truncate max-w-[160px]">
                    {b.customer_name ?? b.team_name ?? 'Bez klijenta'}
                  </span>
                  <TierPill tier={b.customer_tier === 'vip' ? 'vip' : undefined} size="sm" />
                </div>
              </td>
              <td className="px-3 py-2.5 text-ink-700 tabular whitespace-nowrap">
                {format(new Date(b.start_at), 'EEE d.M. · HH:mm', { locale: bs })}
              </td>
              <td className="px-3 py-2.5 text-ink-600 whitespace-nowrap">{names.get(b.resource_id) ?? '—'}</td>
              <td className="px-3 py-2.5">
                <Badge tone={b.channel === 'online' ? 'info' : 'neutral'}>
                  {b.channel === 'online' ? 'Online' : 'Recepcija'}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-right font-medium text-ink-900 tabular">{km(b.price_cents)}</td>
              <td className="px-5 py-2.5 text-right">
                <Badge tone={STATUS[b.status]?.tone ?? 'neutral'}>{STATUS[b.status]?.label ?? b.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Top clients ─────────────────────────────────────────────────────────────
function TopClients({ bookings }: { bookings: Booking[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; tier?: string; paid: number; count: number }>()
    bookings.forEach((b) => {
      const key = b.customer_id ?? b.team_name ?? b.customer_name
      if (!key) return
      const cur = m.get(key) ?? { name: b.customer_name ?? b.team_name ?? '—', tier: b.customer_tier, paid: 0, count: 0 }
      cur.paid += b.paid_cents ?? 0
      cur.count += 1
      m.set(key, cur)
    })
    return [...m.values()].sort((a, b) => b.paid - a.paid || b.count - a.count).slice(0, 5)
  }, [bookings])

  if (rows.length === 0) {
    return <EmptyState title="Nema podataka" description="Pojavit će se nakon prvih naplaćenih termina." />
  }
  const max = Math.max(...rows.map((r) => r.paid), 1)
  return (
    <ol className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={r.name + i} className="flex items-center gap-3">
          <span className="w-5 text-xs font-semibold text-ink-400 tabular text-right">{i + 1}</span>
          <Avatar name={r.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-900 truncate">{r.name}</span>
              <span className="text-sm font-semibold text-ink-900 tabular shrink-0">{km(r.paid)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-teal-50 overflow-hidden">
                <div className="h-full rounded-full bg-teal-500" style={{ width: `${(r.paid / max) * 100}%` }} />
              </div>
              <span className="text-[11px] text-ink-500 tabular shrink-0">
                {r.count} {r.count === 1 ? 'termin' : 'termina'}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ name, size = 'md' }: { name?: string; size?: 'sm' | 'md' }) {
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
      className={clsx(
        'rounded-lg flex items-center justify-center font-bold shrink-0',
        size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs',
        name ? palette[idx] : 'bg-ink-100 text-ink-400',
      )}
    >
      {letters || '?'}
    </div>
  )
}
