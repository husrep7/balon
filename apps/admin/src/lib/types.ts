export type UUID = string

export type ResourceKind = 'full_pitch' | 'half_pitch' | 'court' | 'other'

export interface Resource {
  id: UUID
  tenant_id: UUID
  parent_id?: UUID
  kind: ResourceKind
  name: string
  path: string
  bookable: boolean
  config: Record<string, unknown>
  created_at: string
}

export type BookingStatus = 'confirmed' | 'cancelled' | 'no_show' | 'completed'

export interface Booking {
  id: UUID
  tenant_id: UUID
  resource_id: UUID
  customer_id?: UUID
  team_id?: UUID
  series_id?: UUID
  series_occurrence_date?: string
  start_at: string
  end_at: string
  status: BookingStatus
  price_cents: number
  applied_rule_id?: UUID
  channel: string
  notes?: string
  created_by?: UUID
  created_at: string
  cancelled_at?: string
  cancellation_reason?: string
  /** Aggregated by list endpoints only. May be 0/undefined for single-booking responses. */
  paid_cents?: number
  payment_methods?: PaymentMethod[]
  payment_preference?: string
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  customer_tier?: 'regular' | 'vip'
  team_name?: string
}

export interface Customer {
  id: UUID
  tenant_id: UUID
  name: string
  phone?: string
  email?: string
  tier: 'regular' | 'vip'
  team_name?: string
  notes?: string
  created_at: string
}

export interface Team {
  id: UUID
  tenant_id: UUID
  name: string
  captain_id?: UUID
  default_payer_id?: UUID
  primary_phone?: string
  notes?: string
  created_at: string
}

export type PaymentMethod = 'cash' | 'card_pos' | 'membership_credit' | 'voucher' | 'transfer'

export interface Payment {
  id: UUID
  tenant_id: UUID
  booking_id?: UUID
  shift_session_id: UUID
  amount_cents: number
  method: PaymentMethod
  card_terminal_ref?: string
  fiscal_receipt_no?: string
  collected_by?: UUID
  collected_at: string
  voided_at?: string
  void_reason?: string
}

export type ShiftStatus = 'opened' | 'closing' | 'closed' | 'voided'

export interface ShiftSession {
  id: UUID
  tenant_id: UUID
  operator_id: UUID
  status: ShiftStatus
  opened_at: string
  opening_cash_cents: number
  closing_started_at?: string
  closed_at?: string
  closing_cash_counted_cents?: number
  closing_cash_expected_cents?: number
  variance_cents?: number
  variance_explained?: string
  predecessor_shift_id?: UUID
  notes?: string
  cash_collected_cents?: number
}

export interface PricingQuote {
  base_cents: number
  discount_cents: number
  final_cents: number
  applied_rule_id?: UUID
  applied_rule_name?: string
  payment_method_hint?: string
  notes?: string[]
}

export interface PricingConditions {
  day_of_week?: number[]
  time_range?: [string, string]
  customer_tier?: string[]
  resource_kind?: ResourceKind[]
  season?: string[]
  min_duration_minutes?: number
  channel?: string[]
}

export interface PricingRule {
  id: UUID
  tenant_id: UUID
  resource_id?: UUID
  name: string
  priority: number
  conditions: PricingConditions
  price_cents: number
  valid_from?: string
  valid_to?: string
  active: boolean
  created_at: string
}

export interface PricingRulePatch {
  name?: string
  priority?: number
  price_cents?: number
  active?: boolean
  conditions?: PricingConditions
}
