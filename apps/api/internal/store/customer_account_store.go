package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/lupon/balon/apps/api/internal/db"
)

var ErrEmailTaken = errors.New("email already registered")

type CustomerAccount struct {
	ID    uuid.UUID
	Email string
	Name  string
	Phone string
}

type CustomerAccountStore struct {
	db *pgxpool.Pool
}

func (s *CustomerAccountStore) Register(ctx context.Context, email, password, name, phone string) (*CustomerAccount, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}
	var acc CustomerAccount
	err = s.db.QueryRow(ctx, `
		INSERT INTO customer_accounts (email, password_hash, name, phone)
		VALUES (lower($1), $2, $3, NULLIF($4, ''))
		RETURNING id, email, name, COALESCE(phone, '')
	`, email, hash, name, phone).Scan(&acc.ID, &acc.Email, &acc.Name, &acc.Phone)
	if err != nil {
		if db.IsUniqueViolation(err) {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return &acc, nil
}

func (s *CustomerAccountStore) GetByID(ctx context.Context, id uuid.UUID) (*CustomerAccount, error) {
	var acc CustomerAccount
	err := s.db.QueryRow(ctx, `
		SELECT id, email, name, COALESCE(phone, '') FROM customer_accounts WHERE id = $1
	`, id).Scan(&acc.ID, &acc.Email, &acc.Name, &acc.Phone)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &acc, err
}

func (s *CustomerAccountStore) UpdateProfile(ctx context.Context, id uuid.UUID, name, phone string) (*CustomerAccount, error) {
	var acc CustomerAccount
	err := s.db.QueryRow(ctx, `
		UPDATE customer_accounts SET name = $2, phone = NULLIF($3, '')
		WHERE id = $1
		RETURNING id, email, name, COALESCE(phone, '')
	`, id, name, phone).Scan(&acc.ID, &acc.Email, &acc.Name, &acc.Phone)
	return &acc, err
}

func (s *CustomerAccountStore) ChangePassword(ctx context.Context, id uuid.UUID, currentPassword, newPassword string) error {
	var hash string
	err := s.db.QueryRow(ctx, `SELECT password_hash FROM customer_accounts WHERE id = $1`, id).Scan(&hash)
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(currentPassword)); err != nil {
		return ErrInvalidCredentials
	}
	newHash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `UPDATE customer_accounts SET password_hash = $2 WHERE id = $1`, id, newHash)
	return err
}

// FindOrCreateGoogle finds or creates a customer account for Google SSO users.
// Google accounts have no password_hash — they log in only via Google.
func (s *CustomerAccountStore) FindOrCreateGoogle(ctx context.Context, email, name string) (*CustomerAccount, error) {
	var acc CustomerAccount
	err := s.db.QueryRow(ctx, `
		SELECT id, email, name, COALESCE(phone,'') FROM customer_accounts WHERE lower(email) = lower($1)
	`, email).Scan(&acc.ID, &acc.Email, &acc.Name, &acc.Phone)
	if err == nil {
		return &acc, nil
	}
	// Kreiraj novi nalog bez lozinke (Google-only)
	err = s.db.QueryRow(ctx, `
		INSERT INTO customer_accounts (email, password_hash, name)
		VALUES (lower($1), '', $2)
		RETURNING id, email, name, COALESCE(phone,'')
	`, email, name).Scan(&acc.ID, &acc.Email, &acc.Name, &acc.Phone)
	if err != nil {
		if db.IsUniqueViolation(err) {
			// Race condition — dohvati postojeći
			s.db.QueryRow(ctx, `SELECT id, email, name, COALESCE(phone,'') FROM customer_accounts WHERE lower(email)=lower($1)`, email).
				Scan(&acc.ID, &acc.Email, &acc.Name, &acc.Phone)
			return &acc, nil
		}
		return nil, err
	}
	return &acc, nil
}

func (s *CustomerAccountStore) Authenticate(ctx context.Context, email, password string) (*CustomerAccount, error) {
	var acc CustomerAccount
	var hash string
	err := s.db.QueryRow(ctx, `
		SELECT id, email, name, COALESCE(phone, ''), password_hash
		FROM customer_accounts WHERE lower(email) = lower($1)
	`, email).Scan(&acc.ID, &acc.Email, &acc.Name, &acc.Phone, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}
	return &acc, nil
}
