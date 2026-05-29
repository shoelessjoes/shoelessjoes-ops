# Dealernet Shopify Ops

Embedded Shopify app + workers for Dealernet offer sync, inbox relay, pricing ops, and POS launcher.

## Monorepo layout

- `apps/web` — Remix embedded app (Admin UI + API)
- `apps/worker` — Scheduled jobs (ingest, sync, messages)
- `packages/db` — Prisma + Postgres schema
- `packages/core` — Dealernet parsing, mapping, sync, pricing logic

## Prerequisites

- Node 20+
- Postgres database URL
- Shopify Partner app + CLI for deploy

## Setup

```bash
cd dealernet-shopify-ops
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
cp apps/worker/.env.example apps/worker/.env
npm install
npm run db:generate
npm run db:migrate
npm run dev:web
```

## Environment

See `apps/web/.env.example` and `packages/db/.env.example`.

Dealernet credentials and SMTP for notifications are configured on the worker (`apps/worker/.env.example`).

## Worker jobs (Dealernet + Shopify)

Recommended: run jobs from the **monorepo root** so workspace packages are built first.

From the repo root after configuring `.env` files:

```bash
npm run job:ingest-offers
npm run job:poll-messages
npm run job:sync-offers:purchase
npm run job:sync-offers -- purchase --execute
npm run job:sync-offers:sale
npm run job:sync-offers -- sale --execute
npm run job:auto-sync-accepted
npm run job:dealernet-cycle
```

Notes:

- `ingest-offers` logs into Dealernet and refreshes offer rows into Postgres (including
  `caseQtyBoxes` and `unitOfMeasure` per line so case rows can be expanded on sync).
- `poll-messages` classifies each new inbox row (system events vs offer chats vs assistance chats),
  stores the `messageType`, `referenceOfferId`, and `dealerCode`, and emails a structured digest
  to `ALERT_TO_EMAILS` (subject prefix `Dealernet Message - <Type>` for system events,
  `Dealernet Chat - Offer #<id>` for chats, with a JSON metadata block in the body).
- `sync-offers` defaults to **dry-run** unless `--execute` is passed or `SYNC_AUTO_EXECUTE=1`
  is set in the environment. `--create-missing` is **on by default for `purchase` mode** (creates
  missing Shopify products in `draft` status with the Dealernet UPC and per-box price). It is
  **off by default for `sale` mode** (sales should already exist in catalog). Use
  `--no-create-missing` to override.
- `auto-sync-accepted` runs `sync-offers purchase` and `sync-offers sale` back-to-back with
  `SYNC_AUTO_EXECUTE=1` so accepted offers land in Shopify automatically.
- `dealernet-cycle` chains ingest → poll messages → auto-sync, suitable for a single periodic cron.
- For first inbox import without spamming notifications, set `DEALERNET_POLL_BOOTSTRAP=1` in
  `apps/worker/.env`.
- Case lines: when an offer line has `unitOfMeasure = "case"` and a parsed `caseQtyBoxes`, the
  Shopify draft order is created with `qty * caseQtyBoxes` boxes at the per-box price, with a note
  describing the expansion. If `caseQtyBoxes` is missing, the line is **skipped** (event status
  `linesSkippedUncertainCaseQty`) so we never under-book a case as a single box.

### Database

Local dev uses Docker Postgres (`docker compose up -d`, then `npm run db:migrate`). See `docs/DATABASE_SETUP.md`. The old Railway Postgres URL can be discarded; for a clean cloud redeploy see `docs/RAILWAY_FRESH_START.md`.

### Railway cron jobs

If you are using Railway cron, point the cron command at the root scripts above (for example
`npm run job:dealernet-cycle` for a one-shot ingest+notify+sync, or `npm run job:auto-sync-accepted`
on its own). These root scripts ensure `@dealernet-ops/core` and `@dealernet-ops/db` are built
before the job runs, avoiding runtime `ERR_MODULE_NOT_FOUND` for `@dealernet-ops/core/dist/index.js`.
