import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bookingApi, customerApi, paymentApi, pricingApi, resourceApi, shiftApi } from '@/lib/api'
import type { Booking, UUID } from '@/lib/types'

export function useResources() {
  return useQuery({
    queryKey: ['resources'],
    queryFn: () => resourceApi.list().then((r) => r.data ?? []),
    staleTime: 60_000,
  })
}

export function useBookings(resourceId: UUID | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['bookings', resourceId, from, to],
    queryFn: () =>
      resourceId ? bookingApi.list(resourceId, from, to, true).then((r) => r.data ?? []) : Promise.resolve([]),
    enabled: !!resourceId,
    staleTime: 10_000,
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: bookingApi.create,
    onSuccess: (newBooking) => {
      // Immediately inject the new booking into all calendar caches
      qc.setQueriesData<Booking[]>({ queryKey: ['cal-week'] }, (old) =>
        old ? [...old, newBooking] : [newBooking],
      )
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['cal-week'] })
      qc.invalidateQueries({ queryKey: ['bookings-all'] })
      qc.invalidateQueries({ queryKey: ['bookings-recent'] })
      qc.invalidateQueries({ queryKey: ['bookings-dash-today'] })
      qc.invalidateQueries({ queryKey: ['bookings-dash-week'] })
    },
  })
}

export function useCancelBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: UUID; reason?: string }) => bookingApi.cancel(id, reason),
    onMutate: async ({ id }) => {
      // Optimistically remove from calendar immediately
      await qc.cancelQueries({ queryKey: ['cal-week'] })
      const snapshots = qc.getQueriesData<Booking[]>({ queryKey: ['cal-week'] })
      qc.setQueriesData<Booking[]>({ queryKey: ['cal-week'] }, (old) =>
        (old ?? []).filter((b) => b.id !== id),
      )
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['cal-week'] })
      qc.invalidateQueries({ queryKey: ['bookings-all'] })
      qc.invalidateQueries({ queryKey: ['bookings-recent'] })
    },
  })
}

export function useCustomerSearch(query: string, limit = 20) {
  return useQuery({
    queryKey: ['customers', query, limit],
    queryFn: () => customerApi.search(query, limit).then((r) => r.data ?? []),
    staleTime: 30_000,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: customerApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, force }: { id: UUID; force?: boolean }) => customerApi.delete(id, force),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: UUID; name: string; phone?: string; email?: string; tier: string; team_name?: string }) =>
      customerApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

/**
 * Live pricing quote. Enabled only when resource and time are present.
 * Debounce in the UI before passing args here.
 */
export function usePricingQuote(args: {
  resource_id?: UUID
  start_at?: string
  end_at?: string
  customer_id?: UUID
  channel?: string
}) {
  const ready = !!(args.resource_id && args.start_at && args.end_at)
  return useQuery({
    queryKey: ['pricing-quote', args],
    queryFn: () =>
      pricingApi.quote({
        resource_id: args.resource_id!,
        start_at: args.start_at!,
        end_at: args.end_at!,
        customer_id: args.customer_id,
        channel: args.channel,
      }),
    enabled: ready,
    staleTime: 30_000,
    retry: false,
  })
}

export function useShifts(limit = 30) {
  return useQuery({
    queryKey: ['shifts', limit],
    queryFn: () => shiftApi.list(limit).then((r) => r.data ?? []),
    staleTime: 10_000,
  })
}

export function useCloseShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, closing_cash_counted_cents, variance_explained }: { id: UUID; closing_cash_counted_cents: number; variance_explained?: string }) =>
      shiftApi.close(id, { closing_cash_counted_cents, variance_explained }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift', 'open'] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
    },
  })
}

export function useOpenShift() {
  return useQuery({
    queryKey: ['shift', 'open'],
    queryFn: async () => {
      try {
        return await shiftApi.getOpen()
      } catch {
        return null
      }
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  })
}

export function useOpenShiftMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opening_cash_cents: number) => shiftApi.open(opening_cash_cents),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift', 'open'] }),
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      shiftId,
      ...body
    }: {
      shiftId: UUID
      booking_id?: UUID
      amount_cents: number
      method: string
      card_terminal_ref?: string
    }) => shiftApi.recordPayment(shiftId, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['shift', 'open'] })
      if (vars.booking_id) {
        qc.invalidateQueries({ queryKey: ['booking-payments', vars.booking_id] })
      }
    },
  })
}

export function useBookingPayments(bookingId: UUID | undefined) {
  return useQuery({
    queryKey: ['booking-payments', bookingId],
    queryFn: () =>
      bookingId ? bookingApi.listPayments(bookingId).then((r) => r.data ?? []) : Promise.resolve([]),
    enabled: !!bookingId,
    staleTime: 10_000,
  })
}

export function usePricingRules(includeInactive = false) {
  return useQuery({
    queryKey: ['pricing-rules', includeInactive],
    queryFn: () => pricingApi.listRules(includeInactive).then((r) => r.data ?? []),
    staleTime: 30_000,
  })
}

export function useCreatePricingRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pricingApi.createRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }),
  })
}

export function useUpdatePricingRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: UUID; patch: import('@/lib/types').PricingRulePatch }) =>
      pricingApi.updateRule(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }),
  })
}

export function useDeletePricingRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: UUID) => pricingApi.deleteRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }),
  })
}

export function useRescheduleBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookingId, start_at, end_at }: { bookingId: UUID; start_at: string; end_at: string }) =>
      bookingApi.reschedule(bookingId, { start_at, end_at }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['cal-week'] })
      qc.invalidateQueries({ queryKey: ['bookings-all'] })
      qc.invalidateQueries({ queryKey: ['bookings-recent'] })
    },
  })
}

export function useAssignCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookingId, customerId }: { bookingId: UUID; customerId: UUID }) =>
      bookingApi.reschedule(bookingId, { customer_id: customerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['cal-week'] })
      qc.invalidateQueries({ queryKey: ['cal-day'] })
    },
  })
}

export function useVoidPayment(bookingId: UUID | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: UUID; reason: string }) => paymentApi.void(id, reason),
    onSuccess: () => {
      if (bookingId) qc.invalidateQueries({ queryKey: ['booking-payments', bookingId] })
    },
  })
}
