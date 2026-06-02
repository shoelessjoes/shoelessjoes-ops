# First live cutover — Dealernet → Shopify

Use this once after you **clear completed offers in Dealernet**, then import only what’s still active.

## 1. In Dealernet (manual)

- Mark **completed / off-the-board** purchases and sales so they drop off `PURCHASESUNRATED` / `SALESUNRATED` (or your active lists).
- Leave **ACCEPTED** offers that still need a Shopify draft order (purchases) or fulfillment (sales).

Goal: next ingest only pulls the **current** batch, not historical noise.

## 2. Refresh local DB

From `shoelessjoes-ops`:

```powershell
npm run job:ingest-offers
npm run job:poll-messages
```

First inbox pass after cleanup: keep `DEALERNET_POLL_BOOTSTRAP=1` if you don’t want email for old messages.

## 3. Preview purchases (read-only)

```powershell
npm run job:report-purchases
npm run job:sync-offers:purchase
```

Confirm summary shows only the offers you expect:

- `PURCHASESUNRATED` only
- `dry_run` count matches pending offers
- Note any `missing product` or `uncertain case qty` lines

## 4. Live — purchases only (recommended first)

Creates **Shopify draft orders** (safe to review in Admin before completing).

```powershell
npm run job:sync-offers -- purchase --execute --no-create-missing
```

Use **without** `--no-create-missing` only if you want auto-created draft products for unmatched UPCs.

Spot-check Admin → **Drafts** for tags `dealernet,purchase,offer-{id}`.

## 5. Sales (optional, higher impact)

```powershell
npm run job:report-purchases   # purchases only; for sales use dry-run:
npm run job:sync-offers:sale
npm run job:sync-offers -- sale --execute --no-create-missing
```

**Warning:** `sale --execute` creates **paid orders** and **decrements inventory**. Only run when you intend to record completed sales in Shopify.

## 6. Tracking later

When inbox shipping messages arrive:

```powershell
npm run job:poll-messages
npm run job:update-purchase-tracking -- --execute
```

## Automating going forward

| Cadence | Job | Notes |
|---------|-----|--------|
| 2–4× daily | `job:ingest-offers` | Keeps Postgres in sync with Dealernet |
| Hourly or 2× daily | `job:poll-messages` | Tracking + alerts (SMTP in `.env`) |
| After ingest | `job:sync-offers:purchase` (dry-run) | Quick check |
| When dry-run looks good | `job:sync-offers -- purchase --execute` | Or manual until trusted |
| When tracking lands | `job:update-purchase-tracking --execute` | Updates existing drafts |

**Shop PC (Task Scheduler):** wire the above into scheduled `.cmd` files or use `npm run job:dealernet-cycle` once you’re comfortable (ingest → poll → auto-sync **both** purchase and sale with `SYNC_AUTO_EXECUTE=1` — start without that flag).

**Later:** new Railway cron per `docs/RAILWAY_FRESH_START.md` when you want cloud runs.

**Claude (parallel):** shared sealed-product Shopify export → plug into `report-purchases` / sync matching instead of live full-catalog fetch.

## After first live run

- `alreadySyncedOffers` in sync summary will increment — re-runs won’t duplicate drafts for the same offer id.
- Re-ingest after Dealernet changes; don’t rely on stale Postgres rows.
