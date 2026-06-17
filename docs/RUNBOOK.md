# Ops runbook — Dealernet → Shopify

Routine job sequences and the one-time first-live cutover. Strategy/priorities live in `AGENT_HANDOFF.md`.

---

## Pipeline

```
ingest-offers          poll-messages              sync-offers purchase
     │                      │                            │
     ▼                      ▼                            ▼
 Postgres offers     tracking → offer lines      UPC match → draft order
```

## Jobs

| Command | Purpose |
|---------|---------|
| `npm run job:ingest-offers` | Refresh purchase/sale offers from DealerNet → Postgres |
| `npm run job:poll-messages` | Inbox scrape; **writes tracking to offer lines** when found in message body |
| `npm run job:report-purchases` | Read-only report: ACCEPTED purchases, UPC match vs live Shopify |
| `npm run job:sync-offers:purchase` | Dry-run draft order creation for ACCEPTED purchases |
| `npm run job:sync-offers -- purchase --execute` | Create Shopify draft orders |
| `npm run job:sync-offers:sale` / `:sale:execute` | Sales dry-run / live (paid orders + inventory decrement) |
| `npm run job:update-purchase-tracking` | Push tracking from DB onto **existing** draft orders (dry-run default; `--execute` to write) |

## Recommended routine order

```powershell
npm run job:ingest-offers
npm run job:poll-messages                 # first time: DEALERNET_POLL_BOOTSTRAP=1 in worker .env
npm run job:report-purchases              # see UPC match gaps before sync
npm run job:sync-offers:purchase          # dry-run
npm run job:sync-offers -- purchase --execute --no-create-missing
npm run job:update-purchase-tracking -- --execute   # after tracking arrives in inbox
```

## Tracking

- Offer detail page may include tracking at ingest time.
- **Inbox messages** (`Offer Shipping Updated`, body text) are the usual source when tracking arrives later.
- `poll-messages` parses tracking → `DealernetOfferLine.trackingNumber`.
- `update-purchase-tracking` updates draft order note/tags (`dealernet-in-transit`, etc.) without re-creating the draft.

---

## First live cutover (one-time)

Use once after clearing completed offers in Dealernet, then import only what's still active.

### 1. In Dealernet (manual)
Mark completed/off-the-board purchases and sales so they drop off `PURCHASESUNRATED` / `SALESUNRATED`.
Leave **ACCEPTED** offers that still need a Shopify draft order (purchases) or fulfillment (sales). Goal:
next ingest pulls only the current batch.

### 2. Refresh local DB
```powershell
npm run job:ingest-offers
npm run job:poll-messages     # keep DEALERNET_POLL_BOOTSTRAP=1 to skip emailing old messages
```

### 3. Preview purchases (read-only)
```powershell
npm run job:report-purchases
npm run job:sync-offers:purchase
```
Confirm the summary shows only expected offers (`PURCHASESUNRATED` only, dry-run count matches pending;
note any `missing product` / `uncertain case qty` lines).

### 4. Live — purchases only (recommended first)
Creates Shopify **draft orders** (safe to review before completing).
```powershell
npm run job:sync-offers:purchase:execute
```
Use **without** `--no-create-missing` only if you want auto-created draft products for unmatched UPCs.
Spot-check Admin → **Drafts** for tags `dealernet,purchase,offer-{id}`.

### 5. Sales (optional, higher impact)
```powershell
npm run job:sync-offers:sale
npm run job:sync-offers:sale:execute
```
**Warning:** `sale --execute` creates **paid orders** and **decrements inventory**. Only run when you
intend to record completed sales in Shopify.

### 6. Tracking later
```powershell
npm run job:poll-messages
npm run job:update-purchase-tracking -- --execute
```

### After first live run
- `alreadySyncedOffers` in the sync summary increments — re-runs won't duplicate drafts for the same offer id.
- Re-ingest after Dealernet changes; don't rely on stale Postgres rows.

---

## Automation cadence (once trusted)

| Cadence | Job | Notes |
|---------|-----|--------|
| 2–4× daily | `job:ingest-offers` | Keep Postgres in sync |
| 1–2× daily | `job:poll-messages` | Tracking + alerts (SMTP in `.env`) |
| After ingest | `job:sync-offers:purchase` (dry-run) | Quick check |
| When clean | `job:sync-offers -- purchase --execute --no-create-missing` | |
| When tracking lands | `job:update-purchase-tracking --execute` | Updates existing drafts |

Wire into Task Scheduler `.cmd` files, or use `job:dealernet-cycle` once comfortable — but start
**without** auto-execute on **sales** until the purchase path is stable. Cloud cron later via
`RAILWAY_FRESH_START.md`.

## Parallel work note

When the **shared sealed-product Shopify export** is ready, point `report-purchases` / `sync-offers`
(and the supplier-py pricer) at that file instead of a live `fetchVariantIndex` each run.
