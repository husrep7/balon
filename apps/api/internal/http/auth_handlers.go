package http

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	domainPricing "github.com/lupon/balon/apps/api/internal/domain/pricing"

	"github.com/lupon/balon/apps/api/internal/auth"
	"github.com/lupon/balon/apps/api/internal/domain/booking"
	"github.com/lupon/balon/apps/api/internal/email"
	"github.com/lupon/balon/apps/api/internal/store"
)

// ---------- Admin auth ----------

type loginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *handlers) login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	u, err := h.stores.Users.Authenticate(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, store.ErrInvalidCredentials) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "pogrešan email ili lozinka"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "greška pri prijavi"})
		return
	}

	token, err := h.signer.SignAdmin(&auth.Claims{
		UserID:   u.ID,
		TenantID: u.TenantID,
		Email:    u.Email,
		Name:     u.Name,
		Roles:    []string{u.Role},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "greška pri generisanju tokena"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":        u.ID,
			"tenant_id": u.TenantID,
			"email":     u.Email,
			"name":      u.Name,
			"role":      u.Role,
		},
	})
}

func (h *handlers) adminMe(c *gin.Context) {
	claims := claimsOf(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":        claims.UserID,
		"tenant_id": claims.TenantID,
		"email":     claims.Email,
		"name":      claims.Name,
		"roles":     claims.Roles,
	})
}

// ---------- Customer auth ----------

type customerRegisterRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required,min=8"`
	Name     string `json:"name" binding:"required"`
	Phone    string `json:"phone" binding:"required"`
}

type customerLoginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *handlers) customerRegister(c *gin.Context) {
	var req customerRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	acc, err := h.stores.CustomerAccounts.Register(c.Request.Context(), req.Email, req.Password, req.Name, req.Phone)
	if err != nil {
		if errors.Is(err, store.ErrEmailTaken) {
			c.JSON(http.StatusConflict, gin.H{"error": "email već registrovan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "greška pri registraciji"})
		return
	}

	token, err := h.signer.SignCustomer(&auth.CustomerClaims{
		AccountID: acc.ID,
		Email:     acc.Email,
		Name:      acc.Name,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "greška pri generisanju tokena"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token": token,
		"user": gin.H{
			"id":    acc.ID,
			"email": acc.Email,
			"name":  acc.Name,
			"phone": acc.Phone,
		},
	})
}

func (h *handlers) customerLogin(c *gin.Context) {
	var req customerLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	acc, err := h.stores.CustomerAccounts.Authenticate(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, store.ErrInvalidCredentials) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "pogrešan email ili lozinka"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "greška pri prijavi"})
		return
	}

	token, err := h.signer.SignCustomer(&auth.CustomerClaims{
		AccountID: acc.ID,
		Email:     acc.Email,
		Name:      acc.Name,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "greška pri generisanju tokena"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":    acc.ID,
			"email": acc.Email,
			"name":  acc.Name,
			"phone": acc.Phone,
		},
	})
}

func (h *handlers) customerMe(c *gin.Context) {
	claims := customerClaimsOf(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":    claims.AccountID,
		"email": claims.Email,
		"name":  claims.Name,
	})
}

// ---------- Public booking endpoints ----------

func (h *handlers) publicPricingQuote(c *gin.Context) {
	slug := c.Param("slug")
	t, err := h.stores.Tenants.GetBySlug(c.Request.Context(), slug)
	if err != nil || t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	resourceID, err := uuid.Parse(c.Query("resource_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid resource_id"})
		return
	}
	startAt, err := time.Parse(time.RFC3339, c.Query("start_at"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_at"})
		return
	}
	endAt, err := time.Parse(time.RFC3339, c.Query("end_at"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_at"})
		return
	}
	price := calcPrice(c.Request.Context(), h, t.ID, resourceID, startAt, endAt)
	if price == nil {
		c.JSON(http.StatusOK, gin.H{"price_cents": 0})
		return
	}
	c.JSON(http.StatusOK, gin.H{"price_cents": *price})
}

func (h *handlers) publicGetTenant(c *gin.Context) {
	slug := c.Param("slug")
	t, err := h.stores.Tenants.GetBySlug(c.Request.Context(), slug)
	if err != nil || t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":       t.ID,
		"slug":     t.Slug,
		"name":     t.Name,
		"timezone": t.Timezone,
		"currency": t.Currency,
	})
}

func (h *handlers) publicListResources(c *gin.Context) {
	slug := c.Param("slug")
	t, err := h.stores.Tenants.GetBySlug(c.Request.Context(), slug)
	if err != nil || t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	rs, err := h.stores.Resources.ListByTenant(c.Request.Context(), t.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rs})
}

func (h *handlers) publicAvailability(c *gin.Context) {
	slug := c.Param("slug")
	t, err := h.stores.Tenants.GetBySlug(c.Request.Context(), slug)
	if err != nil || t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}

	resourceID, err := uuid.Parse(c.Query("resource_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid resource_id"})
		return
	}

	from, err := time.Parse(time.RFC3339, c.Query("from"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid from (use RFC3339)"})
		return
	}
	to, err := time.Parse(time.RFC3339, c.Query("to"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid to (use RFC3339)"})
		return
	}

	bookings, err := h.stores.Bookings.ListInWindow(c.Request.Context(), t.ID, resourceID, from, to, false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": bookings})
}

// ---------- Customer booking endpoints ----------

func (h *handlers) customerCreateBooking(c *gin.Context) {
	claims := customerClaimsOf(c)

	slug := c.Param("slug")
	t, err := h.stores.Tenants.GetBySlug(c.Request.Context(), slug)
	if err != nil || t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}

	var in struct {
		ResourceID        string `json:"resource_id" binding:"required"`
		StartAt           string `json:"start_at" binding:"required"`
		EndAt             string `json:"end_at" binding:"required"`
		Notes             string `json:"notes"`
		PaymentPreference string `json:"payment_preference"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	resID, err := uuid.Parse(in.ResourceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid resource_id"})
		return
	}
	startAt, err := time.Parse(time.RFC3339, in.StartAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_at"})
		return
	}
	endAt, err := time.Parse(time.RFC3339, in.EndAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_at"})
		return
	}

	// Auto-create or find customer record for this tenant+email
	customer, err := h.stores.Customers.FindOrCreateByEmail(
		c.Request.Context(), t.ID, claims.Email, claims.Name,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "greška pri pronalaženju kupca"})
		return
	}

	price := calcPrice(c.Request.Context(), h, t.ID, resID, startAt, endAt)
	var priceCents *int64
	if price != nil {
		priceCents = price
	}

	b, err := h.stores.Bookings.Create(c.Request.Context(), booking.CreateInput{
		TenantID:          t.ID,
		ResourceID:        resID,
		CustomerID:        &customer.ID,
		StartAt:           startAt,
		EndAt:             endAt,
		Channel:           "online",
		Notes:             in.Notes,
		PriceCents:        priceCents,
		PaymentPreference: in.PaymentPreference,
	})
	if err != nil {
		if errors.Is(err, booking.ErrSlotConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": "termin je već zauzet"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Pošalji email potvrdu / račun — uvijek čitamo svježi email iz baze
	if h.mailer != nil {
		resourceName := ""
		if res, _ := h.stores.Resources.Get(c.Request.Context(), t.ID, resID); res != nil {
			resourceName = res.Name
		}
		priceCentsVal := int64(0)
		if priceCents != nil {
			priceCentsVal = *priceCents
		}

		// Svježi podaci iz baze (ne stari JWT)
		customerName := claims.Name
		customerEmail := claims.Email
		if acc, err := h.stores.CustomerAccounts.GetByID(c.Request.Context(), claims.AccountID); err == nil && acc != nil {
			customerName = acc.Name
			customerEmail = acc.Email
		}

		data := email.BookingEmailData{
			CustomerName:      customerName,
			CustomerEmail:     customerEmail,
			ResourceName:      resourceName,
			TenantName:        t.Name,
			Timezone:          t.Timezone,
			StartAt:           startAt,
			EndAt:             endAt,
			PriceCents:        priceCentsVal,
			PaymentPreference: in.PaymentPreference,
		}
		go func() {
			if err := h.mailer.SendBookingConfirmation(data); err != nil {
				log.Error().Err(err).Str("to", data.CustomerEmail).Msg("email send failed")
			} else {
				log.Info().Str("to", data.CustomerEmail).Msg("booking email sent")
			}
		}()
	}

	c.JSON(http.StatusCreated, b)
}

func (h *handlers) customerListBookings(c *gin.Context) {
	claims := customerClaimsOf(c)

	slug := c.Param("slug")
	t, err := h.stores.Tenants.GetBySlug(c.Request.Context(), slug)
	if err != nil || t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}

	customer, err := h.stores.Customers.FindByEmail(c.Request.Context(), t.ID, claims.Email)
	if err != nil || customer == nil {
		c.JSON(http.StatusOK, gin.H{"data": []interface{}{}})
		return
	}

	bookings, err := h.stores.Bookings.ListByCustomer(c.Request.Context(), t.ID, customer.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": bookings})
}

func (h *handlers) customerRescheduleBooking(c *gin.Context) {
	claims := customerClaimsOf(c)

	slug := c.Param("slug")
	t, err := h.stores.Tenants.GetBySlug(c.Request.Context(), slug)
	if err != nil || t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	bookingID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var in struct {
		StartAt string `json:"start_at" binding:"required"`
		EndAt   string `json:"end_at" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	startAt, err := time.Parse(time.RFC3339, in.StartAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_at"})
		return
	}
	endAt, err := time.Parse(time.RFC3339, in.EndAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_at"})
		return
	}

	// Verify booking belongs to this customer
	customer, err := h.stores.Customers.FindByEmail(c.Request.Context(), t.ID, claims.Email)
	if err != nil || customer == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	existing, err := h.stores.Bookings.Get(c.Request.Context(), t.ID, bookingID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if existing.CustomerID == nil || *existing.CustomerID != customer.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	newPrice := calcPrice(c.Request.Context(), h, t.ID, existing.ResourceID, startAt, endAt)

	b, err := h.stores.Bookings.Reschedule(c.Request.Context(), booking.RescheduleInput{
		TenantID:   t.ID,
		BookingID:  bookingID,
		StartAt:    &startAt,
		EndAt:      &endAt,
		PriceCents: newPrice,
	})
	if err != nil {
		if errors.Is(err, booking.ErrSlotConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": "termin je zauzet"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, b)
}

func (h *handlers) updateCustomerMe(c *gin.Context) {
	claims := customerClaimsOf(c)
	var in struct {
		Name  string `json:"name" binding:"required"`
		Phone string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	acc, err := h.stores.CustomerAccounts.UpdateProfile(c.Request.Context(), claims.AccountID, in.Name, in.Phone)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": acc.ID, "email": acc.Email, "name": acc.Name, "phone": acc.Phone})
}

func (h *handlers) customerChangePassword(c *gin.Context) {
	claims := customerClaimsOf(c)
	var in struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required,min=8"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	if err := h.stores.CustomerAccounts.ChangePassword(
		c.Request.Context(), claims.AccountID, in.CurrentPassword, in.NewPassword,
	); err != nil {
		if errors.Is(err, store.ErrInvalidCredentials) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "trenutna lozinka nije ispravna"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *handlers) customerCancelBooking(c *gin.Context) {
	claims := customerClaimsOf(c)

	slug := c.Param("slug")
	t, err := h.stores.Tenants.GetBySlug(c.Request.Context(), slug)
	if err != nil || t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}

	bookingID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	// Verify booking belongs to this customer
	customer, err := h.stores.Customers.FindByEmail(c.Request.Context(), t.ID, claims.Email)
	if err != nil || customer == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	if err := h.stores.Bookings.CancelForCustomer(c.Request.Context(), t.ID, bookingID, customer.ID, "customer_cancel"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// calcPrice returns the price for a booking using active pricing rules.
// Returns nil if pricing cannot be determined (non-fatal).
func calcPrice(ctx context.Context, h *handlers, tenantID, resourceID uuid.UUID, startAt, endAt time.Time) *int64 {
	rules, err := h.stores.Pricing.ActiveRules(ctx, tenantID)
	if err != nil || len(rules) == 0 {
		return nil
	}
	kind := ""
	if res, _ := h.stores.Resources.Get(ctx, tenantID, resourceID); res != nil {
		kind = string(res.Kind)
	}
	tz, _ := time.LoadLocation("Europe/Sarajevo")
	engine := domainPricing.NewEngine(rules, tz, nil)
	q, err := engine.Quote(domainPricing.QuoteRequest{
		TenantID:     tenantID,
		ResourceID:   resourceID,
		ResourceKind: kind,
		StartAt:      startAt,
		EndAt:        endAt,
	})
	if err != nil {
		return nil
	}
	cents := q.FinalCents
	return &cents
}

// ---------- Context helpers ----------

const ctxKeyCustomerClaims = "customer_claims"

func customerClaimsOf(c *gin.Context) *auth.CustomerClaims {
	v, ok := c.Get(ctxKeyCustomerClaims)
	if !ok {
		return nil
	}
	return v.(*auth.CustomerClaims)
}

// customerAuthMiddleware validates customer JWTs.
func customerAuthMiddleware(signer *auth.LocalSigner) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := signer.VerifyCustomer(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(ctxKeyCustomerClaims, claims)
		c.Next()
	}
}
