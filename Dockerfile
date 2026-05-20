# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
FROM golang:1.22-alpine AS builder

RUN apk --no-cache add git ca-certificates tzdata

WORKDIR /src

COPY go.work ./
COPY apps/api/go.mod apps/api/go.sum ./apps/api/

RUN cd apps/api && go mod download

COPY apps/api/ ./apps/api/

WORKDIR /src/apps/api

ARG VERSION=dev

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" \
    -o /out/api ./cmd/api

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" \
    -o /out/worker ./cmd/worker

# ---------- Stage 2: runtime ----------
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata wget \
    && addgroup -S balon \
    && adduser -S -G balon balon

WORKDIR /app

COPY --from=builder /out/api ./api
COPY --from=builder /out/worker ./worker
COPY --from=builder /src/apps/api/migrations ./migrations

USER balon:balon

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:8080/healthz || exit 1

ENV MIGRATIONS_PATH=file:///app/migrations
ENV HTTP_ADDR=:8080

# Default to api. Override for worker via `entrypoint: ["/app/worker"]`
ENTRYPOINT ["/app/api"]
