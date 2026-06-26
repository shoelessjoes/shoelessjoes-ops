# Retailer catalog feeds — draft Shopify products (presells / releases)

**Last updated:** 2026-06-26  
**Purpose:** Pre-build **draft** Shopify products with UPC + release metadata before stock arrives.  
**Downstream:** Dealernet / vendor email → `InboundLine` → receive scan (not Matrixify POs).

Related: `INBOUND_OPS_HANDOFF.md` · `DACARDWORLD_CATALOG.md` (DA-specific notes)

---

## Status (honest)

| Piece | DA Card World | Midwest Cards |
|-------|---------------|---------------|
| Spec / field map | ✅ `DACARDWORLD_CATALOG.md` | ✅ below |
| Scraper code | ❌ | ❌ (`probe-midwestcards.py` only) |
| Draft product import job | ❌ | ❌ |
| Review UI | ❌ | ❌ |
| Matrixify CSV exporter | ❌ | ❌ |

**Nothing is live yet** except reactive draft create on Dealernet sync (`--create-missing`).

---

## Why retailer feeds matter

Shopify needs a **variant with UPC** before:

- Dealernet purchase sync can link cost
- Receive scan can add inventory
- You avoid hand-typing every new release

```text
Retailer scrape (MWC / DA)
  → filter (~50% of catalog you actually stock)
  → draft Shopify product (UPC, title, image, tags: presell)
  → Dealernet buy / vendor invoice on same UPC
  → InboundLine + receive
```

Their storefront platform (Shopify vs BigCommerce) **does not matter** — we only read public product pages.

---

## Midwest Cards (recommended primary for release calendar)

**Site:** https://www.midwestcards.com  
**Platform:** BigCommerce + Cloudflare (not Shopify)

### Why Midwest is attractive

| Advantage | Notes |
|-----------|--------|
| **No promo modal** | DA Card World has a recurring “unlock offer” popup to dismiss |
| **Release calendar** | https://www.midwestcards.com/release-calendar/ — sport filters, save/monitor dates |
| **Clean product URLs** | `/baseball-cards/2026-topps-series-2-baseball-mega-box/` |
| **Box / Case / Pack siblings** | Same product family linked on page — scrape **Box** (or Hobby/Blaster) for Shopify unit |
| **Rich product pages** | Manufacturer info, configuration (packs/box/case), checklists |

### Scraping reality

- **curl / headless Playwright** → Cloudflare “Just a moment…” (same class of problem as DA’s HTTP 403).
- **Real browser session** (headed Playwright, or saved `storageState` after one manual visit) works.
- **No modal** still saves a step vs DA once past Cloudflare.

### Key URLs

| Feed | URL |
|------|-----|
| Release calendar | https://www.midwestcards.com/release-calendar/ |
| New release nav | Category breadcrumbs → “New Release” |
| Presale | Often tagged in category / product badges (confirm per page) |
| Example product (case) | https://www.midwestcards.com/baseball-cards/2026-topps-series-2-baseball-mega-20-box-case/ |
| Example product (box) | https://www.midwestcards.com/baseball-cards/2026-topps-series-2-baseball-mega-box/ |

### Fields to capture

```text
source:           midwestcards
source_url:       product canonical URL
source_list:      release_calendar | new_release | presale | category_crawl
title:            H1
manufacturer:     from Manufacturer Information / Item Specifications
upc:              TBD — verify in Item Specifications or JSON-LD (headed probe on shop PC)
release_date:     from calendar event OR product page
sport:            breadcrumb / calendar filter
box_type:         Hobby | Blaster | Mega | Case | Pack (from title + unit links)
mwc_price:        optional placeholder
image_url:        primary product image
in_stock:         boolean
presale:          boolean
scraped_at:       ISO timestamp
```

### Unit-of-sale rules (important)

Your example URL is a **20-box case**. Shopify variant should usually be **one box**:

| MWC page | Shopify variant | Action |
|----------|-----------------|--------|
| Hobby / Blaster / Mega **Box** | 1 variant = 1 box | ✅ Scrape & draft |
| **Case** | TBD (case SKU vs expand to boxes) | ⏸ Defer — same as Dealernet `caseQtyBoxes` |
| Pack | Rare for your model | Usually skip |

Follow **Box** link from case pages (or crawl `Boxes` category) for the UPC you’ll scan at receiving.

### Release calendar scrape strategy

1. Load `/release-calendar/` in Playwright (headed first run).
2. Inspect network tab for JSON/API behind the calendar widget (`Focus Button` / sport filters).
3. For each event: **title, date, sport, product URL** (if linked).
4. Enrich each URL with product-page scrape (UPC, image, box type).
5. Dedupe by UPC + URL.

Calendar → **what’s coming when**; product page → **UPC for Shopify**.

---

## DA Card World (secondary / UPC cross-check)

See **`DACARDWORLD_CATALOG.md`** for full detail.

| Advantage | Notes |
|-----------|--------|
| Explicit **Item Details** tab | Manufacturer, Series, **UPC/Barcode**, Release Date |
| Three list URLs | calendar, presells, new releases |

| Friction | Notes |
|----------|--------|
| Promo modal | Dismiss “No thanks” every navigation |
| HTTP 403 without browser | Playwright required |

**Use DA** when Midwest lacks UPC on a product or for a second source on release date.

---

## Recommended build order (updated)

| Phase | Deliverable |
|-------|-------------|
| 1 | **Midwest headed probe** — `probe-midwestcards.py --headed`, confirm UPC selector + calendar API |
| 2 | `scrape-midwestcards.py` — calendar events + box-level product URLs → CSV |
| 3 | Dedupe vs `ProductCatalog` / Shopify export (skip existing UPCs) |
| 4 | `export-retailer-matrixify.py` — Matrixify Products import sheet |
| 5 | Ops `job:import-retailer-drafts` OR review UI (filter sport, exclude Case) |
| 6 | Optional DA scraper for gaps |

---

## Shopify output (unchanged)

**Matrixify Products import** or Admin API `POST /products.json` with `status: draft`:

| Column | Value |
|--------|--------|
| Title | Scraped title |
| Status | `draft` |
| Variant Barcode | UPC |
| Variant SKU | `MWC-{upc}` or `DNX-{upc}` |
| Tags | `midwestcards,placeholder,presell` |
| Product Type | `Sports Cards` |
| Vendor | Manufacturer |
| Image Src | image_url |

---

## Draft creation rule (simple)

**Only create a Shopify draft when both are present on the product page:**

1. **UPC** (JSON-LD `gtin14` and/or Item Specifications)
2. **Release date** (Item Specifications)

Skip everything else (no UPC yet, no release date, case SKUs). Do **not** use the release calendar alone — far-out calendar entries often lack UPCs.

**Source:** presell category browse (`?Availability=Presell`), not the calendar widget.

**Dedupe:** skip if UPC exists on **any** Shopify variant (`status=any`: active, draft, **archived**) plus `ProductCatalog` / `sealed-catalog.csv`.

---

## Commands

```powershell
# 1) Refresh local barcode index (optional; import also hits Shopify live)
cd shoelessjoes-ops
npm run job:export-catalog

# 2) Scrape presell categories (headed; reuses out/mwc-browser-profile)
cd ..\shoelessjoes-supplier-py
.\.venv\Scripts\python.exe scripts\scrape-midwestcards-presells.py --headed

# 3) Dry-run draft import
cd ..\shoelessjoes-ops
npm run job:import-midwest-drafts

# 4) Create drafts
npm run job:import-midwest-drafts -- --execute
```

**UPC on Midwest:** JSON-LD `gtin14` (e.g. `00887521164608` → `887521164608`).

---

## Integration recap

```text
MWC/DA scrape     → draft Shopify PRODUCT (UPC placeholder)
Dealernet accept  → InboundLine (qty, cost, tracking)
sync purchase     → link variant + cost if zero on hand
receive scan      → weighted avg cost + inventory
go live           → draft → active, set retail price
```
