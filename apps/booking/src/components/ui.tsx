import { useEffect, type ReactNode } from 'react'
import { clsx } from 'clsx'

// ── Icons ───────────────────────────────────────────────────────────────────
export type IconName =
  | 'home' | 'plus' | 'calendar' | 'user' | 'chevron-right' | 'chevron-left' | 'clock'
  | 'pin' | 'cash' | 'card' | 'check' | 'close' | 'logout' | 'lock' | 'phone' | 'note'
  | 'mail' | 'alert' | 'ball'

export function Icon({ name, className = 'w-5 h-5', strokeWidth = 1.9 }: { name: IconName; className?: string; strokeWidth?: number }) {
  const p = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'home':
      return <svg {...p}><path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19v-8.5Z" /></svg>
    case 'plus':
      return <svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path d="M12 8.5v7M8.5 12h7" /></svg>
    case 'calendar':
      return <svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
    case 'user':
      return <svg {...p}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c.9-3.6 3.9-5.8 7.5-5.8s6.6 2.2 7.5 5.8" /></svg>
    case 'chevron-right':
      return <svg {...p}><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></svg>
    case 'chevron-left':
      return <svg {...p}><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
    case 'clock':
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
    case 'pin':
      return <svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>
    case 'cash':
      return <svg {...p}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></svg>
    case 'card':
      return <svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h3" /></svg>
    case 'check':
      return <svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
    case 'close':
      return <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
    case 'logout':
      return <svg {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" /></svg>
    case 'lock':
      return <svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
    case 'phone':
      return <svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>
    case 'note':
      return <svg {...p}><path d="M5 4.5h14v15H5z" /><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></svg>
    case 'mail':
      return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>
    case 'alert':
      return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.3" /></svg>
    case 'ball':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="m12 7.5 3.5 2.5-1.3 4h-4.4l-1.3-4L12 7.5ZM12 3v4.5M20.5 9.5 15.5 10M17.5 19l-3.3-5M6.5 19l3.3-5M3.5 9.5l5 .5" />
        </svg>
      )
  }
}

// ── Screen + large title ────────────────────────────────────────────────────
export function Screen({
  title,
  eyebrow,
  trailing,
  onBack,
  children,
  bottomInset = true,
}: {
  title?: ReactNode
  eyebrow?: ReactNode
  trailing?: ReactNode
  onBack?: () => void
  children: ReactNode
  bottomInset?: boolean
}) {
  return (
    <div className={clsx('min-h-full', bottomInset && 'pb-28')}>
      {onBack && (
        <div className="sticky top-0 z-20 bg-app/85 backdrop-blur-xl pt-safe">
          <div className="h-12 px-2 flex items-center">
            <button
              onClick={onBack}
              className="h-10 pl-1 pr-3 rounded-xl flex items-center gap-0.5 text-teal-700 font-semibold text-[15px] active:opacity-60"
            >
              <Icon name="chevron-left" className="w-6 h-6" strokeWidth={2.2} />
              Nazad
            </button>
          </div>
        </div>
      )}
      {(title || trailing) && (
        <header className={clsx('px-5 flex items-end justify-between gap-3', onBack ? 'pt-1 pb-4' : 'pt-safe-6 pb-4')}>
          <div className="min-w-0">
            {eyebrow && <div className="text-[13px] font-medium text-gray-500">{eyebrow}</div>}
            {title && <h1 className="text-[30px] leading-[1.1] font-bold tracking-tight text-gray-900">{title}</h1>}
          </div>
          {trailing && <div className="shrink-0 pb-1">{trailing}</div>}
        </header>
      )}
      <div className="px-4 space-y-6">{children}</div>
    </div>
  )
}

// ── Grouped list (iOS settings style) ───────────────────────────────────────
export function Section({ title, action, children, footer }: { title?: ReactNode; action?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section>
      {(title || action) && (
        <div className="flex items-end justify-between px-1 mb-2">
          {title && <h2 className="text-[17px] font-semibold text-gray-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
      {footer && <p className="px-1 mt-2 text-xs text-gray-500">{footer}</p>}
    </section>
  )
}

export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('bg-white rounded-2xl overflow-hidden divide-y divide-gray-100 shadow-card', className)}>{children}</div>
}

export function Row({
  icon,
  iconTone = 'gray',
  label,
  detail,
  value,
  onClick,
  chevron,
  danger,
  trailing,
}: {
  icon?: IconName
  iconTone?: 'gray' | 'green' | 'dark' | 'red' | 'amber'
  label: ReactNode
  detail?: ReactNode
  value?: ReactNode
  onClick?: () => void
  chevron?: boolean
  danger?: boolean
  trailing?: ReactNode
}) {
  const tone = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-teal-50 text-teal-700',
    dark: 'bg-gray-900 text-lime-400',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
  }[iconTone]
  const Inner = (
    <>
      {icon && (
        <span className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', tone)}>
          <Icon name={icon} className="w-[18px] h-[18px]" />
        </span>
      )}
      <span className="flex-1 min-w-0 text-left">
        <span className={clsx('block text-[15px] font-medium truncate', danger ? 'text-red-600' : 'text-gray-900')}>{label}</span>
        {detail && <span className="block text-[13px] text-gray-500 truncate">{detail}</span>}
      </span>
      {value && <span className="text-[15px] text-gray-500 shrink-0 max-w-[50%] truncate">{value}</span>}
      {trailing}
      {chevron && <Icon name="chevron-right" className="w-4 h-4 text-gray-300 shrink-0" strokeWidth={2.4} />}
    </>
  )
  return onClick ? (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 min-h-[56px] py-2.5 active:bg-gray-50 transition-colors">
      {Inner}
    </button>
  ) : (
    <div className="flex items-center gap-3 px-4 min-h-[56px] py-2.5">{Inner}</div>
  )
}

// ── Segmented control ───────────────────────────────────────────────────────
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
}) {
  return (
    <div className="grid bg-gray-200/70 rounded-xl p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-9 rounded-[10px] text-[13px] font-semibold transition-all inline-flex items-center justify-center gap-1.5',
            value === o.value ? 'bg-white text-gray-900 shadow-card' : 'text-gray-500',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Bottom sheet ────────────────────────────────────────────────────────────
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-gray-950/40 animate-fade-in" aria-label="Zatvori" onClick={onClose} />
      <div className="relative w-full max-w-[440px] max-h-[92vh] flex flex-col bg-app rounded-t-[28px] shadow-sheet animate-sheet-up">
        <div className="pt-2.5 pb-1 flex justify-center">
          <span className="w-9 h-[5px] rounded-full bg-gray-300" />
        </div>
        {title && (
          <div className="px-5 pt-2 pb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-200/80 text-gray-600 flex items-center justify-center active:scale-95"
              aria-label="Zatvori"
            >
              <Icon name="close" className="w-4 h-4" strokeWidth={2.4} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="px-4 pt-2 pb-safe-4 border-t border-gray-200/70 bg-app">{footer}</div>}
      </div>
    </div>
  )
}

// ── Misc ────────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 'md' }: { name?: string; size?: 'md' | 'lg' }) {
  const initials = (name ?? '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  return (
    <span
      className={clsx(
        'rounded-full bg-gray-900 text-lime-400 font-bold flex items-center justify-center shrink-0',
        size === 'lg' ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-sm',
      )}
    >
      {initials || '•'}
    </span>
  )
}

export function StatusPill({ status, past }: { status: string; past?: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    confirmed: past
      ? { label: 'Odigrano', cls: 'bg-gray-100 text-gray-600' }
      : { label: 'Potvrđeno', cls: 'bg-teal-50 text-teal-700' },
    completed: { label: 'Odigrano', cls: 'bg-gray-100 text-gray-600' },
    cancelled: { label: 'Otkazano', cls: 'bg-red-50 text-red-700' },
    no_show: { label: 'Propušteno', cls: 'bg-amber-50 text-amber-800' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={clsx('text-[12px] font-semibold px-2 py-0.5 rounded-md shrink-0', s.cls)}>{s.label}</span>
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start text-[14px] text-red-700 bg-red-50 rounded-xl px-3.5 py-3">
      <Icon name="alert" className="w-[18px] h-[18px] shrink-0 mt-px" />
      <span>{children}</span>
    </div>
  )
}
