# Apex Auto Showroom: production version

The production build of the showroom in the parent folder. The demo keeps everything in one browser. This version runs on a server with a real database, staff logins and an audit trail, so a dealership can use it day to day.

| | Demo (parent folder) | Production (this folder) |
|---|---|---|
| Data | Browser `localStorage`, one device | PostgreSQL, shared by all staff |
| Admin access | Anyone who opens `/admin` | Staff logins with roles: admin, manager, sales |
| Cost and margin | Visible in the browser to anyone | Never sent to the public site; hidden from sales staff |
| Website enquiries | Saved in the visitor's own browser | Saved on the server, with optional email alerts to staff |
| Inventory search | Downloads every car | Server-side filtering and paging |
| Photos | URL only | URL or upload (JPEG/PNG/WebP, checked by file content) |
| Power BI | CSV export | CSV export, plus a read-only `bi` schema for scheduled refresh |
| Deployment | Static files | Docker image (API and website), `docker-compose.yml`, health checks |

## What's inside

```
shared/   Business logic used by both server and browser: types, analytics, inventory search rules,
          Power BI tables, request validation (zod). Unit-tested.
server/   Fastify API on Node 22 with PostgreSQL. Versioned SQL migrations, sessions, roles,
          audit log, uploads, sitemap. Integration-tested against a real database.
web/      The React website and dealer admin, talking to the API. Browser smoke-tested end to end.
powerbi/  DAX measures, theme and model guide (see docs/POWERBI.md for a live connection).
docs/     OPERATIONS.md (deploy, backups, monitoring) and POWERBI.md.
```

## Run it with Docker (recommended)

```bash
cp .env.example .env              # set POSTGRES_PASSWORD, PUBLIC_URL, TIMEZONE
docker compose up -d --build
docker compose exec app node dist/cli/create-admin.js --email owner@yourdealer.com --name "Owner Name"
```

Open http://localhost:8080 for the website and http://localhost:8080/admin for the dealer admin. Sign in as the admin you just created, then add showrooms and staff under **Users & settings**.

To try it with 24 months of demo data instead of starting empty:

```bash
docker compose exec -e ALLOW_DEMO_SEED=1 app node dist/cli/seed-demo.js
# Logins: admin@demo.local, manager@demo.local, maya@demo.local … password: demo-password-1
```

## Run it for development

Requirements: Node 22+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env    # set DATABASE_URL=postgres://…/showroom, NODE_ENV=development, COOKIE_SECURE=false
npm run migrate
npm run seed:demo       # optional demo data
npm run dev             # API on :8080, website with hot reload on :5173 (proxies /api)
```

## Tests

```bash
npm run typecheck
npm test                # shared unit tests, API integration tests (needs PostgreSQL), web unit tests
npm run build && npm run smoke   # full stack in Chromium: fresh DB, real server, real browser
```

The API tests use `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/showroom_test`) and the smoke test uses `SMOKE_DATABASE_URL` (default `…/showroom_smoke`). Both **drop and recreate** their database, and refuse to run unless its name contains `test` or `smoke`.

What the tests prove:

- **Search and dashboard numbers:** the database search returns the same cars in the same order as the shared browser logic. The dashboard numbers equal the shared analytics run over the whole database.
- **Access control:**
  - The public API never returns cost, sale price or staff details.
  - Sales staff never see cost, and can't open reports.
  - Every change needs a session and a CSRF token.
  - Cross-site posts are refused.
- **Accounts and sessions:**
  - After 5 wrong passwords an account locks, even against the right password.
  - Changing a password, or disabling a user, signs out their other sessions.
  - An admin can't remove their own admin access.
- **Data integrity:**
  - Sold cars can't be deleted, and only an admin can reverse a sale.
  - Two people editing the same car get a conflict warning instead of overwriting each other.
  - A car can't be sold twice.
- **Uploads:** photos are checked by their bytes, not their file name, and the server chooses the file name. Oversize files are rejected.
- **Spam protection:** lead spam is rate-limited, and bots are caught by a hidden honeypot field.

## Security summary

- **Passwords:** scrypt hashes. Logins take the same time for unknown emails, so they can't be discovered by timing. Accounts lock after repeated failures.
- **Sessions:** random tokens in `httpOnly`, `SameSite=Lax` (and `Secure` in production) cookies. Only a SHA-256 of each token is stored in the database. Sessions have idle and absolute expiry.
- **Cross-site attacks:**
  - CSRF: a per-session token is required on every change, and the `Origin` header is checked.
  - Headers: Helmet sets strict security headers, including a Content-Security-Policy and HSTS behind https.
- **Input and database:** every input is validated with zod on the server, and all SQL is parameterised. Search text is matched literally, so `%` and `_` typed by a visitor are not wildcards.
- **Rate limits:** a global limit, plus tighter limits on login, lead forms and uploads.
- **Audit log:** records who did what and from which IP address, viewable by admins.
- **Personal data:** no customer names, emails or phone numbers go into Power BI exports or `bi` views. Logs redact cookies and tokens.

## Known limits

- **Rate limits are per server:** they are kept in memory. If you run several app servers behind a load balancer, each keeps its own count. Add a shared store (Redis) if that matters.
- **Photos are not resized:** they're stored as uploaded, on a local volume. For many large photos, put a CDN or object storage (S3) in front.
- **No password-reset emails:** an admin resets passwords from **Users & settings**.
- **Vehicle pages render in the browser:** there is no server-side rendering. The sitemap helps search engines, but social-media link previews show the site's generic title.
