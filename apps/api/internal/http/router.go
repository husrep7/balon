package http

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/lupon/balon/apps/api/internal/auth"
	"github.com/lupon/balon/apps/api/internal/email"
	"github.com/lupon/balon/apps/api/internal/store"
)

type RouterDeps struct {
	Stores             *store.Stores
	Verifier           auth.Verifier
	Signer             *auth.LocalSigner
	Mailer             *email.Mailer
	GoogleClientID     string
	GoogleClientSecret string
	APIBaseURL         string
	AppURL             string
	DevAllowHeaders    bool
	CORSOrigins        []string // allowed CORS origins; empty = no CORS headers
}

func NewRouter(d RouterDeps) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery(), requestLogger())

	if len(d.CORSOrigins) > 0 {
		originSet := make(map[string]struct{}, len(d.CORSOrigins))
		for _, o := range d.CORSOrigins {
			originSet[strings.TrimSpace(o)] = struct{}{}
		}
		r.Use(func(c *gin.Context) {
			origin := c.GetHeader("Origin")
			if _, ok := originSet[origin]; ok {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
				c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Tenant-ID,X-User-ID")
				c.Header("Access-Control-Max-Age", "86400")
			}
			if c.Request.Method == "OPTIONS" {
				c.AbortWithStatus(http.StatusNoContent)
				return
			}
			c.Next()
		})
	}

	h := &handlers{stores: d.Stores, signer: d.Signer, mailer: d.Mailer}

	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	// Google OAuth (optional)
	if d.Signer != nil {
		registerGoogleAuth(r, d.GoogleClientID, d.GoogleClientSecret, d.APIBaseURL, d.AppURL, d.Stores, d.Signer)
	}

	// ---------- Auth (public) ----------
	authGroup := r.Group("/api/auth")
	{
		authGroup.POST("/login", h.login)
		authGroup.POST("/customer/register", h.customerRegister)
		authGroup.POST("/customer/login", h.customerLogin)
	}

	// ---------- Public booking API (no auth) ----------
	pub := r.Group("/api/public/tenants/:slug")
	{
		pub.GET("", h.publicGetTenant)
		pub.GET("/resources", h.publicListResources)
		pub.GET("/availability", h.publicAvailability)
		pub.GET("/pricing-quote", h.publicPricingQuote)
	}

	// ---------- Customer booking API (customer JWT) ----------
	if d.Signer != nil {
		custAuth := customerAuthMiddleware(d.Signer)

		// Account-level (not tenant-scoped)
		custAccount := r.Group("/api/customer")
		custAccount.Use(custAuth)
		{
			custAccount.GET("/me", h.customerMe)
			custAccount.PATCH("/me", h.updateCustomerMe)
			custAccount.POST("/change-password", h.customerChangePassword)
		}

		// Tenant-scoped booking routes
		cust := r.Group("/api/customer/tenants/:slug")
		cust.Use(custAuth)
		{
			cust.POST("/bookings", h.customerCreateBooking)
			cust.GET("/bookings", h.customerListBookings)
			cust.DELETE("/bookings/:id", h.customerCancelBooking)
			cust.PATCH("/bookings/:id", h.customerRescheduleBooking)
		}
	}

	// ---------- Admin API (Keycloak or local JWT or dev headers) ----------
	v1 := r.Group("/api/v1")
	v1.Use(authMiddleware(d.Verifier, d.DevAllowHeaders))
	{
		v1.GET("/auth/me", h.adminMe)

		v1.GET("/resources", h.listResources)
		v1.POST("/resources", h.createResource)
		v1.GET("/resources/:id", h.getResource)

		v1.GET("/customers", h.searchCustomers)
		v1.POST("/customers", h.createCustomer)
		v1.GET("/customers/:id", h.getCustomer)
		v1.PATCH("/customers/:id", h.updateCustomer)
		v1.DELETE("/customers/:id", h.deleteCustomer)

		v1.POST("/teams", h.createTeam)
		v1.GET("/teams/:id", h.getTeam)
		v1.POST("/teams/:id/members", h.addTeamMember)

		v1.GET("/bookings/all", h.listAllBookings)
		v1.GET("/bookings", h.listBookings)
		v1.POST("/bookings", h.createBooking)
		v1.GET("/bookings/:id", h.getBooking)
		v1.PATCH("/bookings/:id", h.rescheduleBooking)
		v1.DELETE("/bookings/:id", h.cancelBooking)
		v1.POST("/bookings/:id/no-show", h.noShowBooking)
		v1.GET("/bookings/:id/payments", h.listBookingPayments)

		v1.POST("/series", h.createSeries)

		v1.POST("/pricing/quote", h.priceQuote)
		v1.GET("/pricing/rules", h.listPricingRules)
		v1.POST("/pricing/rules", h.createPricingRule)
		v1.PATCH("/pricing/rules/:id", h.updatePricingRule)
		v1.DELETE("/pricing/rules/:id", h.deletePricingRule)

		v1.GET("/shifts", h.listShifts)
		v1.POST("/shifts", h.openShift)
		v1.GET("/shifts/open", h.getOpenShift)
		v1.POST("/shifts/:id/close", h.closeShift)
		v1.POST("/shifts/:id/payments", h.recordPayment)
		v1.POST("/shifts/:id/movements", h.recordCashMovement)

		v1.POST("/payments/:id/void", h.voidPayment)
	}

	return r
}
