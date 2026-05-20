#!/usr/bin/env bash
# Bootstrap Keycloak: postavlja tenant_id atribut na test user-u (admin@demo.local)
# u Keycloak realmu 'balon', uzimajući UUID iz Postgres-a.
#
# Pretpostavke: docker-compose.prod.yml je up, realm-balon.json je učitan,
# seed.sql je pokrenut (demo tenant postoji u bazi).

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
    echo "Error: .env file not found. Run from project root after creating .env."
    exit 1
fi

# shellcheck disable=SC1091
source .env

KC_HOST="http://localhost:${KEYCLOAK_PORT:-8081}"
KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_PASS="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD must be set in .env}"
TENANT_SLUG="${1:-demo}"
USERNAME="${2:-admin@demo.local}"

echo "→ Fetching tenant '$TENANT_SLUG' from database..."
TENANT_ID=$(docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U "${POSTGRES_USER:-balon}" -d "${POSTGRES_DB:-balon}" -tA \
    -c "SELECT id FROM tenants WHERE slug='${TENANT_SLUG}';")

if [ -z "$TENANT_ID" ]; then
    echo "Error: tenant with slug '$TENANT_SLUG' not found in database."
    echo "Run 'make prod-seed' first."
    exit 1
fi
echo "  tenant_id = $TENANT_ID"

echo "→ Logging into Keycloak as admin..."
TOKEN=$(curl -fsS -X POST "$KC_HOST/realms/master/protocol/openid-connect/token" \
    -d "username=$KC_ADMIN&password=$KC_PASS&grant_type=password&client_id=admin-cli" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")

echo "→ Finding user '$USERNAME' in realm balon..."
USER_ID=$(curl -fsS "$KC_HOST/admin/realms/balon/users?username=$USERNAME&exact=true" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import json,sys; users=json.load(sys.stdin); print(users[0]['id'] if users else '')")

if [ -z "$USER_ID" ]; then
    echo "Error: user '$USERNAME' not found in realm balon."
    echo "Check that realm-balon.json was imported (docker compose logs keycloak | grep import)."
    exit 1
fi
echo "  user_id = $USER_ID"

echo "→ Setting tenant_id attribute on user..."
curl -fsS -X PUT "$KC_HOST/admin/realms/balon/users/$USER_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"attributes\":{\"tenant_id\":[\"$TENANT_ID\"]}}"

echo ""
echo "✓ Bootstrap complete."
echo "  User: $USERNAME"
echo "  Tenant: $TENANT_ID"
echo ""
echo "Test login:"
echo "  $KC_HOST/realms/balon/account"
echo "  Default password: 'changeme' (you'll be prompted to change it)"
