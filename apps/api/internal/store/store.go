package store

import "github.com/jackc/pgx/v5/pgxpool"

type Stores struct {
	Pool             *pgxpool.Pool
	Tenants          *TenantStore
	Resources        *ResourceStore
	Customers        *CustomerStore
	Teams            *TeamStore
	Bookings         *BookingStore
	Series           *SeriesStore
	Pricing          *PricingStore
	Shifts           *ShiftStore
	Payments         *PaymentStore
	Users            *UserStore
	CustomerAccounts *CustomerAccountStore
}

func New(pool *pgxpool.Pool) *Stores {
	return &Stores{
		Pool:             pool,
		Tenants:          &TenantStore{db: pool},
		Resources:        &ResourceStore{db: pool},
		Customers:        &CustomerStore{db: pool},
		Teams:            &TeamStore{db: pool},
		Bookings:         &BookingStore{db: pool},
		Series:           &SeriesStore{db: pool},
		Pricing:          &PricingStore{db: pool},
		Shifts:           &ShiftStore{db: pool},
		Payments:         &PaymentStore{db: pool},
		Users:            &UserStore{db: pool},
		CustomerAccounts: &CustomerAccountStore{db: pool},
	}
}
