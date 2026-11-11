import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tenantApi } from '../lib/api'
import { LogoMark, Wordmark } from './Brand'

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
    <div className="min-h-screen md:min-h-[calc(100vh-3rem)] flex flex-col px-6 pt-safe-6 pb-safe-6">
      <div className="flex items-center gap-2.5">
        <LogoMark className="w-9 h-9" />
        <Wordmark className="text-[22px]" />
      </div>

      <div className="mt-10 animate-fade-up">
        {tenant && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[12px] font-semibold text-teal-800">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            {tenant.name}
          </span>
        )}
        <h1 className="mt-4 text-[30px] leading-[1.1] font-bold tracking-tight text-gray-900">{title}</h1>
        <p className="mt-2 text-[15px] text-gray-500">{subtitle}</p>
      </div>

      <div className="mt-8 animate-fade-up [animation-delay:60ms]">{children}</div>

      <div className="mt-auto pt-10 text-center text-[15px] text-gray-500">{footer}</div>
    </div>
  )
}
