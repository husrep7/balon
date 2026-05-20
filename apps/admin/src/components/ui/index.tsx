import { clsx } from 'clsx'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from 'react'
import { useEffect } from 'react'

// ---------- Button ----------
type Variant = 'primary' | 'ghost' | 'outline' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
}

export function Button({ variant = 'outline', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:shadow-focus',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variant === 'primary' &&
          'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800',
        variant === 'ghost' &&
          'text-ink-600 hover:bg-ink-100',
        variant === 'outline' &&
          'border border-ink-200 bg-surface text-ink-800 hover:bg-ink-50',
        variant === 'danger' &&
          'border border-red-300 text-red-700 hover:bg-red-50',
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
        'w-full h-9 px-3 text-sm rounded',
        'border border-ink-200 bg-surface text-ink-800 placeholder-ink-400',
        'focus:outline-none focus:border-teal-500 focus:shadow-focus',
        className,
      )}
    />
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
        'pill',
        tone === 'neutral' && 'bg-ink-100 text-ink-700',
        tone === 'info' && 'bg-info-bg text-info-fg',
        tone === 'paid' && 'bg-paid-bg text-paid-fg',
        tone === 'unpaid' && 'bg-unpaid-bg text-unpaid-fg',
        tone === 'noshow' && 'bg-noshow-bg text-noshow-fg',
        tone === 'vip' && 'bg-teal-50 text-teal-700',
        className,
      )}
    >
      {children}
    </span>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg border border-ink-200 w-full"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-800">{title}</h2>
            <button
              onClick={onClose}
              className="text-ink-400 hover:text-ink-700 text-xs"
              aria-label="Zatvori"
            >
              esc
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-ink-100 flex justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  )
}
