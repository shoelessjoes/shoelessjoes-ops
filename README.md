# Dealernet Shopify Ops

Embedded Shopify app + workers for Dealernet offer sync, inbox relay, pricing ops, POS launcher, and Zhongda vending.

**North star:** One work queue — pending offers, inbound purchases, outbound sales, vendor email (incoming), eBay ship — then **scan to receive** in Shopify. See `docs/WORK_QUEUE.md`.

## Where we left off (2026-06-14)

### This session (offer pages + queue model)

- **Pending In/Out** documented and probeable (`PENDINGIN`, `PENDINGOUT`)
- **Offer page matrix** — pending vs accepted UI, purchase Pay To vs sale Ship To (`docs/DEALERNET_OFFER_PAGE.md`)
- **Samples:** pending sale #365842, accepted sale + tracking, purchase #366037 (Pay To)
- **Inbox classify:** `Offer Accepted`, `Offer Declined` + offer id from body
- **Work queue rules:** purchases stay until **received**; sales drop after **shipped + paid** (`docs/WORK_QUEUE.md`)
- **Coming:** Gmail invoice ingest (Claude), eBay to-ship, receive scan UI in `apps/web`

### Run everything (one command)

```powershell
cd C:\Users\burke\Git2\shoelessjoes-ops

# Core pass (~5–15 min): DB, ingest, inbox, catalog, purchase dry-run, reports
.\scripts\ops\run-full-ops.ps1

# Above + Dealernet pricing scrape vs Shopify UPCs (~15–30 min more)
.\scripts\ops\run-full-ops.ps1 -IncludePricing

# Weekly pricing + post price alerts to Dealernet (optional)
.\scripts\ops\run-full-ops.ps1 -IncludePricing -PricingProfile weekly -IncludePricingAlerts
```

**What each step does:**

| Step | Command | Purpose |
|------|---------|---------|
| 1 | `db:up:wait` | Docker Postgres |
| 2 | `run-active-stock.ps1` | ingest-offers → poll-messages → purchase **dry-run** (no Shopify export) |
| 3 | `job:report-purchases` | UPC match report for ACCEPTED purchases |
| 4 | `job:update-purchase-tracking` | Push inbox tracking to draft orders (dry-run) |
| 5 | `run-dealernet-pricing.ps1` | Dealernet pricing scrape + match (optional `-IncludePricing`) |

**Shopify catalog export** (~weekly, or when products change):

```powershell
.\scripts\ops\run-catalog-export.ps1
# or weekly pricing pass:
.\scripts\ops\run-dealernet-pricing.ps1 -Profile weekly -IncludeReview -IncludeCatalogExport
```

**Live Shopify writes (manual gate):**

```powershell
npm run job:sync-offers:purchase:execute   # draft POs for accepted purchases
npm run job:sync-offers:sale:execute         # paid orders + inventory (use with care)
npm run job:update-purchase-tracking:execute
```

**Offer probes / debugging:**

```powershell
npm run job:probe-offer -- --filter PENDINGIN --max-details 3
npm run job:probe-offer -- --offerid 365842
```

Output: `data/offer-probes/`. Schedule everything: `.\scripts\ops\register-scheduled-tasks.ps1`.

---

## Focus (ongoing)

Dealernet **active stock** + **pricing table vs Shopify UPCs**. Zhongda vending is secondary. See `docs/PRIORITIES.md`.

### Dealernet pricing (validated on shop PC)

End-to-end run succeeded (~15 min; scrape is the slow part):

| Step | Result |
|------|--------|
| `job:export-catalog` | **509** sealed Shopify variants → `ProductCatalog` + `data/sealed-catalog.csv` |
| `job:export-upc-tiers` | **238** in-stock UPCs, **264** OOS, **502** total barcodes |
| supplier-py scrape (daily) | Dealernet pricing table for in-stock UPCs |
| match + review pack | Ranked opportunities |

**Run manually:**

```powershell
.\scripts\ops\run-dealernet-pricing.ps1 -Profile daily -IncludeReview
.\scripts\ops\run-dealernet-pricing-debug.ps1   # same + log at data/pricing-run.log
```

**Review outputs** (open after each run):

| File | Purpose |
|------|---------|
| `..\shoelessjoes-supplier-py\out\review\email_summary.html` | Human-readable summary (open in browser) |
| `..\shoelessjoes-supplier-py\out\review\review_priority.csv` | Top raise/lower/restock/margin rows |
| `..\shoelessjoes-supplier-py\out\review\shopify_price_update_candidates.csv` | Shopify price change candidates |
| `..\shoelessjoes-supplier-py\out\matches_daily.csv` | Full UPC match + bid/ask vs Shopify |

**Prerequisites:** `apps/worker/.env` (`DATABASE_URL`, `SHOPIFY_*`, `CATALOG_PRODUCT_TYPES`, `DEALERNET_*`). Script forwards Dealernet creds to supplier-py. One-time in supplier-py venv:

```powershell
cd ..\shoelessjoes-supplier-py
.\.venv\Scripts\python.exe -m playwright install chromium
```

**Schedule:** `.\scripts\ops\register-scheduled-tasks.ps1` — active stock 3×/day, **poll-messages every 30 min** (inbox → email), pricing daily + weekly. See **Two different alert systems** below.

### Active stock + purchases

```powershell
.\scripts\ops\run-active-stock.ps1   # ingest, poll, catalog, UPC tiers, purchase dry-run
```

First live purchase sync done — verify Shopify drafts before `sync-offers -- purchase --execute`.

### Zhongda (deferred)

Machine-assigned SKUs only; purchase → placeholder with **450×450** thumbnail. `docs/VENDING_ZHONGDA.md`.

---

## Visual dashboard options

| Tier | Option | Best for |
|------|--------|----------|
| **Now (zero build)** | `email_summary.html` + CSVs after `run-dealernet-pricing` | Daily review on shop PC |
| **Near-term** | **Remix app** (`apps/web`) embedded in Shopify Admin — read `ProductCatalog`, `matches_*`, inbound queue | One pane: Shopify context + Dealernet pricing + purchase drafts |
| **Analytics assist** | Feed `matches_daily.csv` / `review_priority.csv` to Claude (or ingest into Postgres `PriceRecommendation`) | Fuzzy match review, Pokémon/TCGplayer gaps, false positives |
| **BI** | Metabase or Retool on Docker Postgres | Charts: margin drift, in-stock vs bid, alert hit rate |
| **Stretch goal** | **Shopify POS UI extension** (smart grid tile) | Scan UPC → show Shopify qty, Dealernet bid, vending slot — no leaving POS |

POS-in-app is realistic via [POS UI extensions](https://shopify.dev/docs/api/pos-ui-extensions) (read-only first: catalog + last match). Full Dealernet scrape inside POS is not practical; show **cached** data from Postgres/API refreshed by scheduled jobs.

---

## Two different “alert” systems (do not mix them up)

| | **Inbox activities (your SMS plan)** | **Pricing-table price alerts (optional)** |
|--|--------------------------------------|-------------------------------------------|
| **What** | New Offer, Offer Updated, Shipping Updated, Payment Completed | Wanted/For Sale thresholds on `priceguide.php` |
| **Dealernet notifies you** | Hourly SMS → “log in and click” | Email when **market** hits your set price |
| **Our automation** | **`job:poll-messages`** (ops) — scrape inbox, classify, **email digest** (`ALERT_*` SMTP), tracking → DB | **`add-alerts`** (supplier-py) — **posts** alert prices to Dealernet |
| **Status** | Built; needs schedule + SMTP + event reactions (accept → sync) | Optional competitive extra; **not** the inbox/SMS replacement |

**Inbox / messaging next steps (primary):**

1. Set `ALERT_SMTP_*`, `ALERT_TO_EMAILS` (and optional `ALERT_SMS_EMAILS`) in `apps/worker/.env`.
2. Run `npm run job:poll-messages` on a cron (**every 15–30 min**) — replaces checking Dealernet after every SMS.
3. Turn off `DEALERNET_POLL_BOOTSTRAP` after first import so new messages email you with offer id, type, tracking, links.
4. **Not built yet:** on `offer_updated` + ACCEPTED → targeted ingest + purchase sync; on `offer_shipping_updated` → `update-purchase-tracking`.
5. Railway or `register-scheduled-tasks` for **poll-messages** + **ingest-offers**, not `dealernet-cycle` with auto-sale sync.

**Pricing-table alerts (optional, separate):** supplier-py `add-alerts` only if you want Dealernet to ping you when **bid/ask** crosses a price you set — different from inbox SMS. Weekly script `-IncludeAlerts` is **off by default** in daily runs; enable only after you explicitly want posted price alerts:

```powershell
.\scripts\ops\run-dealernet-pricing.ps1 -Profile weekly -IncludeReview -IncludeAlerts -AlertMax 25
```

Dry-run first: `add-alerts ... --dry-run` in supplier-py (see `shoelessjoes-supplier-py/docs/PROJECT_STATE.md`).

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
npm run playwright:install
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

### Ops schedules (Dealernet + Shopify — primary)

```powershell
.\scripts\ops\run-active-stock.ps1
.\scripts\ops\run-dealernet-pricing.ps1 -Profile daily -IncludeReview
.\scripts\ops\run-dealernet-pricing.ps1 -Profile weekly -IncludeReview
npm run job:poll-messages
.\scripts\ops\register-scheduled-tasks.ps1
```

Set `CATALOG_PRODUCT_TYPES` in `apps/worker/.env` (exact sealed product types from Shopify Admin).

### Worker jobs (Zhongda vending — secondary)

```bash
npm run job:vending-probe-login -- --headed
npm run job:vending-fetch-zhongda-snapshot
npm run job:export-catalog
npm run job:vending-sync-shopify-mirror
npm run job:vending-fetch-zhongda-goods
npm run job:vending-reconcile
npm run job:vending-report-prices -- --diff-only
npm run job:vending-price-check
```

**Scheduled:** `.\scripts\vending\register-scheduled-tasks.ps1` (2×/day price check). See `docs/VENDING_ZHONGDA.md`.

Set `ZHONGDA_*`, `SHOPIFY_*`, `CATALOG_PRODUCT_TYPES`, and `DATABASE_URL` in `apps/worker/.env`.
