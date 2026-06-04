# Zhongda Cloud vending integration

**Portal:** https://us.zhongdacloud.com/web/#/login  
**Config (selectors only):** `configs/zhongda.vending.json`  
**Credentials:** `ZHONGDA_USERNAME` / `ZHONGDA_PASSWORD` in `apps/worker/.env`

---

## Problem

- Vending backend is a Chinese cloud UI; **CSV product import reportedly broken**.
- Today: stock machines by **deducting Shopify inventory** manually.
- Pain: **prices drift** (e.g. Pokémon packs appreciate in the machine); new Shopify SKUs/UPCs are not mirrored in Zhongda.
- Goal: mirror Shopify catalog → Zhongda, automate price updates where possible, show **live Shopify qty** next to machine stock, tie into Dealernet pricing checks later.

---

## What exists now (Phase 1)

| Command | Purpose |
|---------|---------|
| `npm run job:vending-probe-login` | Verify login + screenshot |
| `npm run job:vending-probe-login -- --headed` | Visible browser; fix submit selector if needed |
| `npm run job:vending-diagnose-import -- --headed --observe-ms 180000` | Capture API traffic while you try CSV import |
| `npm run job:vending-sync-shopify-mirror` | Copy `ProductCatalog` → `VendingProductMirror` in Postgres |

| `npm run job:vending-fetch-zhongda-snapshot` | Pull all Zhongda goods via REST → `data/zhongda-goods-snapshot.json` (no DB) |
| `npm run job:vending-fetch-zhongda-goods` | Same catalog → `ZhongdaGoods` table |
| `npm run job:vending-reconcile` | Title-match Shopify mirror rows to Zhongda goods |
| `npm run job:vending-report-prices` | Print Shopify vs Zhongda prices (`--diff-only` for mismatches) |
| `npm run job:vending-price-check` | **Scheduled job:** export Shopify → mirror → Zhongda → reconcile → diff report |

## Scheduled runs (recommended)

**One command** refreshes Shopify inventory/prices and compares to Zhongda:

```powershell
npm run job:vending-price-check
```

Exit code `2` = mismatches found (useful for Task Scheduler / monitoring). Exit `0` = all linked prices match.

### Windows Task Scheduler (shop PC)

```powershell
cd C:\Users\burke\Git2\shoelessjoes-ops
.\scripts\vending\register-scheduled-tasks.ps1 -MorningTime "06:30" -AfternoonTime "14:00"
```

Default: **6:30 AM** and **2:00 PM** daily. Add `-EveningTime "20:00"` for a third run.

Requires `apps/worker/.env` with `DATABASE_URL`, `SHOPIFY_*`, `ZHONGDA_*`, and `CATALOG_PRODUCT_TYPES`.

Optional email when mismatches exist:

```env
VENDING_PRICE_CHECK_EMAIL=1
VENDING_REPORT_IN_STOCK_ONLY=1
ALERT_SMTP_HOST=...
ALERT_FROM_EMAIL=...
ALERT_TO_EMAILS=you@example.com
```

### Railway (optional cloud cron)

Separate cron service (not `dealernet-cycle`):

```bash
npm run job:vending-price-check
```

Suggested: **2×/day** (e.g. `0 11,23 * * *` UTC) or match shop hours in `America/Detroit`.

### vs Dealernet pricing (`shoelessjoes-supplier-py`)

| Job | Compares |
|-----|----------|
| `job:vending-price-check` | **Shopify** sell price + **inventory qty** vs **Zhongda** machine sell price |
| supplier-py `run-profile` | Dealernet **pricing table** vs Shopify (margin, alerts) |

Run both on different schedules; they do not replace each other.

**Login selectors (confirmed):**

- Username: `#normal_login_username`
- Password: `#normal_login_password`
- Submit: **not** `.ant-message` (that is a toast container). Config tries `button.ant-btn-primary` etc.

---

## Setup

1. Copy env template:

```powershell
# apps/worker/.env
ZHONGDA_USERNAME=your_user
ZHONGDA_PASSWORD=your_pass
```

2. Migrate DB (adds `VendingProductMirror`):

```powershell
npm run db:migrate
```

3. Test login (note the `--` before `--headed` — required so npm passes flags to the script):

```powershell
npm run job:vending-probe-login -- --headed
```

Or set `ZHONGDA_HEADED=1` in `apps/worker/.env` and run without flags.

4. Diagnose CSV import (you operate the UI; we log network):

```powershell
npm run job:vending-diagnose-import -- --headed --observe-ms 180000
```

Open **Product / Import** in the portal, upload the same CSV that fails, then check:

`data/vending-probes/network-*.jsonl` — look for `4xx`/`5xx`, validation errors in JSON bodies, or missing `multipart` upload endpoints.

---

## Architecture (target)

```mermaid
flowchart LR
  SHOPIFY[Shopify catalog + inventory]
  CAT[export-catalog / ProductCatalog]
  MIRROR[VendingProductMirror]
  ZHONGDA[Zhongda Cloud UI/API]
  OPS[ops worker Playwright]
  DN[Dealernet pricing optional]

  SHOPIFY --> CAT --> MIRROR
  MIRROR --> OPS --> ZHONGDA
  DN -.-> MIRROR
```

| Phase | Work |
|-------|------|
| **1** (now) | Login probe, import network diagnose, Shopify mirror table |
| **2** (now) | REST fetch goods (`/sapi/goods`), reconcile to Shopify mirror, price diff report |
| **3** | Push price/qty from mirror when Shopify changes (capture edit API first) |
| **4** | Remix admin: machine stock vs `shopifyQty`, restock queue |
| **5** | TCGplayer bridge for Pokémon machine SKUs |

---

## CSV import (diagnosed 2026-06-03)

Import is **not** silently broken — the API returns a clear validation error.

| Item | Value |
|------|--------|
| Endpoint | `POST https://us.zhongdacloud.com/sapi/goods/importGoods` |
| Failure seen | `code: 1` — *"The number of data columns is less than 3: please fill in the goods data"* |
| Fix | CSV must have **at least 3 data columns** per row (check delimiter, header row, empty rows). Use **Export** on Goods list in the portal as the template if available. |

After login, open **Products → Goods list** (`#/goods` / alias `goods.index`).

## Product API (for automation)

| Endpoint | Purpose |
|----------|---------|
| `GET /sapi/goods?page=1` | List products (`id`, `goods_name`, `goods_no`, `cost_price`, `sell_price`, `market_price`, `category_name`, …) |
| `GET /sapi/goods/options` | Categories, units, brands |
| `POST /sapi/goods/importGoods` | CSV import (multipart file) |
| `POST /sapi/auth/login` | `username` + `password` → `bearer` JWT token |

Price updates will likely be a separate `PUT`/`POST` on a single goods id — capture that on the next diagnose run by editing one product’s sell price while the logger runs.

## Security

- Never commit `ZHONGDA_*` or paste passwords into chat/config files.
- Probe screenshots may show account UI — `data/vending-probes/` is gitignored.
- Older network logs may contain login POST bodies — delete `data/vending-probes/network-*.jsonl` after review; future runs redact credentials.

---

## Relation to other repos

- **shoelessjoes-ops** — vending + Dealernet + Shopify (this doc).
- **shoelessjoes-supplier-py** — Dealernet price alerts; can feed “raise price” hints into vending mirror later.
- **Railway** — optional cron for `vending-sync-shopify-mirror` + future Zhongda push jobs.
