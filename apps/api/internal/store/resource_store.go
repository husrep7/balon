package store

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lupon/balon/apps/api/internal/domain/resource"
)

type ResourceStore struct {
	db *pgxpool.Pool
}

var ltreeSafe = regexp.MustCompile(`^[a-z0-9_]+$`)

// Create inserts a new resource. The slug becomes the leaf of the ltree path.
// If parent_id is given, the new path is parent.path + '.' + slug.
func (s *ResourceStore) Create(ctx context.Context, in resource.CreateInput) (*resource.Resource, error) {
	slug := strings.ToLower(in.Slug)
	if !ltreeSafe.MatchString(slug) {
		return nil, fmt.Errorf("slug must match [a-z0-9_]+")
	}

	var path string
	if in.ParentID != nil {
		var parentPath string
		var parentTenant uuid.UUID
		err := s.db.QueryRow(ctx,
			`SELECT path::text, tenant_id FROM resources WHERE id = $1`,
			*in.ParentID,
		).Scan(&parentPath, &parentTenant)
		if err != nil {
			return nil, fmt.Errorf("load parent: %w", err)
		}
		if parentTenant != in.TenantID {
			return nil, fmt.Errorf("parent belongs to different tenant")
		}
		path = parentPath + "." + slug
	} else {
		path = slug
	}

	cfg, _ := json.Marshal(in.Config)
	if len(cfg) == 0 {
		cfg = []byte("{}")
	}

	row := s.db.QueryRow(ctx, `
		INSERT INTO resources (tenant_id, parent_id, kind, name, path, config)
		VALUES ($1, $2, $3, $4, $5::ltree, $6)
		RETURNING id, tenant_id, parent_id, kind, name, path::text, bookable, config, created_at
	`, in.TenantID, in.ParentID, string(in.Kind), in.Name, path, cfg)

	return scanResource(row)
}

func (s *ResourceStore) ListByTenant(ctx context.Context, tenantID uuid.UUID) ([]resource.Resource, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, tenant_id, parent_id, kind, name, path::text, bookable, config, created_at
		FROM resources WHERE tenant_id = $1
		ORDER BY path
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []resource.Resource
	for rows.Next() {
		r, err := scanResource(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

func (s *ResourceStore) Get(ctx context.Context, tenantID, id uuid.UUID) (*resource.Resource, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, tenant_id, parent_id, kind, name, path::text, bookable, config, created_at
		FROM resources WHERE tenant_id = $1 AND id = $2
	`, tenantID, id)
	return scanResource(row)
}

type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanResource(row rowScanner) (*resource.Resource, error) {
	var r resource.Resource
	var parentID *uuid.UUID
	var kind string
	var cfg []byte
	err := row.Scan(&r.ID, &r.TenantID, &parentID, &kind, &r.Name, &r.Path, &r.Bookable, &cfg, &r.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("not found")
		}
		return nil, err
	}
	r.ParentID = parentID
	r.Kind = resource.Kind(kind)
	if len(cfg) > 0 {
		_ = json.Unmarshal(cfg, &r.Config)
	}
	return &r, nil
}
