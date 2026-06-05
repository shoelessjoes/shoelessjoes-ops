# Ops priorities (what to build vs defer)

Last updated: 2026-06-03

## North star

**Automated inbound purchases → Shopify draft POs**, with **Dealernet pricing intelligence** against **Shopify sealed UPCs + inventory** on a schedule.

Zhongda vending is **supporting**, not the center of the stack.

---

## Priority A — Active stock (Dealernet + Shopify)

**Goal:** Know what's accepted/on order and keep Shopify catalog + purchase drafts current.

| Job / script | Cadence | What it does |
|--------------|---------|--------------|
| `scripts/ops/run-active-stock.ps1` | **3×/day** | `ingest-offers` → `poll-messages` → `export-catalog` → `export-upc-tiers` → purchase dry-run |
| `job:sync-offers -- purchase --execute` | After review | Create Shopify draft orders (manual gate until trusted) |

Register: `.\scripts\ops\register-scheduled-tasks.ps1`

---

## Priority B — Dealernet price checks vs Shopify

**Goal:** Scrape Dealernet **pricing table** for **your in-stock UPCs**, match to Shopify price/cost/qty, rank raise/lower/restock, optional **price alerts**.

| Job / script | Cadence | What it does |
|--------------|---------|--------------|
| `scripts/ops/run-dealernet-pricing.ps1 -Profile daily` | **Daily** | Ops exports sealed catalog → UPC tiers → supplier-py scrape + match + review |
| `-Profile weekly -IncludeAlerts` | **Weekly** | Full barcode pass + submit Dealernet alerts |

Uses **one Shopify export** from ops (`job:export-catalog` + `job:export-upc-tiers`) — no duplicate live Shopify fetch.

Outputs: `shoelessjoes-supplier-py/out/matches_daily.csv`, `out/review/`

---

## Priority C — Zhongda vending (narrow scope)

**Not:** compare all 196 Zhongda SKUs to Shopify daily.

**Yes:**

1. **Track which products are on each machine** (machine slot assignment — not built yet; API: `/sapi/machine`, device templates).
2. **When Shopify price changes** for a machine-assigned SKU → update Zhongda sell price only for those.
3. **New purchase → placeholder in Zhongda** when inbound PO/draft is created in Shopify:
   - Create goods row with title/UPC/cost
   - **Thumbnail 450×450 px** (required for machine UI) — resize from Shopify product image

Defer bulk vending price-check cron; keep login/API tools for Phase C.

---

## Purchase → Shopify → Zhongda (future)

```
Any channel (Dealernet accept, vendor email, …)
    → normalized inbound line (UPC, qty, cost)
    → Shopify draft PO / product
    → (optional) Zhongda placeholder goods + 450×450 image
    → when stocked in machine: link slot ↔ variant
```

---

## Quick commands

```powershell
# Active stock once
.\scripts\ops\run-active-stock.ps1

# Dealernet pricing vs Shopify (daily profile)
.\scripts\ops\run-dealernet-pricing.ps1 -Profile daily -IncludeReview

# Register all schedules
.\scripts\ops\register-scheduled-tasks.ps1
```

See also: `docs/AGENT_HANDOFF.md`, `docs/PURCHASE_FLOW.md`, `docs/VENDING_ZHONGDA.md`
