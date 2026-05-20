package http

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/lupon/balon/apps/api/internal/auth"
)

const (
	ctxKeyTenantID = "tenant_id"
	ctxKeyUserID   = "user_id"
	ctxKeyClaims   = "claims"
)

// authMiddleware validates Bearer JWT and extracts tenant/user.
// In dev mode (devAllowHeaders=true and verifier is nil or fails), falls back
// to X-Tenant-ID and X-User-ID headers. This dual mode lets the API run
// without Keycloak during early development.
func authMiddleware(verifier auth.Verifier, devAllowHeaders bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Healthz bypass
		if c.FullPath() == "/healthz" {
			c.Next()
			return
		}

		authHeader := c.GetHeader("Authorization")

		// Try JWT first
		if strings.HasPrefix(authHeader, "Bearer ") && verifier != nil {
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims, err := verifier.Verify(tokenStr)
			if err == nil {
				c.Set(ctxKeyTenantID, claims.TenantID)
				c.Set(ctxKeyUserID, claims.UserID)
				c.Set(ctxKeyClaims, claims)
				c.Next()
				return
			}
			log.Warn().Err(err).Msg("jwt verification failed")
			if !devAllowHeaders {
				c.AbortWithStatusJSON(401, gin.H{"error": "invalid token"})
				return
			}
		}

		// Dev fallback: header-based
		if devAllowHeaders {
			tenantStr := c.GetHeader("X-Tenant-ID")
			if tenantStr == "" {
				c.AbortWithStatusJSON(401, gin.H{"error": "X-Tenant-ID header required (dev mode)"})
				return
			}
			tenantID, err := uuid.Parse(tenantStr)
			if err != nil {
				c.AbortWithStatusJSON(401, gin.H{"error": "invalid tenant id"})
				return
			}
			c.Set(ctxKeyTenantID, tenantID)
			if userStr := c.GetHeader("X-User-ID"); userStr != "" {
				if userID, err := uuid.Parse(userStr); err == nil {
					c.Set(ctxKeyUserID, userID)
				}
			}
			c.Next()
			return
		}

		c.AbortWithStatusJSON(401, gin.H{"error": "authentication required"})
	}
}

func requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Info().
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Int("status", c.Writer.Status()).
			Dur("dur", time.Since(start)).
			Msg("req")
	}
}

func tenantOf(c *gin.Context) uuid.UUID {
	v, _ := c.Get(ctxKeyTenantID)
	return v.(uuid.UUID)
}

func userOf(c *gin.Context) *uuid.UUID {
	v, ok := c.Get(ctxKeyUserID)
	if !ok {
		return nil
	}
	u := v.(uuid.UUID)
	return &u
}

func claimsOf(c *gin.Context) *auth.Claims {
	v, ok := c.Get(ctxKeyClaims)
	if !ok {
		return nil
	}
	return v.(*auth.Claims)
}
