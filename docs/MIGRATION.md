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

- [ ] Copy monorepo scaffold from `dealernet-shopify-ops`
- [ ] Update package names / README if renaming from `@dealernet-ops/*`
- [ ] Wire Railway / env examples
- [ ] Smoke-test worker jobs against Postgres
