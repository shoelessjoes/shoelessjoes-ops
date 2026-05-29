# Database setup (local + Railway)

**Recommended:** run Postgres locally via Docker and ignore the old Railway instance until you follow `RAILWAY_FRESH_START.md` for a new deploy.

```powershell
npm run db:up:wait
# set DATABASE_URL to localhost in packages/db/.env (see below)
npm run db:migrate
```

## What P1001 usually means here

Prisma `P1001: Can't reach database server` means the TCP/Postgres handshake never completed. Common causes:

1. **Stale `DATABASE_URL`** — Railway recreates host/port/password when you redeploy or restore Postgres. Copy a fresh URL from the dashboard.
2. **Postgres service stopped** — Check Railway → your Postgres plugin → **Running**.
3. **Public networking off** — Use the **public** proxy URL (`*.proxy.rlwy.net`), not an internal-only URL, when connecting from your PC.
4. **Wrong command for remote DB** — Prefer `migrate deploy` on Railway; `migrate dev` needs a shadow database (see below).

## Refresh Railway URL

1. [Railway](https://railway.app) → project → **PostgreSQL** service.
2. **Connect** → copy **Public Network** `DATABASE_URL` (or `DATABASE_PUBLIC_URL`).
3. Paste into:
   - `packages/db/.env`
   - `apps/worker/.env`
   - `apps/web/.env` (if the web app uses the DB)
4. Append SSL (required for public proxy):

```env
DATABASE_URL=postgresql://USER:PASS@HOST:PORT/railway?sslmode=require
```

If the URL already has `?`, use `&sslmode=require` instead.

5. Test without Prisma:

```powershell
cd packages\db
python scripts\test-db-connection.py
```

You want `sslmode=require: OK` before running migrations.

## Migrate commands

| Where | Command | Why |
|-------|---------|-----|
| **Your PC → Railway** | `npm run db:migrate:deploy` | Applies migrations; no shadow DB |
| **Local Docker Postgres** | `npm run db:migrate` | `migrate dev` is fine locally |

From repo root:

```powershell
npm run db:migrate:deploy
```

## Local Postgres (recommended for day-to-day dev)

Avoid hitting Railway for every schema change.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) or native Postgres.
2. Start local DB (from repo root):

```powershell
npm run db:up:wait
```

Or one-off: `docker compose up -d`

3. Point `packages/db/.env` at:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dealernet_ops?schema=public"
```

4. Run:

```powershell
npm install
npm run db:generate
npm run db:migrate
```

Keep Railway URL only in production / worker deploy env.

## Still failing after a fresh URL?

- Rotate Postgres password in Railway and update `.env`.
- Confirm no VPN/firewall blocks outbound TCP to the Railway port.
- Open a ticket with Railway if TCP connects but `test-db-connection.py` reports `server closed the connection unexpectedly` with a **new** URL (often a dead or mis-provisioned instance).
