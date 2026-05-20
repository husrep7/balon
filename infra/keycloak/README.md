# Keycloak setup za Balon

Realm konfiguracija i upute za bootstrap Keycloak-a kao identity provider-a.

## Šta je u `realm-balon.json`

- **Realm**: `balon`
- **Clients**:
  - `balon-admin` — public SPA klijent (PKCE), za React admin frontend
  - `balon-api` — bearer-only resource server (backend ne treba ovo direktno koristi, ali možeš ga koristiti za uvod audience)
- **Roles**: `admin`, `operator`, `viewer`
- **Protocol mapper**: `tenant_id-mapper` — kopira user attribute `tenant_id` u JWT claim sa istim imenom
- **Test user**: `admin@demo.local` / `changeme` (briši u produkciji)

## Bootstrap workflow

### 1. Pokreni Keycloak sa import-om realm-a

Dodano je u `docker-compose.prod.yml` (vidi servis `keycloak`). Pri prvom pokretanju, učita `realm-balon.json` automatski.

```bash
docker compose -f docker-compose.prod.yml up -d keycloak

# Sačekaj 30-60 sekundi za prvi start (učitavanje realm-a)
docker compose -f docker-compose.prod.yml logs -f keycloak
# Tražiš: "Imported realm balon"
```

Admin konzola dostupna na: `http://localhost:8081/admin` (default admin / admin — promijeni odmah!)

### 2. Postavi `tenant_id` za test user-a

Test user iz realm import-a ima `tenant_id` postavljen na nulu (UUID `00000000-...`). Treba zamijeniti pravim tenant ID-jem iz baze:

```bash
# Uzmi tenant ID iz Postgres-a
TENANT_ID=$(docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U balon -d balon -tA -c "SELECT id FROM tenants WHERE slug='demo';")

echo "Tenant ID: $TENANT_ID"

# Postavi atribut na user-u kroz admin REST API:
# 1) Login kao Keycloak admin da dobiješ token
TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli" \
  | jq -r .access_token)

# 2) Nađi user ID
USER_ID=$(curl -s "http://localhost:8081/admin/realms/balon/users?username=admin@demo.local" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

# 3) Update user atribute
curl -X PUT "http://localhost:8081/admin/realms/balon/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"attributes\":{\"tenant_id\":[\"$TENANT_ID\"]}}"
```

### 3. Postavi env za API

U `.env`:

```bash
KEYCLOAK_ISSUER=http://keycloak:8080/realms/balon
KEYCLOAK_JWKS_URL=http://keycloak:8080/realms/balon/protocol/openid-connect/certs
DEV_ALLOW_HEADERS=false
```

Za production sa odvojenim public-facing Keycloak host-om, koristi public URL:

```bash
KEYCLOAK_ISSUER=https://auth.balon.dev/realms/balon
KEYCLOAK_JWKS_URL=https://auth.balon.dev/realms/balon/protocol/openid-connect/certs
```

Restart API:

```bash
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml logs -f api
# Tražiš: "keycloak auth enabled"
```

### 4. Postavi env za admin frontend

U `apps/admin/.env`:

```bash
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_KEYCLOAK_REALM=balon
VITE_KEYCLOAK_CLIENT=balon-admin
```

Rebuild i deploy:

```bash
cd apps/admin
npm run build
# servisi statičke fajlove
```

## Workflow za novog tenanta

Kad dodaš novog tenanta u Postgres bazu, treba pratiti istu konvenciju u Keycloak-u:

1. Kreiraj tenant u bazi → uzmi `tenant_id` UUID
2. U Keycloak admin konzoli ili kroz API:
   - Kreiraj user-e za taj tenant
   - Postavi user attribute `tenant_id` = UUID iz baze
   - Dodaj role (admin/operator/viewer)
3. Login flow potom radi automatski — token sadrži `tenant_id` claim, API enforce-uje izolaciju

**Multi-tenant naming convention**: Keycloak group-e mogu se koristiti za organizaciono grupisanje user-a po tenant-u, ali `tenant_id` attribute na user-u je **canonical source of truth**.

## Šta dalje

- **Roles → API authorization**: Trenutno API ne enforce-uje role granularno (svi authenticated user-i mogu sve). Phase 2: dodaj role check middleware (`requireRole("admin")` na endpoint-ima koji mijenjaju config).
- **Refresh token rotation**: Frontend (`keycloak-js`) već handle-uje refresh automatski.
- **Logout svuda**: `kc.logout()` invalidira session na Keycloak-u; svi backend-i koji se oslanjaju na JWT će odbiti token nakon `exp`.
- **SSO**: Ako dodaš drugi servis (npr. customer portal), koristi isti realm sa novim client-om — user-i se već ulogovani, single sign-on radi automatski.

## Troubleshooting

**`missing tenant_id claim` greška na API-ju**
→ Provjeri da li user u Keycloak-u ima attribute `tenant_id` postavljen. Atribut se postavlja na user, ne na klijent.

**`invalid token: token signature is invalid`**
→ JWKS URL u env-u možda pokazuje na pogrešan realm. Provjeri da `KEYCLOAK_JWKS_URL` završava sa `/realms/balon/protocol/openid-connect/certs`.

**SPA dobija CORS error pri login redirect-u**
→ Provjeri da `webOrigins` u client config-u uključuje origin SPA-a (`http://localhost:5173` za dev, production domain za prod).

**Token life-span prekratak**
→ Edit realm settings → Tokens → `Access Token Lifespan`. Default je 5 min, predugačak je sigurnosni rizik, prekratak je friction. 30 min je razuman default za admin tools.
