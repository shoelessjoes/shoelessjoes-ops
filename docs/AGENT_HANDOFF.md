# Agent handoff — Shoeless Joe's back office (ops)

**Last updated:** 2026-06-17
**Audience:** Any agent (Claude Code, Cursor, etc.) picking up back-office work.
**Shop:** `qebynk-b0.myshopify.com` (public: shoelessjoescards.com)

> For the cross-repo overview, canonical IDs, and shared gotchas, read **`SHOELESS_JOES_MASTER.md`** first.
> This file is the single master handoff for the **ops** repo — it absorbs the former `HANDOFF_CLAUDE.md`
> and `PRIORITIES.md`. Job sequences/runbooks are in `RUNBOOK.md`; the offer-page UI matrix in
> `DEALERNET_OFFER_PAGE.md`; vending in `VENDING_ZHONGDA.md`; DB setup in `DATABASE_SETUP.md`.
> **Session wrap-up (market search, sync lessons, inbound pipeline):** `INBOUND_OPS_HANDOFF.md`.  
> **DA Card World draft-product feed (UPC presells / new releases):** `DACARDWORLD_CATALOG.md`.  
> **Vendor email (Topps / Panini / GTS) + unified dashboard:** `VENDOR_CHANNELS_AND_DASHBOARD.md`.

---

## North star

**One picture of everything coming in or on order**, so staff can **scan UPC → receive → adjust Shopify
inventory** without re-keying across systems. Zhongda vending is **supporting**, not the center of the stack.

```
Sources (Dealernet, vendor email, …)
        ↓
  Normalized "inbound lines" (UPC, qty, cost, status, tracking, vendor)
        ↓
  Match to Shopify catalog (shared sealed-product export — in progress)
        ↓
  Expected inventory / draft PO / on-order queue
        ↓
  Scan-in at receiving → adjust Shopify inventory @ location 72115847233
```

**The linchpin (top cross-repo priority): a shared sealed-product catalog export** (UPC, variant ID,
price, cost, inventory, sealed-only filter), consumed by both ops purchase-sync and supplier-py pricing —
not duplicate live full-catalog fetches.

---

## Repo map (back office)

| Repo | Local path | Role |
|------|------------|------|
| **shoelessjoes-ops** (this) | `C:\Users\burke\Git2\shoelessjoes-ops` | Dealernet ingest, inbox, Shopify draft orders/orders, Postgres, Remix admin, vending |
| **shoelessjoes-supplier-py** | `C:\Users\burke\Git2\shoelessjoes-supplier-py` | Dealernet **pricing table** scrape, margin ranking, price alerts (Windows scheduled) |
| **shoelessjoes-storefront** | `C:\Users\burke\Git2\shoelessjoes-storefront` | Customer theme + PSA form + Apps Script |

**Legacy (archive only, do not use):** `dealernet-shopify-ops`, `shoeless-joes`, old Railway project
(dead DB URL). See `RAILWAY_FRESH_START.md`.

---

## Where we left off (validated locally, owner session ~2026-05-29)

| Step | Status |
|------|--------|
| Port monorepo from `dealernet-shopify-ops` | ✅ Complete |
| Docker Postgres + Prisma migrations on shop PC | ✅ |
| `playwright install` (required once for worker jobs) | ✅ |
| `ingest-offers` (Dealernet → DB) | ✅ 23 lines / 17 offers |
| `poll-messages` (inbox, bootstrap mode) | ✅ 25 rows ingested |
| `report-purchases` (UPC match preview) | ✅ ~21/23 lines matched last batch |
| `sync-offers purchase` dry-run | ✅ 17 purchase offers; purchase-only filter fix confirmed |
| `sync-offers purchase --execute` (live) | ⏸ Owner ran ~2026-05-29 — **VERIFY draft orders in Shopify Admin** |
| Railway production DB | ❌ Intentionally abandoned; local Docker only |

**Owner actions same day:** cleared completed Dealernet offers off the board (manual UI), re-ran
ingest → preview → live execute for the current batch. **Open verification:** Admin draft orders, line
items, tags, gaps.

---

## Stream A — Dealernet automated purchases & sales

### What exists today

| Job | Purpose |
|-----|---------|
| `job:ingest-offers` | Scrape `PURCHASESUNRATED` + `SALESUNRATED` → Postgres (captures `caseQtyBoxes`, `unitOfMeasure`, tracking-on-row) |
| `job:poll-messages` | Inbox → classify; **tracking → offer lines** when parsed |
| `job:report-purchases` | Read-only UPC match report (ACCEPTED purchases) |
| `job:sync-offers purchase` | ACCEPTED buys → Shopify **draft orders** (dry-run default) |
| `job:sync-offers sale` | ACCEPTED sales → Shopify **paid orders** + inventory decrement |
| `job:update-purchase-tracking` | Push tracking onto existing draft orders |
| `job:probe-offer` | DOM snapshot of offer pages (see `DEALERNET_OFFER_PAGE.md`) |

**Purchase path:** offer accepted → draft order (UPC match) → tracking from inbox → draft note/tags updated.
**Sale path:** higher risk — only automate intentionally. Job sequences in `RUNBOOK.md`.

### Still to do (Dealernet)

| Priority | Task |
|----------|------|
| P0 | **Verify first live run** — Admin draft orders, partial offers (e.g. missing Pokémon UPCs), case-qty skips |
| P0 | Plug in **shared sealed catalog export** when delivered (replace per-run `fetchVariantIndex`) |
| P1 | **Mapping overrides UI** — `apps/web` `app.mapping` for UPC/title mismatches |
| P1 | **Receiving workflow** — link draft order / inbound line → scan UPC → receive inventory in Shopify (not built) |
| P2 | **Scheduled jobs** on shop PC (Task Scheduler) or new Railway cron |
| P2 | **Sale sync policy** — purchases-only automation first; sales manual or separate approval |
| P3 | **Idempotency review** — `alreadySyncedOffers`; ensure re-ingest doesn't duplicate drafts |
| P3 | **Case lines** — re-ingest when `caseQtyBoxes` missing; don't under-order cases |

---

## Stream B — Vendor email invoices (not built yet)

| Vendor | Typical flow | Email signals |
|--------|----------------|---------------|
| **Topps.com** | Offer/cart → order confirm → invoice → shipped | Order #, line items, tracking |
| **Topps Direct** | Same family, different templates | PDF invoice, shipping notice |
| **Panini** | Order → invoice → shipped | PDF + HTML order emails |
| **GTS Distribution** | Wholesale order → invoice → ship | PDF invoices, SKU/UPC tables |

These start as **offers**, become **orders**, then **invoiced/shipped** — like Dealernet but sourced from
**email**. Existing seed: `../shoelessjoes-supplier-py/integrations/google_apps_script/log_vendor_invoices.gs`
(Gmail label → Drive PDF + Sheet row). See `../shared/google-workspace-automation-starter.md` for the
Gmail→Drive→Sheet→Shopify pattern.

**Phased plan:**
1. **Email capture (low risk):** Gmail filters/labels (`Invoices/Topps`, `…/ToppsDirect`, `…/Panini`, `…/GTS`); Apps Script → Sheet/webhook → ops DB; store raw (`vendor`, `message_id`, `subject`, `date`, `attachment_urls`, `parse_status`).
2. **Parse → normalized lines:** per-vendor parsers (PDF/HTML) → `{ order_id, invoice_id, line_items[]{sku,upc,title,qty,unit_cost}, tracking, ship_date, status }`. Start with one vendor (GTS or Topps).
3. **Unified inbound model (Postgres):** `InboundShipment` + `InboundLine`; reconcile Dealernet offer id ↔ vendor order id by UPC/qty/date.
4. **Shopify + receiving:** match via shared catalog → draft POs / inventory transfers; scan-to-receive UI.
5. **"Everything on order" dashboard:** single view across sources.

**Open questions for owner:** receive via draft-order-complete vs inventory-adjust vs PO app? store cost
on variant/inventory metafield? which vendor email to parse first? keep Sheet staging or Postgres-only?

---

## Stream C — Pricing & vending (supporting)

- **Pricing intelligence** lives in `shoelessjoes-supplier-py` (Dealernet pricing-table scrape, margin
  ranking, alerts). Owner wants to evaluate consolidating its Shopify fetch with the shared catalog rather
  than maintaining a duplicate Python REST client. See `../shared/DEALERNET_STACK.md`.
- **Zhongda vending** — see `VENDING_ZHONGDA.md`. Phase 1–2 working (login probe, REST goods fetch,
  Shopify-mirror + price-diff report). CSV import diagnosed (needs ≥3 data columns). Narrow scope: track
  machine slot assignment, push price only for machine-assigned SKUs, placeholder goods on new purchase
  (450×450 thumbnail required).

---

## Consolidated priorities & cadences

**North star:** automated inbound purchases → Shopify draft POs, with Dealernet pricing intelligence
against Shopify sealed UPCs + inventory on a schedule.

### Priority A — Active stock (Dealernet + Shopify)

| Job / script | Cadence | What it does |
|--------------|---------|--------------|
| `scripts/ops/run-active-stock.ps1` | **3×/day** | `ingest-offers` → `poll-messages` → purchase dry-run |
| `scripts/ops/run-catalog-export.ps1` | **Weekly** | Shopify sealed catalog + UPC tiers (pricing + sync input) |
| `scripts/ops/run-dealernet-pricing.ps1 -Profile daily` | **Daily** | Dealernet pricing scrape + match (cached catalog CSV) |
| `-Profile weekly -IncludeCatalogExport` | **Weekly** | Full barcode pass + fresh export + review |

Register all: `.\scripts\ops\register-scheduled-tasks.ps1`

### Priority B — Dealernet price checks vs Shopify

Scrape Dealernet pricing table for in-stock UPCs, match to Shopify price/cost/qty, rank
raise/lower/restock, optional alerts. Uses **one** Shopify export from ops (no duplicate live fetch).
Outputs: `shoelessjoes-supplier-py/out/matches_daily.csv`, `out/review/`.

### Priority C — Zhongda vending (narrow)

Track machine slot assignment (not built); when Shopify price changes for a machine-assigned SKU update
Zhongda sell price; new purchase → placeholder goods (450×450 thumbnail). Defer bulk vending price-check cron.

---

## Environment & credentials

| Variable | ops worker | supplier-py | Notes |
|----------|------------|-------------|-------|
| `DATABASE_URL` | ✅ | — | Local: `postgresql://postgres:postgres@localhost:5432/dealernet_ops?schema=public` |
| `DEALERNET_USERNAME` / `_PASSWORD` | ✅ | ✅ | Same portal login |
| `SHOPIFY_SHOP_DOMAIN` | ✅ | ✅ | `qebynk-b0.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | ✅ | ✅ | Admin API — **separate** token from the storefront form's; rotate independently |
| `SHOPIFY_API_VERSION` | ✅ | ✅ | Update stale values (e.g. bump to a version the token supports) |
| `ZHONGDA_USERNAME` / `_PASSWORD` | ✅ | — | Vending portal |
| `ALERT_*` SMTP | poll-messages | alerts | Same semantics |

Full credential map (no secrets): `../shoelessjoes-storefront/docs/CREDENTIALS.md`. **Never commit `.env`.**

---

## Key commands

```powershell
cd C:\Users\burke\Git2\shoelessjoes-ops
npm run db:up:wait                 # if Docker not running
npm run db:migrate
npm run playwright:install         # once
npm run job:ingest-offers
npm run job:poll-messages
npm run job:report-purchases
npm run job:sync-offers:purchase   # dry-run
npm run job:sync-offers -- purchase --execute --no-create-missing
npm run job:update-purchase-tracking -- --execute
npm run job:dealernet-cycle        # full chain (start without auto-execute on sales)
```

Detailed sequences and the first-live cutover are in `RUNBOOK.md`.

---

## Key code locations

| Area | Path |
|------|------|
| Offer scrape | `packages/core/src/dealernet/offers.ts` |
| Inbox / classify / tracking | `packages/core/src/dealernet/{messages,classify,digest,tracking}.ts` |
| UPC/title match | `packages/core/src/mapping.ts` |
| Shopify sync | `packages/core/src/shopify-sync.ts` |
| Ingest job | `apps/worker/src/jobs/ingest-offers.ts` |
| Sync job | `apps/worker/src/jobs/sync-offers.ts` |
| Prisma schema | `packages/db/prisma/schema.prisma` |
| Mapping UI | `apps/web/app/routes/app.mapping.tsx` |

---

## Session bootstrap (paste this)

```
Read shoelessjoes-ops/docs/INBOUND_OPS_HANDOFF.md then AGENT_HANDOFF.md and WORK_QUEUE.md.

Context: Market search + DealernetMarketProduct built; first live purchase sync created 10 Shopify
draft orders (wrong doc type for inbound — see handoff). Next: InboundLine queue, fix sync semantics
(sales→drafts, purchases→inbound), draft product import, receive scan, vendor email/PDF on same rail.

Do not use old Railway DATABASE_URL. Shop domain: qebynk-b0.myshopify.com
```

---

## What not to do

- Do not point local `.env` at the dead Railway Postgres.
- Do not run `sale --execute` without explicit owner approval (creates paid orders, decrements inventory).
- Do not duplicate catalog-export logic across repos once the shared export exists.
- Do not auto-click Accept/Decline/Revise or **Update Listings** on Dealernet (manual only — see `DEALERNET_OFFER_PAGE.md`).
- Do not commit secrets or `.env` files.
