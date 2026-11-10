.PHONY: help up down dev test build tidy seed migrate migrate-down \
        admin-install admin-dev admin-build \
        booking-install booking-dev booking-build \
        docker-build docker-up docker-down docker-logs \
        prod-deploy prod-seed kc-bootstrap

API_DIR := apps/api
ADMIN_DIR := apps/admin
BOOKING_DIR := apps/booking
MIGRATIONS := file://./migrations
DB ?= postgres://balon:balon@localhost:5432/balon?sslmode=disable
VERSION ?= dev

help:
	@echo "Backend (dev):"
	@echo "  up              start postgres + redis"
	@echo "  down            stop dev infra"
	@echo "  migrate         apply migrations"
	@echo "  dev             run api locally"
	@echo "  worker-dev      run worker locally (asynq server + scheduler)"
	@echo "  worker-trigger  manually enqueue materialize_all task"
	@echo "  test            run go tests"
	@echo "  tidy            go mod tidy (generates go.sum)"
	@echo "  seed            insert demo tenant + sample data"
	@echo ""
	@echo "Frontend (dev):"
	@echo "  admin-install   npm install"
	@echo "  admin-dev       vite dev server on :5173"
	@echo "  admin-build     production build to dist/"
	@echo ""
	@echo "Production:"
	@echo "  docker-build    build api Docker image (VERSION=x.y.z)"
	@echo "  docker-up       up -d full prod stack"
	@echo "  docker-down     stop prod stack"
	@echo "  docker-logs     tail api logs"
	@echo "  prod-deploy     rebuild + rolling restart api"
	@echo "  prod-seed       seed.sql against prod db"
	@echo "  kc-bootstrap    bootstrap tenant_id for test user in Keycloak"

# === Backend (dev) ===

up:
	docker compose up -d postgres redis
	@echo "waiting for postgres..."
	@until docker compose exec -T postgres pg_isready -U balon -d balon > /dev/null 2>&1; do sleep 1; done
	@echo "postgres ready"

down:
	docker compose down

migrate:
	@which migrate > /dev/null || (echo "install: go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest" && exit 1)
	migrate -path $(API_DIR)/migrations -database "$(DB)" up

migrate-down:
	migrate -path $(API_DIR)/migrations -database "$(DB)" down 1

dev:
	cd $(API_DIR) && set -a && { [ -f .env.local ] && . ./.env.local || true; } && set +a && \
		DATABASE_URL="$(DB)" MIGRATIONS_PATH="$(MIGRATIONS)" AUTO_MIGRATE=true ENVIRONMENT=development \
		go run ./cmd/api

worker-dev:
	cd $(API_DIR) && DATABASE_URL="$(DB)" ENVIRONMENT=development REDIS_ADDR=localhost:6379 go run ./cmd/worker

worker-trigger:
	@which asynq > /dev/null || (echo "install: go install github.com/hibiken/asynq/tools/asynq@latest" && exit 1)
	asynq task enqueue series:materialize_all --redis-addr=localhost:6379

test:
	cd $(API_DIR) && go test ./...

build:
	cd $(API_DIR) && go build -o ../../bin/api ./cmd/api

tidy:
	cd $(API_DIR) && go mod tidy

seed:
	psql "$(DB)" -f scripts/seed.sql

# === Frontend (dev) ===

admin-install:
	cd $(ADMIN_DIR) && npm install

admin-dev:
	cd $(ADMIN_DIR) && npm run dev

admin-build:
	cd $(ADMIN_DIR) && npm run build

booking-install:
	cd $(BOOKING_DIR) && npm install

booking-dev:
	cd $(BOOKING_DIR) && npm run dev

booking-build:
	cd $(BOOKING_DIR) && npm run build

# === Production / Docker ===

docker-build:
	docker build --build-arg VERSION=$(VERSION) -t balon/api:$(VERSION) -t balon/api:latest .

docker-up:
	@test -f .env || (echo "Create .env first: cp .env.production.example .env" && exit 1)
	docker compose -f docker-compose.prod.yml up -d --build

docker-down:
	docker compose -f docker-compose.prod.yml down

docker-logs:
	docker compose -f docker-compose.prod.yml logs -f api

prod-deploy:
	@git pull --rebase 2>/dev/null || echo "(skipping git pull)"
	docker compose -f docker-compose.prod.yml build api
	docker compose -f docker-compose.prod.yml up -d --no-deps api

prod-seed:
	docker compose -f docker-compose.prod.yml exec -T postgres \
		sh -c 'psql -U $${POSTGRES_USER:-balon} -d $${POSTGRES_DB:-balon}' < scripts/seed.sql

# Bootstrap: postavi tenant_id atribut na test user-u u Keycloak-u
kc-bootstrap:
	bash scripts/kc-bootstrap.sh
