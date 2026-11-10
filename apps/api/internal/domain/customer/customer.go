package customer

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotFound    = errors.New("customer not found")
	ErrHasBookings = errors.New("customer has bookings")
)

type Tier string

const (
	TierRegular Tier = "regular"
	TierVIP     Tier = "vip"
)

type Customer struct {
	ID        uuid.UUID `json:"id"`
	TenantID  uuid.UUID `json:"tenant_id"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone,omitempty"`
	Email     string    `json:"email,omitempty"`
	Tier      Tier      `json:"tier"`
	TeamName  string    `json:"team_name,omitempty"`
	Notes     string    `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateInput struct {
	TenantID uuid.UUID `json:"-"`
	Name     string    `json:"name" binding:"required"`
	Phone    string    `json:"phone,omitempty"`
	Email    string    `json:"email,omitempty"`
	Tier     Tier      `json:"tier,omitempty"`
	TeamName string    `json:"team_name,omitempty"`
	Notes    string    `json:"notes,omitempty"`
}

type Team struct {
	ID             uuid.UUID  `json:"id"`
	TenantID       uuid.UUID  `json:"tenant_id"`
	Name           string     `json:"name"`
	CaptainID      *uuid.UUID `json:"captain_id,omitempty"`
	DefaultPayerID *uuid.UUID `json:"default_payer_id,omitempty"`
	PrimaryPhone   string     `json:"primary_phone,omitempty"`
	Notes          string     `json:"notes,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

type UpdateInput struct {
	TenantID uuid.UUID `json:"-"`
	ID       uuid.UUID `json:"-"`
	Name     string    `json:"name"`
	Phone    string    `json:"phone"`
	Email    string    `json:"email"`
	Tier     Tier      `json:"tier"`
	TeamName string    `json:"team_name"`
}

type CreateTeamInput struct {
	TenantID       uuid.UUID  `json:"-"`
	Name           string     `json:"name" binding:"required"`
	CaptainID      *uuid.UUID `json:"captain_id,omitempty"`
	DefaultPayerID *uuid.UUID `json:"default_payer_id,omitempty"`
	PrimaryPhone   string     `json:"primary_phone,omitempty"`
	Notes          string     `json:"notes,omitempty"`
}

type TeamMember struct {
	TeamID     uuid.UUID `json:"team_id"`
	CustomerID uuid.UUID `json:"customer_id"`
	Role       string    `json:"role"`
	JoinedAt   time.Time `json:"joined_at"`
}
