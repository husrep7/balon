import { clsx } from 'clsx'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from 'react'
import { useEffect } from 'react'

// ---------- Logo ----------
export function LogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="balon-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#17b45f" />
          <stop offset="1" stopColor="#0d743d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#balon-logo-g)" />
      <g transform="translate(10 9) scale(.6875)">
        <rect x="12" y="6" width="9.5" height="51.5" rx="4.75" fill="#fff" />
        <circle cx="36.5" cy="39" r="14" fill="none" stroke="#fff" strokeWidth="9.5" />
        <circle cx="36.5" cy="39" r="4.2" fill="#c6f432" />
      </g>
    </svg>
  )
}

export function Wordmark({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <span
      className={clsx(
        'font-display font-extrabold tracking-[-0.04em] leading-none',
        tone === 'light' ? 'text-white' : 'text-ink-900',
        className,
      )}
    >
      balon<span className="text-teal-500">.</span>
    </span>
  )
}

// ---------- Button ----------
type Variant = 'primary' | 'ghost' | 'outline' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'outline', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:shadow-focus',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9 px-4 text-sm',
        size === 'lg' && 'h-11 px-5 text-sm',
        variant === 'primary' &&
          'bg-teal-600 text-white shadow-sm shadow-teal-900/10 hover:bg-teal-700 active:bg-teal-800',
        variant === 'ghost' && 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
        variant === 'outline' &&
          'border border-ink-200 bg-surface text-ink-800 shadow-card hover:bg-ink-50 hover:border-ink-300',
        variant === 'danger' &&
          'border border-red-200 bg-surface text-red-700 hover:bg-red-50 hover:border-red-300',
        className,
      )}
    />
  )
}

// ---------- Input ----------
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={clsx(
        'w-full h-10 px-3 text-sm rounded-lg',
        'border border-ink-200 bg-surface text-ink-900 placeholder-ink-400 shadow-card',
        'transition-shadow focus:outline-none focus:border-teal-500 focus:shadow-focus',
        className,
      )}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-ink-600">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-400">{hint}</span>}
    </label>
  )
}

// ---------- Card ----------
export function Card({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return <div className={clsx('card', className)}>{children}</div>
}

// ---------- Page layout ----------
/** Standard page frame: same width, gutters and vertical rhythm on every screen. */
export function Page({
  title,
  subtitle,
  actions,
  children,
  width = 'wide',
}: PropsWithChildren<{
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  width?: 'wide' | 'narrow'
}>) {
  return (
    <div
      className={clsx(
        'flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6',
        width === 'wide' ? 'max-w-[1440px]' : 'max-w-5xl',
      )}
    >
      {title && <PageHeader title={title} subtitle={subtitle} actions={actions} />}
      {children}
    </div>
  )
}

// ---------- PageHeader ----------
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ---------- Panel (titled card used across dashboards) ----------
export function Panel({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
}: PropsWithChildren<{
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
  bodyClassName?: string
}>) {
  return (
    <section className={clsx('card flex flex-col min-w-0', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink-900">{title}</h2>}
            {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={clsx('flex-1 min-w-0', bodyClassName ?? 'px-5 pb-5')}>{children}</div>
    </section>
  )
}

// ---------- Segmented control ----------
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
}) {
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-ink-100 ring-1 ring-inset ring-ink-200/60">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
            value === o.value ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------- Badge / Pill ----------
type BadgeTone = 'neutral' | 'info' | 'paid' | 'unpaid' | 'noshow' | 'vip'

export function Badge({
  tone = 'neutral',
  children,
  className,
}: PropsWithChildren<{ tone?: BadgeTone; className?: string }>) {
  return (
    <span
      className={clsx(
        'pill ring-1 ring-inset',
        tone === 'neutral' && 'bg-ink-100 text-ink-700 ring-ink-200/60',
        tone === 'info' && 'bg-info-bg text-info-fg ring-sky-200/60',
        tone === 'paid' && 'bg-paid-bg text-paid-fg ring-green-200/70',
        tone === 'unpaid' && 'bg-unpaid-bg text-unpaid-fg ring-amber-200/70',
        tone === 'noshow' && 'bg-noshow-bg text-noshow-fg ring-red-200/70',
        tone === 'vip' && 'bg-amber-100 text-amber-800 font-semibold ring-amber-300/60',
        className,
      )}
    >
      {children}
    </span>
  )
}

// ---------- TierPill ----------
export function TierPill({ tier, size = 'md' }: { tier?: string; size?: 'sm' | 'md' }) {
  if (!tier) return null
  const sm = size === 'sm'
  if (tier === 'vip') {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-0.5 rounded-full font-semibold bg-gradient-to-r from-amber-200 to-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300/60',
          sm ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]',
        )}
      >
        ★ VIP
      </span>
    )
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-full bg-ink-100 text-ink-500',
        sm ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]',
      )}
    >
      <svg viewBox="0 0 14 14" className={sm ? 'w-2 h-2' : 'w-2.5 h-2.5'} fill="currentColor" aria-hidden="true">
        <circle cx="7" cy="4.5" r="2.5" />
        <path d="M1.5 12.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round" />
      </svg>
      REG
    </span>
  )
}

// ---------- Empty state ----------
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4 ring-1 ring-teal-100">
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v16M4 12h16" strokeOpacity=".4" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description && <p className="text-xs text-ink-500 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------- Modal ----------
interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children?: ReactNode
  footer?: ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, footer, maxWidth = '32rem' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/50 backdrop-blur-[2px] p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-pop ring-1 ring-ink-900/5 w-full max-h-[92vh] flex flex-col animate-pop-in"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 -mr-2 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-800 hover:bg-ink-100 transition-colors"
              aria-label="Zatvori"
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        <div className={clsx('px-6 pb-5 overflow-y-auto', !title && 'pt-5')}>{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-ink-100 bg-ink-50/60 rounded-b-2xl flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
