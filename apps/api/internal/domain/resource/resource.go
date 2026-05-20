package resource

import (
	"time"

	"github.com/google/uuid"
)

type Kind string

const (
	KindFullPitch Kind = "full_pitch"
	KindHalfPitch Kind = "half_pitch"
	KindCourt     Kind = "court"
	KindOther     Kind = "other"
)

type Resource struct {
	ID        uuid.UUID              `json:"id"`
	TenantID  uuid.UUID              `json:"tenant_id"`
	ParentID  *uuid.UUID             `json:"parent_id,omitempty"`
	Kind      Kind                   `json:"kind"`
	Name      string                 `json:"name"`
	Path      string                 `json:"path"`
	Bookable  bool                   `json:"bookable"`
	Config    map[string]interface{} `json:"config"`
	CreatedAt time.Time              `json:"created_at"`
}

type CreateInput struct {
	TenantID uuid.UUID              `json:"-"`
	ParentID *uuid.UUID             `json:"parent_id,omitempty"`
	Kind     Kind                   `json:"kind" binding:"required"`
	Name     string                 `json:"name" binding:"required"`
	Slug     string                 `json:"slug" binding:"required"`
	Config   map[string]interface{} `json:"config,omitempty"`
}
