# Railway fresh start (optional)

The old Railway project was tied to `dealernet-shopify-ops` and a Postgres instance that no longer accepts connections. **You do not need Railway to develop locally.** Use Docker Postgres first; redeploy to Railway only when you want scheduled workers in the cloud.

## Phase 1 — Develop locally (do this now)

1. **Stop using the old Railway `DATABASE_URL`** in local `.env` files.

2. Start local Postgres:

```powershell
cd C:\Users\burke\Git2\shoelessjoes-ops
docker compose up -d
npm run db:up:wait
```

3. Point env files at localhost (same value in each):

`packages/db/.env`, `apps/worker/.env`, and `apps/web/.env` if needed:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dealernet_ops?schema=public"
```

4. Install, migrate, smoke-test:

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:test-connection
```

5. Run a worker job locally (after Dealernet/Shopify vars in `apps/worker/.env`):

```powershell
npm run job:ingest-offers
```

6. **Archive the old Railway project** in the dashboard (or delete it) so stale URLs are not copied again.

## Phase 2 — New Railway project (when ready)

Create a **new** project; do not reuse the broken one.

### Services

| Service | Purpose |
|---------|---------|
| **PostgreSQL** | New database (empty) |
| **Worker** (or Cron) | Runs `npm run job:dealernet-cycle` from this repo |

### Link the correct repo

1. Railway → **New Project** → **Deploy from GitHub repo**.
2. Select **`shoelessjoes/shoelessjoes-ops`** (not `dealernet-shopify-ops`).
3. Root directory: `/` (monorepo root).
4. Build/start command comes from `railway.toml`:

```toml
startCommand = "npm run job:dealernet-cycle"
```

For a **cron** service, use the same command on a schedule (e.g. every 6 hours) instead of a long-running process.

### Environment variables (Worker + Postgres)

On the **Worker** service, set at minimum:

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Postgres service → **Connect** → reference `${{Postgres.DATABASE_URL}}` or copy public URL + `?sslmode=require` |
| `SHOPIFY_SHOP_DOMAIN` | Your store |
| `SHOPIFY_ACCESS_TOKEN` | Admin API token |
| `DEALERNET_USERNAME` / `DEALERNET_PASSWORD` | Dealer portal |
| `ALERT_*` | SMTP for message digests (optional until poll-messages runs) |

Use Railway **variable references** so `DATABASE_URL` stays in sync when Postgres rotates credentials.

### Migrations on the new database

From your PC, once the new public URL works (`npm run db:test-connection`):

```powershell
# Temporarily set packages/db/.env to the NEW Railway URL + sslmode=require
npm run db:migrate:deploy
```

Do **not** use `db:migrate` (`migrate dev`) against Railway.

### Cron vs one-shot

- **Cron job** (recommended): schedule `npm run job:dealernet-cycle` — ingest, poll messages, sync accepted offers.
- **Separate crons** (finer control): `job:ingest-offers`, `job:poll-messages`, `job:auto-sync-accepted` on different schedules.

### Embedded Shopify app (`apps/web`)

The Remix admin app is a **separate** deploy (Shopify CLI / hosting), not the same as the worker cron. Railway in this repo is mainly for **worker + Postgres** unless you also host the web app there.

## Checklist

- [ ] Local Docker Postgres running; `db:migrate` succeeds
- [ ] Old Railway project deleted or ignored
- [ ] New Railway project linked to `shoelessjoes-ops`
- [ ] New Postgres provisioned; `db:migrate:deploy` applied
- [ ] Worker env vars set; one manual `job:dealernet-cycle` succeeds in Railway logs
