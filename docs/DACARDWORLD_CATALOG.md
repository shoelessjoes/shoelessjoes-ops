# DA Card World — catalog feed for draft Shopify products

**Last updated:** 2026-06-17  
**Retailer:** [Dave & Adams Card World](https://www.dacardworld.com) (`dacardworld.com`)  
**Purpose:** Pre-build **draft** Shopify products with UPC + release metadata so Dealernet purchases, vendor invoices, and receive-scan can match by barcode on day one.

> **Also see:** `RETAILER_CATALOG_FEEDS.md` — compares Midwest Cards (recommended calendar) vs DA for presell/release draft products.

---

## Why DA Card World

- Broad sealed catalog (good and bad — you likely stock ~50%, not 100%).
- **UPC on Item Details** tab — primary match key for ops.
- **Release date** — filter presells vs in-stock, dashboard “due” dates.
- Three curated lists map to how you think about buying:

| Feed | URL | Use |
|------|-----|-----|
| Release calendar | https://www.dacardworld.com/sports-cards/sports-release-calendar | Future dated products |
| Presells | https://www.dacardworld.com/sports-cards/sports-trading-card-presells | Pre-order placeholders |
| New releases | https://www.dacardworld.com/sports-cards/new-sports-card-releases | Just dropped |

**Product page example:**  
https://www.dacardworld.com/sports-cards/2025-26-topps-merlin-premier-league-epl-soccer-hobby-box  

**Item details (hash):** `#itemdetails`

### Fields to capture (from Item Details)

Example — 2025-26 Topps Merlin Premier League EPL Soccer Hobby Box:

```text
Manufacturer: Topps
Product:      Merlin
Series:       Premier League EPL
UPC/Barcode:  5053307083257
Release Date: June 11th, 2026
```

Also scrape from the product page itself:

- Title (H1 / product name)
- DA SKU / item number (if shown)
- Box type (Hobby / Blaster / Mega / Case — often in title)
- Sport (from breadcrumb or category)
- List price (optional — placeholder, not your sell price)
- Product URL (stable key for re-scrape)
- Image URL (for Shopify draft media)
- In-stock / presell flag (from which list or badge)

### Normalized row (internal)

```text
source:           dacardworld
source_url:       https://www.dacardworld.com/sports-cards/...
source_list:      calendar | presell | new_release
title:            2025-26 Topps Merlin Premier League EPL Soccer Hobby Box
manufacturer:     Topps
product_line:     Merlin
series:           Premier League EPL
upc:              5053307083257
release_date:     2026-06-11
sport:            Soccer
box_type:         Hobby
dacw_price:       (optional)
image_url:        ...
scraped_at:       ISO timestamp
```

---

## Scraper notes

**HTTP fetch returns 403** from this environment — use **Playwright** (same stack as `shoelessjoes-supplier-py`).

### Popup modal

DA shows a recurring offer/unlock modal. On each navigation:

1. Wait for page load
2. If modal visible → click **“No thanks”** (or equivalent dismiss selector)
3. Proceed to scrape

Store selector in config after one headed probe run.

### Item Details tab

- Navigate to product URL
- Open `#itemdetails` (or click “Item Details” tab if hash doesn’t auto-expand)
- Parse label/value pairs: Manufacturer, Product, Series, UPC/Barcode, Release Date

### Listing pages

Calendar / presells / new releases are paginated product grids:

1. Collect product URLs from each list (dedupe across lists)
2. For each URL → product scrape (with popup dismiss)
3. Rate-limit politely (e.g. 300–500 ms between products)

**Suggested repo:** new module in `shoelessjoes-supplier-py` (Playwright already there) or ops worker if you prefer one repo — supplier-py is fine for “external retailer scrape → CSV”.

---

## Two ingestion modes (pick one or both)

### Mode A — Review queue (recommended to start)

Matches PSA graded-card import / sealed draft import UI pattern:

```text
DA scrape → staging table or CSV
  → Admin UI: filters (sport, manufacturer, presell only, release window)
  → Bulk select → Approve
  → Create Shopify draft products (UPC, title, tags, image)
  → Skip if UPC already in ProductCatalog
```

**Why:** You only carry ~half their catalog — human or rule-based filter before drafts.

**Filters to support:**

- Sport (Baseball, Football, Basketball, Soccer, …)
- Manufacturer (Topps, Panini, Upper Deck, …)
- List source (calendar / presell / new only)
- Release date range (e.g. next 90 days)
- Title contains / excludes (e.g. include “Hobby”, exclude “Case” until case-qty solved)
- UPC not already in Shopify

### Mode B — Auto-create with rules

Scheduled job (weekly or daily):

```text
Scrape three lists
  → Apply saved filter profile (e.g. “Baseball + Football hobby/blaster, presell + new”)
  → Auto-create draft products for new UPCs only
  → Log summary email
```

**Guardrails:**

- `status: draft` always
- Tag: `dacardworld`, `placeholder`, `presell` or `new-release`
- Never overwrite active product price/cost on re-scrape
- Dedupe by UPC (`canonicalKey: upc:{upc}`)

---

## Shopify output

### Option 1 — Matrixify CSV (no code in Shopify)

Export staging rows to Matrixify **Products** sheet:

| Column | Value |
|--------|--------|
| Title | Scraped title |
| Status | `draft` |
| Variant Barcode | UPC |
| Variant SKU | `DACW-{upc}` or `DNX-{upc}` |
| Tags | `dacardworld,placeholder,presell` |
| Product Type | `Sports Cards` |
| Vendor | Manufacturer |
| Image Src | image_url |

Import via Matrixify app → creates draft products in bulk.

**Matrixify is the right tool for this step** — bulk **product** create/update, not purchase orders.

### Option 2 — Direct Admin API (ops job)

`productCreate` / REST `POST /products.json` with `status: draft` — same fields, no Matrixify step. Good once review UI exists.

---

## Purchase orders — Matrixify workaround (clear answer)

| Need | Matrixify? | Actual workaround |
|------|------------|-------------------|
| Placeholder **products** with UPC before stock arrives | **Yes** | DA scrape → Matrixify Products import **or** API draft create |
| Shopify **Purchase Orders** (Admin → Products → Purchase orders) | **No** | No public PO API; Matrixify does not import POs |
| **Inbound “on order”** tracking (qty, cost, tracking) | **No** | **Postgres `InboundLine`** (see `INBOUND_OPS_HANDOFF.md`) |
| **Receive inventory** at shop | **No** | Receive scan → `inventoryAdjustQuantities` (or Transfers API if multi-location) |
| Refresh **cost** on variant when invoice/Dealernet offer arrives | Partial | Matrixify can bulk-update variant cost **or** ops job on accept |

**Practical stack:**

```text
DA Card World scrape     → draft Shopify PRODUCTS (Matrixify or API)
Dealernet / email / PDF  → InboundLine in Postgres (qty, cost, tracking)
Receive scan             → inventory + mark received
```

Matrixify replaces manual product entry; it does **not** replace a purchase-order or receiving system.

---

## Case / box / pack quantity (later)

DA sells hobby boxes, blasters, cases, packs. Shopify variant is usually **one sellable unit** (one hobby box).

| DA unit | Shopify variant | Inbound qty |
|---------|-----------------|-------------|
| Hobby box | 1 variant = 1 box | `qty_ordered` = boxes |
| Case | **TBD** — 1 case variant vs case→N boxes expansion | Same as Dealernet `case_qty_boxes` in sync-offers |
| Pack | Usually don’t stock singles | Skip or separate product type |

**Defer:** align with existing `unitOfMeasure` / `caseQtyBoxes` on `DealernetOfferLine` when building `InboundLine`. Filter DA scrape to **Hobby / Blaster / Mega** first; exclude **Case** until expansion rules are defined.

---

## Integration with existing ops

```text
1. DA scrape creates/updates draft product (UPC)
2. Dealernet accept on same UPC
   → InboundLine (qty, cost, tracking) — no draft ORDER
3. Market prices from DealernetMarketProduct (search cache)
4. Receive scan → inventory adjust
5. When ready to sell → flip product draft → active, set retail price
```

UPC is the linchpin across DA catalog, Dealernet, Matrixify, and receive scan.

---

## Suggested build order

| Phase | Deliverable |
|-------|-------------|
| 1 | Playwright probe: dismiss modal, parse one product `#itemdetails`, parse one list page |
| 2 | `scrape-dacardworld.py` → `out/dacardworld_catalog.csv` |
| 3 | Dedupe + skip existing UPCs vs `ProductCatalog` / Shopify export |
| 4 | Matrixify export template OR `job:import-dacw-drafts` |
| 5 | Review UI (bulk select + filters) — optional before auto mode |
| 6 | Scheduled scrape + filter profile for auto mode |

---

## Commands (future)

```powershell
cd shoelessjoes-supplier-py

# Probe (headed — find modal selector)
.\.venv\Scripts\python.exe scripts\probe-dacardworld.py --headed

# Scrape all three lists
.\.venv\Scripts\python.exe scripts\scrape-dacardworld.py --lists calendar,presell,new

# Export Matrixify-ready CSV
.\.venv\Scripts\python.exe scripts\export-dacw-matrixify.py --input out\dacardworld_catalog.csv

# Ops: import approved rows as draft products (when built)
cd ..\shoelessjoes-ops
npm run job:import-dacw-drafts
```

---

## Session bootstrap (DA workstream)

```text
Read docs/DACARDWORLD_CATALOG.md and INBOUND_OPS_HANDOFF.md.

Build Playwright scraper for dacardworld.com three list URLs + #itemdetails UPC/release date.
Dismiss "no thanks" modal each page. Output CSV for Matrixify draft products OR direct Shopify draft create.
Filter before import — owner stocks ~50% of DA catalog. PO tracking stays in Postgres InboundLine, not Matrixify.
```
