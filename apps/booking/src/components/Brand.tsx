import { API_BASE_URL } from '../lib/api'

export function LogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="balon-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#17b45f" />
          <stop offset="1" stopColor="#0d743d" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#balon-logo-g)" />
      <path d="M16 6v20" stroke="#fff" strokeOpacity=".35" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="6.2" fill="none" stroke="#fff" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="1.8" fill="#c6f432" />
    </svg>
  )
}

export function Wordmark({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <span
      className={`font-display font-extrabold tracking-[-0.04em] leading-none ${
        light ? 'text-white' : 'text-gray-900'
      } ${className}`}
    >
      balon<span className="text-teal-500">.</span>
    </span>
  )
}

/** Decorative football-pitch line art, used on dark hero surfaces. */
export function PitchLines({ className = 'text-white/[0.07]' }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 w-full h-full ${className}`}
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="16" y="16" width="368" height="228" rx="6" />
      <path d="M200 16v228" />
      <circle cx="200" cy="130" r="38" />
      <circle cx="200" cy="130" r="3" fill="currentColor" />
      <rect x="16" y="74" width="54" height="112" />
      <rect x="330" y="74" width="54" height="112" />
    </svg>
  )
}

export function GoogleButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => (window.location.href = `${API_BASE_URL}/api/auth/google`)}
      className="btn-secondary"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-4z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.5 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.7-2.9-11.9-7.2l-6.6 5.1C9.5 39.5 16.3 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.9 6l6.2 5.2C40.5 35.6 44 30.2 44 24c0-1.3-.1-2.7-.4-4z" />
      </svg>
      {label}
    </button>
  )
}

export function Divider({ label = 'ili' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}
