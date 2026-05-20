// Package auth provides JWT-based authentication using Keycloak as the
// identity provider. The Verifier parses bearer tokens, validates them
// against the realm's JWKS endpoint (with caching), and extracts custom
// claims needed by the API — most importantly tenant_id.
package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Claims captures the subset of JWT claims that the API needs from a
// Keycloak access token. tenant_id is a custom claim mapped from a user
// attribute in the Keycloak realm (see infra/keycloak setup).
type Claims struct {
	UserID   uuid.UUID
	TenantID uuid.UUID
	Email    string
	Name     string
	Roles    []string
}

// Verifier validates JWT tokens.
type Verifier interface {
	Verify(token string) (*Claims, error)
}

// NoopVerifier is used in dev mode to skip JWT entirely.
type NoopVerifier struct{}

func (NoopVerifier) Verify(_ string) (*Claims, error) {
	return nil, errors.New("auth disabled (dev mode)")
}

// KeycloakVerifier validates Keycloak-issued JWTs.
type KeycloakVerifier struct {
	jwks   keyfunc.Keyfunc
	issuer string
}

// NewKeycloakVerifier connects to the JWKS endpoint of the given realm.
// jwksURL is typically https://<keycloak>/realms/<realm>/protocol/openid-connect/certs
// expectedIssuer is typically https://<keycloak>/realms/<realm>
func NewKeycloakVerifier(ctx context.Context, jwksURL, expectedIssuer string) (*KeycloakVerifier, error) {
	jwks, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("fetch jwks from %s: %w", jwksURL, err)
	}
	return &KeycloakVerifier{jwks: jwks, issuer: expectedIssuer}, nil
}

// Verify parses and validates the JWT. Returns extracted Claims or error.
func (v *KeycloakVerifier) Verify(tokenStr string) (*Claims, error) {
	token, err := jwt.Parse(tokenStr, v.jwks.Keyfunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(v.issuer),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	if !token.Valid {
		return nil, errors.New("token not valid")
	}

	rawClaims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("unexpected claims type")
	}

	return extractClaims(rawClaims)
}

func extractClaims(c jwt.MapClaims) (*Claims, error) {
	out := &Claims{}

	if sub, ok := c["sub"].(string); ok {
		uid, err := uuid.Parse(sub)
		if err != nil {
			return nil, fmt.Errorf("invalid sub claim: %w", err)
		}
		out.UserID = uid
	} else {
		return nil, errors.New("missing sub claim")
	}

	// Custom claim: tenant_id (mapped from user attribute in Keycloak)
	if t, ok := c["tenant_id"].(string); ok && t != "" {
		tid, err := uuid.Parse(t)
		if err != nil {
			return nil, fmt.Errorf("invalid tenant_id claim: %w", err)
		}
		out.TenantID = tid
	} else {
		return nil, errors.New("missing tenant_id claim (configure protocol mapper in Keycloak)")
	}

	if email, ok := c["email"].(string); ok {
		out.Email = email
	}
	if name, ok := c["name"].(string); ok {
		out.Name = name
	}

	// Realm roles are nested under realm_access.roles
	if ra, ok := c["realm_access"].(map[string]interface{}); ok {
		if rolesAny, ok := ra["roles"].([]interface{}); ok {
			for _, r := range rolesAny {
				if s, ok := r.(string); ok {
					out.Roles = append(out.Roles, s)
				}
			}
		}
	}

	return out, nil
}

// HasRole reports whether the claim set includes the named realm role.
func (c *Claims) HasRole(role string) bool {
	for _, r := range c.Roles {
		if r == role {
			return true
		}
	}
	return false
}
