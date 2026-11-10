package http

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/lupon/balon/apps/api/internal/auth"
	"github.com/lupon/balon/apps/api/internal/domain/booking"
	"github.com/lupon/balon/apps/api/internal/domain/customer"
	"github.com/lupon/balon/apps/api/internal/domain/payment"
	"github.com/lupon/balon/apps/api/internal/domain/pricing"
	"github.com/lupon/balon/apps/api/internal/domain/resource"
	"github.com/lupon/balon/apps/api/internal/domain/shift"
	"github.com/lupon/balon/apps/api/internal/email"
	"github.com/lupon/balon/apps/api/internal/store"
)

type handlers struct {
	stores *store.Stores
	signer *auth.LocalSigner
	mailer *email.Mailer
}

// ---------- Resources ----------

func (h *handlers) createResource(c *gin.Context) {
	var in resource.CreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.TenantID = tenantOf(c)
	r, err := h.stores.Resources.Create(c.Request.Context(), in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, r)
}

func (h *handlers) listResources(c *gin.Context) {
	rs, err := h.stores.Resources.ListByTenant(c.Request.Context(), tenantOf(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rs})
}

func (h *handlers) getResource(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	r, err := h.stores.Resources.Get(c.Request.Context(), tenantOf(c), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, r)
}

// ---------- Customers ----------

func (h *handlers) createCustomer(c *gin.Context) {
	var in customer.CreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.TenantID = tenantOf(c)
	cu, err := h.stores.Customers.Create(c.Request.Context(), in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cu)
}

func (h *handlers) searchCustomers(c *gin.Context) {
	q := c.Query("q")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	cs, err := h.stores.Customers.Search(c.Request.Context(), tenantOf(c), q, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cs})
}

func (h *handlers) getCustomer(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	cu, err := h.stores.Customers.Get(c.Request.Context(), tenantOf(c), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cu == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, cu)
}

func (h *handlers) deleteCustomer(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	tenantID := tenantOf(c)

	if c.Query("force") == "true" {
		if err := h.stores.Customers.ForceDelete(c.Request.Context(), tenantID, id); err != nil {
			if errors.Is(err, customer.ErrNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
		return
	}

	if err := h.stores.Customers.Delete(c.Request.Context(), tenantID, id); err != nil {
		if errors.Is(err, customer.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if errors.Is(err, customer.ErrHasBookings) {
			c.JSON(http.StatusConflict, gin.H{"error": "has_bookings"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *handlers) updateCustomer(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var in customer.UpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.TenantID = tenantOf(c)
	in.ID = id
	cu, err := h.stores.Customers.Update(c.Request.Context(), in)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cu == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, cu)
}

// ---------- Teams ----------

func (h *handlers) createTeam(c *gin.Context) {
	var in customer.CreateTeamInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.TenantID = tenantOf(c)
	t, err := h.stores.Teams.Create(c.Request.Context(), in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, t)
}

func (h *handlers) getTeam(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	t, err := h.stores.Teams.Get(c.Request.Context(), tenantOf(c), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *handlers) addTeamMember(c *gin.Context) {
	teamID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		CustomerID uuid.UUID `json:"customer_id" binding:"required"`
		Role       string    `json:"role,omitempty"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	if err := h.stores.Teams.AddMember(c.Request.Context(), teamID, body.CustomerID, body.Role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// ---------- Bookings ----------

func (h *handlers) createBooking(c *gin.Context) {
	var in booking.CreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.TenantID = tenantOf(c)
	in.CreatedBy = userOf(c)
	if err := in.Validate(); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	b, err := h.stores.Bookings.Create(c.Request.Context(), in)
	if err != nil {
		if errors.Is(err, booking.ErrSlotConflict) {
			c.JSON(http.StatusConflict, gin.H{
				"error":       "slot_conflict",
				"description": "resource (or its parent/child) already booked for that time range",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, b)

	if b.CustomerID != nil {
		go h.sendBookingEmail(b)
	}
}

func (h *handlers) listAllBookings(c *gin.Context) {
	var from, to time.Time
	if s := c.Query("from"); s != "" {
		from, _ = time.Parse(time.RFC3339, s)
	}
	if s := c.Query("to"); s != "" {
		to, _ = time.Parse(time.RFC3339, s)
	}
	var statuses []string
	if s := c.Query("status"); s != "" {
		statuses = []string{s}
	}
	bs, err := h.stores.Bookings.ListAll(c.Request.Context(), tenantOf(c), from, to, statuses)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": bs})
}

func (h *handlers) listBookings(c *gin.Context) {
	resourceID, err := uuid.Parse(c.Query("resource_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "resource_id required"})
		return
	}
	from, err := time.Parse(time.RFC3339, c.Query("from"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from (RFC3339) required"})
		return
	}
	to, err := time.Parse(time.RFC3339, c.Query("to"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "to (RFC3339) required"})
		return
	}
	includeChildren := c.Query("include_children") == "true"

	bs, err := h.stores.Bookings.ListInWindow(c.Request.Context(), tenantOf(c), resourceID, from, to, includeChildren)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": bs})
}

func (h *handlers) getBooking(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	b, err := h.stores.Bookings.Get(c.Request.Context(), tenantOf(c), id)
	if errors.Is(err, booking.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, b)
}

func (h *handlers) rescheduleBooking(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var in booking.RescheduleInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.BookingID = id
	in.TenantID = tenantOf(c)
	b, err := h.stores.Bookings.Reschedule(c.Request.Context(), in)
	if errors.Is(err, booking.ErrSlotConflict) {
		c.JSON(http.StatusConflict, gin.H{"error": "slot_conflict"})
		return
	}
	if errors.Is(err, booking.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, b)
}

func (h *handlers) cancelBooking(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	reason := c.Query("reason")
	if err := h.stores.Bookings.Cancel(c.Request.Context(), tenantOf(c), id, reason); err != nil {
		if errors.Is(err, booking.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *handlers) noShowBooking(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.stores.Bookings.MarkNoShow(c.Request.Context(), tenantOf(c), id); err != nil {
		if errors.Is(err, booking.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// ---------- Series ----------

func (h *handlers) createSeries(c *gin.Context) {
	var in booking.CreateSeriesInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.TenantID = tenantOf(c)
	if err := in.Validate(); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	s, err := h.stores.Series.Create(c.Request.Context(), in)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, s)
}

// ---------- Pricing ----------

func (h *handlers) priceQuote(c *gin.Context) {
	var req pricing.QuoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	req.TenantID = tenantOf(c)

	rules, err := h.stores.Pricing.ActiveRules(c.Request.Context(), req.TenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	res, err := h.stores.Resources.Get(c.Request.Context(), req.TenantID, req.ResourceID)
	if err == nil && res != nil {
		req.ResourceKind = string(res.Kind)
	}
	if req.CustomerID != nil {
		cu, _ := h.stores.Customers.Get(c.Request.Context(), req.TenantID, *req.CustomerID)
		if cu != nil {
			req.CustomerTier = string(cu.Tier)
		}
	}

	tz, _ := time.LoadLocation("Europe/Sarajevo") // TODO: tenant TZ
	engine := pricing.NewEngine(rules, tz, nil)
	q, err := engine.Quote(req)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, q)
}

func (h *handlers) listPricingRules(c *gin.Context) {
	includeInactive := c.Query("include_inactive") == "true"
	var (
		rs  []pricing.Rule
		err error
	)
	if includeInactive {
		rs, err = h.stores.Pricing.AllRules(c.Request.Context(), tenantOf(c))
	} else {
		rs, err = h.stores.Pricing.ActiveRules(c.Request.Context(), tenantOf(c))
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rs})
}

func (h *handlers) createPricingRule(c *gin.Context) {
	var r pricing.Rule
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	r.TenantID = tenantOf(c)
	if !r.Active {
		r.Active = true
	}
	created, err := h.stores.Pricing.CreateRule(c.Request.Context(), r)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

func (h *handlers) updatePricingRule(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var patch pricing.RuleUpdate
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.stores.Pricing.UpdateRule(c.Request.Context(), tenantOf(c), id, patch)
	if errors.Is(err, store.ErrPricingRuleNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *handlers) deletePricingRule(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.stores.Pricing.DeleteRule(c.Request.Context(), tenantOf(c), id); err != nil {
		if errors.Is(err, store.ErrPricingRuleNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// ---------- Shifts & Payments ----------

func (h *handlers) listShifts(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	sessions, err := h.stores.Shifts.List(c.Request.Context(), tenantOf(c), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": sessions})
}

func (h *handlers) openShift(c *gin.Context) {
	var in shift.OpenInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.TenantID = tenantOf(c)
	if u := userOf(c); u != nil {
		in.OperatorID = *u
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "X-User-ID required"})
		return
	}
	s, err := h.stores.Shifts.Open(c.Request.Context(), in)
	if errors.Is(err, shift.ErrAnotherShiftOpen) {
		c.JSON(http.StatusConflict, gin.H{"error": "another shift is already open"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, s)
}

func (h *handlers) getOpenShift(c *gin.Context) {
	s, err := h.stores.Shifts.GetOpen(c.Request.Context(), tenantOf(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if s == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no open shift"})
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *handlers) closeShift(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var in shift.CloseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.ShiftID = id
	in.TenantID = tenantOf(c)
	s, err := h.stores.Shifts.Close(c.Request.Context(), in)
	if errors.Is(err, shift.ErrVarianceUnexplained) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "variance != 0 requires explanation"})
		return
	}
	if errors.Is(err, shift.ErrShiftNotOpen) {
		c.JSON(http.StatusConflict, gin.H{"error": "shift not in opened state"})
		return
	}
	if errors.Is(err, shift.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *handlers) recordPayment(c *gin.Context) {
	shiftID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var in payment.RecordInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.TenantID = tenantOf(c)
	in.ShiftSessionID = shiftID
	in.CollectedBy = userOf(c)
	p, err := h.stores.Payments.Record(c.Request.Context(), in)
	if errors.Is(err, payment.ErrShiftNotActive) {
		c.JSON(http.StatusConflict, gin.H{"error": "shift not active"})
		return
	}
	if errors.Is(err, shift.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "shift not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, p)
}

func (h *handlers) listBookingPayments(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ps, err := h.stores.Payments.ListForBooking(c.Request.Context(), tenantOf(c), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": ps})
}

func (h *handlers) voidPayment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	if err := h.stores.Payments.Void(c.Request.Context(), tenantOf(c), id, body.Reason); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *handlers) recordCashMovement(c *gin.Context) {
	shiftID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var in payment.CashMovementInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	in.TenantID = tenantOf(c)
	in.ShiftSessionID = shiftID
	in.RecordedBy = userOf(c)
	m, err := h.stores.Payments.RecordCashMovement(c.Request.Context(), in)
	if errors.Is(err, payment.ErrShiftNotActive) {
		c.JSON(http.StatusConflict, gin.H{"error": "shift not active"})
		return
	}
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, m)
}

func (h *handlers) sendBookingEmail(b *booking.Booking) {
	ctx := context.Background()

	cust, err := h.stores.Customers.Get(ctx, b.TenantID, *b.CustomerID)
	if err != nil {
		log.Error().Err(err).Str("booking_id", b.ID.String()).Msg("booking email: failed to fetch customer")
		return
	}
	if cust == nil || cust.Email == "" {
		log.Warn().Str("booking_id", b.ID.String()).Msg("booking email: customer has no email, skipping")
		return
	}

	res, err := h.stores.Resources.Get(ctx, b.TenantID, b.ResourceID)
	if err != nil || res == nil {
		log.Error().Err(err).Str("booking_id", b.ID.String()).Msg("booking email: failed to fetch resource")
		return
	}

	tenant, err := h.stores.Tenants.Get(ctx, b.TenantID)
	if err != nil || tenant == nil {
		log.Error().Err(err).Str("booking_id", b.ID.String()).Msg("booking email: failed to fetch tenant")
		return
	}

	d := email.BookingEmailData{
		CustomerName:      cust.Name,
		CustomerEmail:     cust.Email,
		ResourceName:      res.Name,
		TenantName:        tenant.Name,
		Timezone:          tenant.Timezone,
		StartAt:           b.StartAt,
		EndAt:             b.EndAt,
		PriceCents:        b.PriceCents,
		PaymentPreference: b.PaymentPreference,
	}
	if err := h.mailer.SendBookingConfirmation(d); err != nil {
		log.Error().Err(err).Str("booking_id", b.ID.String()).Msg("booking email: send failed")
	} else {
		log.Info().Str("to", cust.Email).Str("booking_id", b.ID.String()).Msg("booking email sent")
	}
}
