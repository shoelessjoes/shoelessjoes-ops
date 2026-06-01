# Purchase flow (Dealernet → Shopify)

Manual today: staff enter purchases when product arrives. Target: automate draft purchase orders + tracking from inbox.

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
| `npm run job:report-purchases` | Read-only report: ACCEPTED purchases, UPC match vs live Shopify (until shared catalog export lands) |
| `npm run job:sync-offers:purchase` | Dry-run draft order creation for ACCEPTED purchases |
| `npm run job:sync-offers -- purchase --execute` | Create Shopify draft orders |
| `npm run job:update-purchase-tracking` | Push tracking from DB onto **existing** draft orders (dry-run default; `--execute` to write) |

## Recommended order

```powershell
npm run job:ingest-offers
npm run job:poll-messages          # first time: DEALERNET_POLL_BOOTSTRAP=1 in worker .env
npm run job:report-purchases       # see UPC match gaps before sync
npm run job:sync-offers:purchase   # dry-run
npm run job:sync-offers -- purchase --execute
npm run job:update-purchase-tracking --execute   # after tracking arrives in inbox
```

## Parallel work (Claude)

Claude is building a **shared sealed-product Shopify export**. When ready, point both `report-purchases` / `sync-offers` and the Python pricer at that file instead of live `fetchVariantIndex` each run.

Until then, ops uses live Shopify REST for UPC lookup — works but slower and not filtered to sealed-only.

## Tracking

- Offer detail page may include tracking at ingest time.
- **Inbox messages** (`Offer Shipping Updated`, body text) are the usual source when tracking arrives later.
- `poll-messages` parses tracking and updates `DealernetOfferLine.trackingNumber`.
- `update-purchase-tracking` updates draft order note/tags (`dealernet-in-transit`, etc.) without re-creating the draft.
