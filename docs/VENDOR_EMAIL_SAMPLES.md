# Vendor email & PDF samples — Topps, GTS, Panini shipping

**Last updated:** 2026-06-25  
**Mailbox:** `contact@shoelessjoescards.com` (all channels)

**Owner priority (purchase volume):**
1. **Dealernet** — highest volume (already ingesting)
2. **Topps.com**, **Topps Direct (FC Pro)**, **Panini** — equal next
3. **GTS** — last

Related: `VENDOR_CHANNELS_AND_DASHBOARD.md` · `VENDOR_PDF_SAMPLES_PANINI.md`

Samples: `data/vendor-samples/{topps-fcpro,topps-com,gts,panini}/`

---

## Gmail labels (existing — do not replace)

Owner already organizes **`contact@shoelessjoescards.com`** in Gmail. Ingest should **read these labels**, not create new ones.

| Parent | Sub-label | Vendor `source` | Parse as |
|--------|-----------|-----------------|----------|
| **\*Panini** | Offers | `panini` | presell / allocation (`stage: offered`) |
| | Orders | `panini` | `Ordine_Web_*.pdf`, order confirm emails |
| | Invoices | `panini` | `10275_VV*_*.pdf` |
| | Shipments | `panini` | Red River `office@redriverdistribution.com`, tracking |
| **\*Topps** | FC Pro Orders | `topps_fcpro` | `fanaticscollectpro.com` order submitted + offers |
| | Topps.com Orders | `topps_com` | `t.shopifyemail.com` order confirmed |
| | Shipments | `topps_com` | Topps.com “on the way” + FC Pro ship when present |
| | Offers | `topps_fcpro` | FC Pro allocation emails (optional catalog) |
| | News / buyback / EQL | — | **Skip ingest** (not purchase pipeline) |
| **Leaf, GTS** | GTS | `gts` | `billing@gtsdistribution.com` + `INV*.pdf` |
| | Invoices | `gts` | same |
| | Releases | — | optional catalog only |
| | BoBa / Diamond | — | TBD when samples exist |
| **\*PSA** | Orders / Shipments / … | `psa` | separate grading workflow (not sealed inbound) |
| **eBay** / **Finance** | — | out of scope for vendor purchase ingest |

**Apps Script / worker:** one job per `(parent, sub-label)` or poll all purchase labels into one queue with `gmail_label` on each raw row.

**Do not** parse “Save as PDF” thread exports — use **attachments** + **text/plain** / HTML body from live messages in these labels.

---

## Topps Direct — FC Pro (Fanatics Collect Pro)

**Domain:** `notifications@fanaticscollectpro.com`  
**Portal:** https://www.fanaticscollectpro.com

### Type A — Presell offer (`Shoeless Joes's latest offer from FC Pro….eml`)

| Field | Example |
|-------|---------|
| Product | `2025 Topps Inception Baseball` |
| Offer URL | `https://www.fanaticscollectpro.com/offers/{uuid}` |
| Offer expires | `June 24, 2026` |
| Street date | `June 19, 2026` |
| Line | `2025 MLB - Inception Hobby -CSE` |
| SKU | `FGC006483-CSE` |
| Product type | `Baseball` |

`document_type: offer` · `stage: offered` — not inbound until order submitted.

### Type B — Order submitted (`FC Pro Order Submitted.eml`)

| Field | Example |
|-------|---------|
| Order URL | `https://www.fanaticscollectpro.com/orders/{uuid}` |
| Street date | `June 19, 2026` |
| SKU | `FGC006483-CSE` |
| Description | `2025 MLB - Inception Hobby -CSE` |
| Qty | `2 case(s) at $1,800.00/case` |
| Subtotal | `$3,600.00` |
| ACH discount | `-$87.80` |
| Total | `$3,512.20` |
| Payment | `ACH` |

`document_type: order_confirm` · `stage: ordered`  
**Note:** Invoice sent on ship day; 15-day pay terms per email.

**Parser:** plain-text regex on FC Pro emails is straightforward — no PDF required for order capture.

```json
{
  "source": "topps_fcpro",
  "external_id": "22231a78-7f6c-4e57-ae52-e4a227075b6e",
  "vendor_sku": "FGC006483-CSE",
  "title": "2025 MLB - Inception Hobby -CSE",
  "qty": 2,
  "unit": "case",
  "unit_cost": 1800.00,
  "total": 3512.20,
  "stage": "ordered"
}
```

Extract order UUID from `View Order:` URL.

---

## Topps.com (Shopify storefront)

**From:** `Topps <store+66297495709@t.shopifyemail.com>`  
**Store:** shop.topps.com

### Type A — Order confirmed (`Order US-13980773-S confirmed.eml`)

| Field | Example |
|-------|---------|
| Order | `US-13980773-S` |
| Shopify confirmation | `6561768013981` |
| Line | `2026 Topps Tier One Baseball - Hobby Box × 6` |
| Subtotal / Total | `$2,099.94` |
| Shipping | Economy 5–15 days |

`document_type: order_confirm` · `stage: ordered`

**Parser:** parse plain-text block under `Order summary` — product line uses `×` qty pattern.

```json
{
  "source": "topps_com",
  "external_id": "US-13980773-S",
  "shopify_confirmation": "6561768013981",
  "lines": [{
    "title": "2026 Topps Tier One Baseball - Hobby Box",
    "qty": 6,
    "line_total": 2099.94
  }],
  "stage": "ordered"
}
```

### Type B — Shipment (`A shipment from order US-13935671-S is on the way.eml`)

| Field | Example |
|-------|---------|
| Order | `US-13935671-S` |
| Carrier | FedEx |
| Tracking | `382225319596` |
| Line | `2025 Topps Inception Baseball - Hobby Box × 6` |

`document_type: shipment` · `stage: in_transit` — **update** existing order row by `external_id`.

---

## GTS Distribution

**From:** `billing@gtsdistribution.com`  
**Invoice PDF:** `INV01165443.pdf` (attached to `GTS Sales Invoice INV01165443.eml`)

### Invoice PDF fields

| Field | Example |
|-------|---------|
| Invoice | `INV01165443` |
| Invoice date | `23-Jun-2026` |
| Order number | `SONFL100226514` |
| Delivery number | `SDHFL100159569` |
| Customer code | `23235` |
| Terms | `BANK CARD` |
| Sales rep | `Blake Conklin` |
| Carrier | `UPS` |
| **Tracking** | `1Z2F47020399487431` |

**Line:**

| Col | Value |
|-----|-------|
| Item No | `26PRZMONFWC-BXB` |
| Description | `26 PRZ MONOPOLY WCUP BXB 6/6/4` |
| Ordered / Shipped | `12` / `12` |
| Price | `$24.950` |
| Amount | `$299.40` |

Totals: product `$299.40`, fees, **paid** `$316.39`

`document_type: invoice` · `stage: in_transit` (tracking present)

```json
{
  "source": "gts",
  "external_id": "INV01165443",
  "order_number": "SONFL100226514",
  "tracking": "1Z2F47020399487431",
  "carrier": "UPS",
  "lines": [{
    "vendor_sku": "26PRZMONFWC-BXB",
    "title": "26 PRZ MONOPOLY WCUP BXB 6/6/4",
    "qty": 12,
    "unit_cost": 24.95,
    "line_total": 299.40
  }],
  "total": 316.39,
  "stage": "in_transit"
}
```

**Parser:** PDF table regex; idempotency `gts:invoice:INV01165443`

---

## Panini — Red River ship notice (bonus sample)

**From:** `[AUTOMATED] New Shipment <office@redriverdistribution.com>`  
**File:** `New Shipment (1).eml` (HTML body)

Panini uses **Red River Distribution** for some UPS ship notifications.

| Field | Example |
|-------|---------|
| Tracking | `1ZKH67281213932469` |
| Customer PO | `21-010972` |
| Order No. | `21SO1315481-001` |
| Item No | `20250` (short code — map to Panini SKU) |
| Total Qty | `3` |
| Carrier | UPS |

`document_type: shipment` · `source: panini` · link to invoice/order by PO `21-010972` or sales order prefix `21SO…`

**Parser:** HTML table scrape (`Tracking Number`, `Customer PO`, line rows).

---

## Parser build order (revised)

| Phase | Vendor | Why |
|-------|--------|-----|
| 0 | **Dealernet** | ✅ Highest volume — finish `InboundLine` migration |
| 1 | **Topps.com** | Easy Shopify email text; order + ship |
| 2 | **FC Pro** | Easy plain-text order + offer |
| 3 | **Panini** | PDF orders/invoices + Red River HTML |
| 4 | **GTS** | PDF invoice (lower priority) |

---

## Idempotency keys

| Source | Key |
|--------|-----|
| topps_com | `topps_com:order:{US-13980773-S}` |
| topps_com ship | `topps_com:ship:{US-13935671-S}:{tracking}` |
| topps_fcpro | `topps_fcpro:order:{order_uuid}` |
| panini order | `panini:order:{web_order_id}` |
| panini invoice | `panini:invoice:{VV number}` |
| panini ship | `panini:ship:{tracking}` |
| gts | `gts:invoice:{INV number}` |
| dealernet | `dealernet:offer:{offer_id}` |

---

## Probe script

```powershell
cd shoelessjoes-supplier-py
.\.venv\Scripts\pip.exe install pypdf -q
$env:PYTHONIOENCODING='utf-8'
.\.venv\Scripts\python.exe ..\shoelessjoes-ops\scripts\probe-vendor-eml.py
```

---

## Open items

- [ ] FC Pro **invoice on ship day** email sample (when available)
- [ ] Topps.com line-item **unit price** on confirm (current sample has line total only)
- [ ] Panini SKU / item `20250` → full SKU mapping
- [ ] GTS item → UPC if on publisher sheet
- [ ] Whether `New Shipment` always pairs with Panini invoice `VV*` or `21SO*` orders
