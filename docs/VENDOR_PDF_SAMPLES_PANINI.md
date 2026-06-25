# Panini — sample PDF analysis & parser spec

**Last updated:** 2026-06-25  
**Samples:** `data/vendor-samples/panini/` (copied from owner Automation Assets bundle)

Related: `VENDOR_CHANNELS_AND_DASHBOARD.md` · `INBOUND_OPS_HANDOFF.md`

---

## What you sent (4 files)

| File | Type | Parse for inbound? |
|------|------|-------------------|
| `Ordine_Web_282946.pdf` | **Web order proposal** (B2B portal PDF) | ✅ Yes — line items + totals |
| `Shoeless Joe_s Mail - Invoice_ VV100249742….pdf` | **Gmail “print to PDF”** wrapper | ❌ No — use attachment instead |
| `Shoeless Joe_s Mail - Web order proposal n.285595….pdf` | **Gmail wrapper** + references `Ordine_Web_285595.pdf` | ❌ No — use `Ordine_Web_285595.pdf` |
| `OFFER EMAIL 1 - 2024-25 Select Basketball….pdf` | **Presell / allocation offer** (sales email) | 🟡 Optional — catalog window, not a purchase |

**All four are Panini America** — no Topps or GTS in this batch.

### Gmail rule

Ingest pipeline must use:

1. **PDF attachments** from Gmail API / Apps Script (`10275_VV*.pdf`, `Ordine_Web_*.pdf`)
2. **HTML body** for short emails (order confirm text)

Do **not** parse “Save as PDF” Gmail thread exports — they only contain headers and attachment filenames.

---

## Document types & lifecycle

```text
OFFER email (presell)     →  stage: offered     — SKU, release date, order due date
Ordine_Web_*.pdf          →  stage: ordered     — web order proposal, wait for confirmation
Email “order proposal”    →  stage: ordered     — links to Ordine PDF
Invoice VV*.pdf           →  stage: invoiced/shipped — lines + UPS tracking
```

Customer code **10275** = Shoeless Joe's on all samples.

---

## Type A — `Ordine_Web_{order_id}.pdf` (order proposal)

**Examples:** `Ordine_Web_282946.pdf`, `Ordine_Web_285595.pdf`

**Header fields:**

| Field | Example |
|-------|---------|
| Order date | `03/06/2025 22:53` |
| Customer code | `10275` |
| Customer | `Shoeless Joe's` |
| Web order proposal | `285595` |
| Status text | `Wait for order confirmation` |
| Payment | `Credit Card` |
| Ship-to | `6123 Bridgetown Road 45248 Cincinnati (OH) US` |

**Line table:**

| Column | Example |
|--------|---------|
| Code (vendor SKU) | `2-18082-20` (may wrap across lines) |
| Description | `BK SELECT (24-25) TC - HOBBY MEGA BOX - 4/10/20 - H` |
| Quantity | `5` |
| Price List / Net / Total | `700.00` → line total `3,500.00` |

**Footer:** `Total USD`, `Shipping USD`, `Final Total USD`

**Normalized output:**

```json
{
  "source": "panini",
  "document_type": "web_order_proposal",
  "external_id": "285595",
  "order_date": "2025-06-03",
  "customer_code": "10275",
  "stage": "ordered",
  "currency": "USD",
  "subtotal": 3500.00,
  "shipping": 52.50,
  "total": 3552.50,
  "lines": [{
    "vendor_sku": "2-18082-20",
    "title": "BK SELECT (24-25) TC - HOBBY MEGA BOX - 4/10/20 - H",
    "qty": 5,
    "unit_cost": 700.00,
    "line_total": 3500.00
  }]
}
```

**Note:** Panini SKU is **not UPC** — map via `sku_mapping` table or future Panini catalog; crosswalk to Shopify barcode when known.

---

## Type B — `10275_VV{invoice}_{sales_order}.pdf` (invoice + tracking)

**Example:** `10275_VV100249742_21-332718.pdf`

**Header fields:**

| Field | Example |
|-------|---------|
| Invoice number | `VV100249742` |
| Sales order | `21SO1210802` |
| PO Number | `21-010829` |
| Customer number | `10275` |
| Invoice date | `6/18/2025` |
| Requested ship date | `5/29/2025` |
| Delivery mode | `UPS_Ground` |
| Payment terms | `PAID UP FRONT` |

**Line table:**

| Column | Example |
|--------|---------|
| Item number | `2-17915-20` |
| Description | `FB SELECT (24-25) HOBBY BLASTER-4/6/20-H` |
| Quantity | `3.00` |
| Unit | `CS` (case) |
| Unit price | `420.00` |
| Amount | `1,260.00` |
| **Tracking** | `1ZKG8952122125` |

**Totals:** subtotal, tax, total `1,278.90 USD`

**Normalized output:**

```json
{
  "source": "panini",
  "document_type": "invoice",
  "external_id": "VV100249742",
  "sales_order": "21SO1210802",
  "po_number": "21-010829",
  "invoice_date": "2025-06-18",
  "stage": "in_transit",
  "tracking": "1ZKG8952122125",
  "carrier": "UPS_Ground",
  "lines": [{
    "vendor_sku": "2-17915-20",
    "title": "FB SELECT (24-25) HOBBY BLASTER-4/6/20-H",
    "qty": 3,
    "unit": "CS",
    "unit_cost": 420.00,
    "line_total": 1260.00
  }]
}
```

**Case qty:** `Unit: CS` with qty `3` = 3 cases — expand to boxes when case pack known (e.g. `4/6/20` in description → parse case configuration).

Link invoice → prior web order by matching `vendor_sku` + customer + date window, or `PO Number` when consistent.

---

## Type C — Presell offer email PDF (optional)

**Example:** `OFFER EMAIL 1 - 2024-25 Select Basketball - Ready to Order.pdf`

Extract for **catalog / dashboard**, not inbound receipt:

| Field | Example |
|-------|---------|
| Program | `2024-25 Select Basketball` |
| SKU | `2-18049-12` |
| Order due date | `Wednesday, May 28, 2025` |
| Release date | `Wednesday, June 18, 2025` |
| Internet Box MAPP | `$450.00` |

`stage: offered` — reminds you to place order before due date; can seed draft product placeholder if SKU mapped to UPC.

---

## Gmail senders (from samples)

| From | Use |
|------|-----|
| `invoices@paniniamerica.net` | Invoice attachments `10275_VV*.pdf` |
| `info@panini.it` / `b2b_us@panini.it` | Web order proposals + `Ordine_Web_*.pdf` |
| `cheady@paniniamerica.net` (and sales reps) | Presell offer emails |

**Suggested Gmail labels:**

- Use **existing** owner labels — see `VENDOR_EMAIL_SAMPLES.md` (not a new `Invoices/…` tree).

---

## Parser implementation notes

1. **Prefer attachment filename patterns:**
   - `Ordine_Web_(\d+)\.pdf`
   - `10275_VV(\d+)_*.pdf`

2. **Regex anchors:** `Panini America`, `Web order proposal`, `Invoice number`, `Item number`, `Tracking`

3. **SKU format:** `\d-\d{5}-\d{2}` (e.g. `2-18049-12`)

4. **Case expansion:** parse `4/6/20` or `5/12/12` from description → packs per box / boxes per case (align with Dealernet `caseQtyBoxes`)

5. **Idempotency keys:**
   - Order: `panini:order:{web_order_id}`
   - Invoice: `panini:invoice:{VV number}`

6. **Libraries:** `pypdf` or `pdfplumber` in worker; validate with samples in `data/vendor-samples/panini/`

---

## Test command (local)

```powershell
cd shoelessjoes-ops
# When parser exists:
# node --import tsx apps/worker/src/jobs/parse-vendor-pdf.ts --vendor panini --file data/vendor-samples/panini/10275_VV100249742_21-332718.pdf
```

---

## Still needed from owner

- [ ] Topps.com / Topps Direct sample PDFs
- [ ] GTS Distribution sample invoice PDFs
- [ ] Panini SKU → UPC mapping sheet (if Panini provides)
- [ ] Confirm case qty for `2-17915-20` BLASTER (`CS` × 3 on invoice)
