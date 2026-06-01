# Handoff to Claude Code — Dealernet / Shopify Ops

**Last updated:** 2026-05-28  
**From:** Cursor session (local setup + migration)  
**Read with:** `../shoelessjoes-supplier-py/docs/HANDOFF_CLAUDE.md` (Python pricer) and `../../shoelessjoes-storefront/docs/HANDOFF.md` (storefront)

---

## Executive summary

Two repos now implement the Dealernet back-office stack. **Local dev is working:** Docker Postgres, Prisma migrations, Playwright, and `ingest-offers` successfully scraped **23 line rows / 17 offers** into the DB.

**Shopify was not modified** by ingest. Purchases still arrive manually in the shop today. Automation target: **UPC-first matching** against a **shared sealed-product catalog export**, plus **tracking numbers from DealerNet inbox messages**, then draft purchase orders in Shopify.

The owner believes **Claude’s fuller Shopify integration** may be the better home for the **pricing-table / opportunity-ranking** workflow (more extensive than current Python). Ops repo should own **offer ingest, inbox, purchase/sale sync**.

---

## Repo map

| Repo | GitHub | Local path | Role |
|------|--------|------------|------|
| **shoelessjoes-ops** | `shoelessjoes/shoelessjoes-ops` | `C:\Users\burke\Git2\shoelessjoes-ops` | Node monorepo: ingest offers, poll messages, sync to Shopify, Remix admin app |
| **shoelessjoes-supplier-py** | `shoelessjoes/shoelessjoes-supplier-py` | `C:\Users\burke\Git2\shoelessjoes-supplier-py` | Python: DealerNet **pricing table** scrape, match, alerts, review packs |
| **shoelessjoes-storefront** | `shoelessjoes/shoelessjoes-storefront` | `C:\Users\burke\Git2\shoelessjoes-storefront` | Theme + PSA form (customer-facing) |

**Legacy (archive, do not delete):** `dealernet-shopify-ops`, `shoeless-joes`, `supplier-price-dashboard`.  
**Old Railway project** tied to legacy repo — **dead URL**. Scrap and redeploy later per `RAILWAY_FRESH_START.md` if cloud cron is needed.

---

## What Cursor validated (ops)

| Step | Status |
|------|--------|
| Port monorepo from `dealernet-shopify-ops` | ✅ In `shoelessjoes-ops` |
| Docker Postgres (`docker-compose.yml`) | ✅ Works after Docker Desktop reboot |
| `npm run db:migrate` | ✅ Against localhost |
| `npm run playwright:install` | ✅ Required once for worker jobs |
| `npm run job:ingest-offers` | ✅ 23 lines / 17 offers → Postgres |
| `npm run job:sync-offers` | ⏸ Not run to execute (dry-run only if attempted) |
| Railway production DB | ❌ Intentionally abandoned for now |

---

## End-to-end flows (what each job does)

### 1. `ingest-offers` (DONE locally)

- Playwright → DealerNetX login → scrape **`PURCHASESUNRATED`** + **`SALESUNRATED`**
- Upserts `DealernetOffer` + `DealernetOfferLine` in Postgres
- Captures per line: UPC, qty, prices, `unitOfMeasure`, `caseQtyBoxes`, tracking (when on offer row)
- **Does not call Shopify**

### 2. `poll-messages` (NOT validated this session)

- Scrapes DealerNet **inbox**
- Classifies: system events vs offer chats vs assistance
- Emails digest (`ALERT_*` SMTP in `apps/worker/.env`)
- **Tracking numbers** often arrive here — this is the hook for updating purchase draft order notes/tags when inbound shipment messages land
- First run: set `DEALERNET_POLL_BOOTSTRAP=1` to avoid emailing historical backlog

### 3. `sync-offers purchase|sale` (NOT executed against live Shopify)

- Reads **ACCEPTED** offers from Postgres
- Matches lines to Shopify variants: **UPC/barcode first**, title fuzzy fallback (`packages/core/src/mapping.ts`)
- **Purchase:** creates Shopify **draft orders** (+ optional draft products if no match)
- **Sale:** creates paid **orders**, decrements inventory
- Default **dry-run**; `--execute` or `SYNC_AUTO_EXECUTE=1` for real writes
- Uses `SHOPIFY_API_VERSION` (update from stale value in `.env` — e.g. `2025-01` if token supports it)

### 4. Python supplier pipeline (separate repo)

- Scrapes DealerNet **pricing table** (not offer lists)
- `fetch-shopify` → CSV of variants (barcode, price, cost, inventory, sales velocity)
- `match` → ranked opportunities, review pack, `add-alerts` on DealerNet
- `sync-dealernet-shopify` — CSV path to draft orders (legacy overlap with ops; prefer ops when Postgres is live)

---

## Business context (owner intent)

**Today:** Purchases are added **manually** when product arrives at the shop.

**Target automation:**

1. **Shared catalog export** — Shopify export of **all sealed product** with fields both systems need:
   - UPC/barcode (primary key)
   - Shopify variant ID + product ID
   - Title, product type/tags (sealed wax filter)
   - Price, cost, inventory, vendor, SKU
   - Optional: collection membership, metafields

2. **Purchase path (ops):**
   - Ingest accepted purchase offers → match **UPC → variant** from catalog → create **draft order** (not manual PO entry)
   - When inbox message arrives with **tracking** → attach to draft order note/tags (poll-messages + sync update)

3. **Pricing / opportunity path (supplier-py or Claude Shopify integration):**
   - Run pricing table scrape against **same catalog** (not a one-off REST fetch each time)
   - Rank margin/restock/raise/lower actions; alerts + review pack
   - More extensive logic — owner prefers evaluating **Claude’s existing Shopify integration** over growing duplicate Python REST code

**Both systems should consume the same product database/export** so UPC matching is consistent.

---

## Gaps / recommended Claude priorities

### P0 — Shared sealed-product catalog

- [ ] Define export format (CSV + optional Postgres `ProductCatalog` table or sync job)
- [ ] Filter: sealed wax only (product type, tags, or collection — confirm with owner)
- [ ] Scheduled refresh from Shopify Admin API (GraphQL bulk or REST pagination)
- [ ] Wire **ops** `sync-offers` to use catalog (today: live `fetchVariantIndex` on each run — works but slow; catalog enables offline match + reporting)
- [ ] Wire **supplier-py** `fetch-shopify` / `match` to same snapshot path

### P1 — Purchase automation (ops)

- [ ] Dry-run then execute `sync-offers purchase` for ACCEPTED rows
- [ ] Confirm `SHOPIFY_ACCESS_TOKEN` scopes: read products, write draft orders
- [ ] Update `SHOPIFY_API_VERSION` in `apps/worker/.env`
- [ ] Link **tracking from inbox** → draft order metadata (`poll-messages` + sync or webhook-style update)
- [ ] Admin UI mapping overrides (`apps/web` routes `app.mapping`) for UPC/title mismatches

### P2 — Pricing intelligence

- [ ] Compare Claude’s Shopify integration (likely in legacy `shoeless-joes` branches) vs `shoelessjoes-supplier-py`
- [ ] Pick one implementation; avoid dual maintenance
- [ ] Keep Windows Task Scheduler jobs in supplier-py OR migrate schedules to ops/Railway

### P3 — Production hosting (optional)

- [ ] New Railway project → `docs/RAILWAY_FRESH_START.md`
- [ ] Cron: `npm run job:dealernet-cycle`

---

## Environment & credentials

| Variable | ops worker | supplier-py | Notes |
|----------|------------|-------------|-------|
| `DATABASE_URL` | ✅ | — | Local: `postgresql://postgres:postgres@localhost:5432/dealernet_ops?schema=public` |
| `DEALERNET_USERNAME` / `PASSWORD` | ✅ | ✅ | Same portal login |
| `SHOPIFY_SHOP_DOMAIN` | ✅ | ✅ | `qebynk-b0.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | ✅ | ✅ | Admin API — rotate if leaked |
| `SHOPIFY_API_VERSION` | ✅ | ✅ | **Update stale values** |
| `ALERT_*` SMTP | poll-messages | alerts (Python) | Same semantics |

See `shoelessjoes-storefront/docs/CREDENTIALS.md` for org-wide credential map. **Never commit `.env`.**

---

## Commands quick reference

```powershell
cd C:\Users\burke\Git2\shoelessjoes-ops

# Local DB
npm run db:up:wait
npm run db:migrate
npm run db:test-connection

# One-time browser install
npm run playwright:install

# Worker jobs
npm run job:ingest-offers          # DealerNet → Postgres
npm run job:poll-messages          # Inbox + email
npm run job:sync-offers:purchase   # dry-run purchase sync
npm run job:sync-offers -- purchase --execute
npm run job:dealernet-cycle        # full chain
```

```powershell
cd C:\Users\burke\Git2\shoelessjoes-supplier-py
python -m src.main test-login --supplier-config configs/dealernetx.weekly.yaml
python -m src.main run-profile-review --profile weekly --min-bucket high --top-n 250
```

---

## Key code locations (ops)

| Area | Path |
|------|------|
| Offer scrape | `packages/core/src/dealernet/offers.ts` |
| Inbox / classify | `packages/core/src/dealernet/messages.ts`, `classify.ts`, `digest.ts` |
| UPC/title match | `packages/core/src/mapping.ts` |
| Shopify sync | `packages/core/src/shopify-sync.ts` |
| Ingest job | `apps/worker/src/jobs/ingest-offers.ts` |
| Sync job | `apps/worker/src/jobs/sync-offers.ts` |
| Prisma schema | `packages/db/prisma/schema.prisma` |
| Mapping UI | `apps/web/app/routes/app.mapping.tsx` |

---

## Claude Code session bootstrap

Paste at start of session:

> Read `C:\Users\burke\Git2\shoelessjoes-ops\docs\HANDOFF_CLAUDE.md` and `C:\Users\burke\Git2\shoelessjoes-supplier-py\docs\HANDOFF_CLAUDE.md`. Priority: build shared Shopify sealed-product catalog export; wire ops purchase sync (UPC match + tracking from inbox); evaluate consolidating pricing scrape with existing Claude Shopify integration. Local Postgres + ingest-offers already work. Do not use old Railway DATABASE_URL.

---

## Cursor parallel work (2026-05-28, while Claude does Shopify export)

Implemented in `shoelessjoes-ops` without waiting on shared catalog:

| Feature | Job / file |
|---------|------------|
| Inbox tracking → Postgres offer lines | `poll-messages` + `packages/core/src/dealernet/tracking.ts` |
| Purchase readiness report (UPC match preview) | `npm run job:report-purchases` |
| Push tracking to existing Shopify draft orders | `npm run job:update-purchase-tracking` (`--execute`) |
| Purchase flow doc | `docs/PURCHASE_FLOW.md` |

See `docs/PURCHASE_FLOW.md` for recommended job order.

---

## Related docs in this repo

- `docs/DATABASE_SETUP.md` — local Docker Postgres
- `docs/RAILWAY_FRESH_START.md` — greenfield cloud deploy
- `docs/MIGRATION.md` — legacy port checklist
- `README.md` — worker job semantics
