import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tenantApi } from '../lib/api'
import { LogoMark, PitchLines, Wordmark } from './Brand'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.get })

  return (
    <div className="min-h-screen md:min-h-[calc(100vh-4rem)] flex flex-col bg-gray-900">
      <div className="relative overflow-hidden px-6 pt-10 pb-16">
        <PitchLines />
        <div className="pointer-events-none absolute -top-24 -right-20 w-72 h-72 rounded-full bg-teal-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 w-60 h-60 rounded-full bg-lime-400/10 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <LogoMark className="w-9 h-9" />
          <Wordmark light className="text-2xl" />
        </div>
        <div className="relative mt-12 animate-fade-up">
          {tenant && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1 text-[11px] font-medium text-teal-100">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-400" />
              {tenant.name}
            </span>
          )}
          <h1 className="mt-4 text-[34px] leading-[1.05] font-extrabold text-white">{title}</h1>
          <p className="mt-3 text-sm text-gray-400 max-w-xs">{subtitle}</p>
        </div>
      </div>

      <div className="relative flex-1 -mt-6 rounded-t-[2rem] bg-gray-50 px-6 pt-8 pb-10 animate-fade-up [animation-delay:60ms]">
        {children}
        <div className="mt-8 text-center text-sm text-gray-500">{footer}</div>
      </div>
    </div>
  )
}
