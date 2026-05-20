package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	tokenTTL          = 24 * time.Hour
	tokenTypeAdmin    = "admin"
	tokenTypeCustomer = "customer"
)

// CustomerClaims carries JWT claims for a customer account.
type CustomerClaims struct {
	AccountID uuid.UUID
	Email     string
	Name      string
}

// LocalSigner signs and verifies JWTs using HMAC-SHA256.
// It implements Verifier for admin tokens and handles customer tokens separately.
type LocalSigner struct {
	secret []byte
}

func NewLocalSigner(secret string) *LocalSigner {
	return &LocalSigner{secret: []byte(secret)}
}

// SignAdmin creates a signed JWT for an admin/staff user.
func (s *LocalSigner) SignAdmin(c *Claims) (string, error) {
	now := time.Now()
	roles := c.Roles
	if roles == nil {
		roles = []string{}
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":       c.UserID.String(),
		"tenant_id": c.TenantID.String(),
		"email":     c.Email,
		"name":      c.Name,
		"roles":     roles,
		"type":      tokenTypeAdmin,
		"iat":       now.Unix(),
		"exp":       now.Add(tokenTTL).Unix(),
	})
	return tok.SignedString(s.secret)
}

// SignCustomer creates a signed JWT for a customer account.
func (s *LocalSigner) SignCustomer(c *CustomerClaims) (string, error) {
	now := time.Now()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   c.AccountID.String(),
		"email": c.Email,
		"name":  c.Name,
		"type":  tokenTypeCustomer,
		"iat":   now.Unix(),
		"exp":   now.Add(tokenTTL).Unix(),
	})
	return tok.SignedString(s.secret)
}

// Verify implements auth.Verifier for admin tokens (used by existing middleware).
func (s *LocalSigner) Verify(tokenStr string) (*Claims, error) {
	raw, err := s.parse(tokenStr)
	if err != nil {
		return nil, err
	}
	if typ, _ := raw["type"].(string); typ != tokenTypeAdmin {
		return nil, errors.New("not an admin token")
	}
	return extractClaims(raw)
}

// VerifyCustomer validates a customer JWT and returns CustomerClaims.
func (s *LocalSigner) VerifyCustomer(tokenStr string) (*CustomerClaims, error) {
	raw, err := s.parse(tokenStr)
	if err != nil {
		return nil, err
	}
	if typ, _ := raw["type"].(string); typ != tokenTypeCustomer {
		return nil, errors.New("not a customer token")
	}

	sub, ok := raw["sub"].(string)
	if !ok {
		return nil, errors.New("missing sub claim")
	}
	id, err := uuid.Parse(sub)
	if err != nil {
		return nil, fmt.Errorf("invalid sub: %w", err)
	}
	email, _ := raw["email"].(string)
	name, _ := raw["name"].(string)
	return &CustomerClaims{AccountID: id, Email: email, Name: name}, nil
}

func (s *LocalSigner) parse(tokenStr string) (jwt.MapClaims, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	if !tok.Valid {
		return nil, errors.New("token not valid")
	}
	raw, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("unexpected claims type")
	}
	return raw, nil
}
