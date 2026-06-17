> **ARCHIVED 2026-06-16.** The port from the legacy monorepo is complete; this file is kept for
> history only. Live status lives in `../AGENT_HANDOFF.md`. Do not treat as an active task list.

---

# Migration map — shoelessjoes-ops

Target repo for back-office automation. **Do not restructure** — port from the legacy monorepo as-is, then rename package scopes if needed.

## Source (legacy)

| Path | What to port |
|------|----------------|
| `C:\Users\burke\Git\dealernet-shopify-ops\` | Full Node monorepo |

Key folders:

- `apps/web` — Remix embedded Shopify app (sync, pricing, mapping, alerts UI)
- `apps/worker` — Cron jobs: ingest offers, poll messages, sync offers, dealernet-cycle
- `packages/db` — Prisma schema + migrations (Postgres)
- `packages/core` — Dealernet login/parsing, Shopify sync, pricing, notifications
- `railway.toml` — Deploy config (`npm run job:dealernet-cycle`)

## GitHub

- **Target:** `github.com/shoelessjoes/shoelessjoes-ops`
- **Archive (do not delete):** old `dealernet-shopify-ops` repo

## Local clone path

`C:\Users\burke\Git2\shoelessjoes-ops\`

## Related docs

- Storefront handoff: `../shoelessjoes-storefront/docs/HANDOFF.md`
- Legacy Python pricer (separate repo): `../shoelessjoes-supplier-py/docs/MIGRATION.md`

## Status

- [x] Copy monorepo scaffold from `dealernet-shopify-ops` (also verified identical to `dealernet-shopify-ops.zip` @ `5f95a8d`)
- [ ] Update package names / README if renaming from `@dealernet-ops/*`
- [ ] Wire Railway / env examples (optional — see `RAILWAY_FRESH_START.md`; local Docker first)
- [ ] Smoke-test worker jobs against Postgres (see `DATABASE_SETUP.md`)
