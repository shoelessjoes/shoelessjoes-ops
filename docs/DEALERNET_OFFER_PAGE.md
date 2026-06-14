# Dealernet offer page — probe matrix & automation map

Inbox messages link to `offer.php?offerid={id}`. This doc tracks what each page state looks like for automation (ingest, sync, tracking).

**Probe tool:** capture DOM snapshot for offer ids (and optional home pending counters):

```powershell
cd shoelessjoes-ops

# Default matrix ids (364263, 364363, 361004)
npm run job:probe-offer

# Specific offers + home pending in/out hints
npm run job:probe-offer -- --offerid 364263 --offerid 364363 --offerid 361004 --home

# Pending Out list + probe first 3 offer detail pages
npm run job:probe-offer -- --filter PENDINGOUT --max-details 3

# Pending In (counterparty waiting on you)
npm run job:probe-offer -- --filter PENDINGIN --max-details 3

# Single pending sale offer
npm run job:probe-offer -- --offerid 365842

# Visible browser
npm run job:probe-offer -- --headed --pause 15000
```

Output: `data/offer-probes/offer-{id}.json` and a timestamped bundle JSON.

---

## Reference matrix (your samples)

| Code | State | Side | Example URL | Notes |
|------|--------|------|-------------|--------|
| A | Pending — you Accept/Decline | Sale (buyer sent offer) | https://www.dealernetx.com/offer.php?offerid=365842 | **PENDINGIN** — Sell To CA-DS, $380 EFT |
| B | Pending — waiting on them | Purchase | https://www.dealernetx.com/offers.php?offerfilter=PENDINGOUT | **Pending Out** — you sent offer, awaiting counterparty |
| C | Accepted, no tracking | Purchase | https://www.dealernetx.com/offer.php?offerid=364263 | |
| D | Accepted + tracking | Purchase | https://www.dealernetx.com/offer.php?offerid=364363 | |
| E | Accepted sale, ready to ship | Sale | *n/a* | Send when available |
| F | Declined or completed/rated | either | https://www.dealernetx.com/offer.php?offerid=361004 | |

**List URLs:**

- Pending In: `https://www.dealernetx.com/offers.php?offerfilter=PENDINGIN` (floating badge on every page when count > 0)
- Pending Out: `https://www.dealernetx.com/offers.php?offerfilter=PENDINGOUT`

When you have pending offers, also note **Purchases → Pending In / Pending Out** and **Sales → Pending In / Pending Out** counts on home/account (probe with `--home`).

---

## Pending vs accepted offer page UI

### Pending (A / B) — `pagePhase: pending`

**Header:** `Offer #365842: Sell To CA-DS` with status badge **PENDING**

**Primary actions** (visible buttons above tabs):

| Button | Color | Automation note |
|--------|-------|-----------------|
| Accept | Green | **Manual only** — do not auto-click without explicit user request |
| Decline | Red | Manual only |
| Revise | Orange | Manual only |
| Refresh | Gray | Safe to re-fetch |

**Tabs:** **Ship To | Details | Items** (no Pay To, Messages, Documents)

**Default landing tab:** **Details** (not Ship To)

| Tab | Content |
|-----|---------|
| Ship To | Buyer ship-to address (e.g. CA-DS / Diamond Sportscards, San Rafael CA) |
| Details | Offer Id, Status, Member Status, Offer Total, Payment Timing/Method, Created, **Expires** |
| Items | Product link, UPC, Qty, Unit Price, Subtotal |

**Example #365842 (Pending In sale):**

- Buyer: CA-DS (Robert Michener / Diamond Sportscards, San Rafael CA 94901)
- Payment: EFT, upfront (1 business day)
- Total: $380.00
- Item: 25/6 Donruss Road to FIFA World Cup Soccer Hobby box, UPC `746134178665`, qty 1 @ $380
- Expires: 06/16/2026 23:59:59
- Offer notes: `EFT`

**Inbox path:** `New Offer Received` → open offer page → you Accept/Decline/Revise. No Shopify sync until accepted and on unrated list.

### Accepted (C / D / E) — `pagePhase: accepted`

**Tabs:** **Pay To | Details | Items | Messages | Documents** (+ **Update Listings** action)

**Details tab** (default) includes: Offer Id, Status, Member Status, Offer Total, Payment Timing/Method, Created, **Shipping** (carrier + `Tracking: …`), **Transaction Rating** (1–5), Admin Assistance.

---

## Inbox → offer page workflow

| Inbox subject | Typical next step | Automation (target) |
|---------------|-------------------|---------------------|
| New Offer Received | Open offer → Accept / Decline / Revise | Email + offer link; **no auto-accept** |
| Offer Accepted | Offer page shows ACCEPTED | Classified → ingest offer id → Shopify sync |
| Offer Declined | Terminal | Notify only |
| Offer Shipping Updated | Tracking on offer page | Update DB + purchase draft |
| Payment Completed | Sale side | Notify; optional fulfillment nudge |

**You accept on the offer page:** no inbox message; offer appears on **Purchases/Sales — Unrated Only** (homepage badge +1).

**They accept your offer:** inbox **Offer Accepted** → same offer page.

---

## Purchases / sales list filters (context)

- **Unrated Only** — default; homepage badge count; what `ingest-offers` uses (`PURCHASESUNRATED` / `SALESUNRATED`).
- **Last 14 days / All time** — history; offers still exist after rating.
- **Pending In / Pending Out** — counters when counterparty action is needed:
  - **Pending Out** — `offers.php?offerfilter=PENDINGOUT` (you're waiting on them)
  - **Pending In** — `offers.php?offerfilter=PENDINGIN` (they're waiting on you)

Rating (1–5 stars) removes from **Unrated** view only; it does not delete the offer.

---

## Fields we already scrape (list page + partial detail)

From `packages/core/src/dealernet/offers.ts`:

- Offer id, dealer, status badge, created, total
- Line items: title, UPC, qty, unit price, subtotal, listing URL
- Tracking (offer detail `#offerdata` table)
- Case qty (from listing page legend)

**Probe adds** (`offer-probe.ts`): `offerHeadline`, `pagePhase`, `primaryActions`, `shipToText`, all three pending tabs.

---

## Probe notes

**Offer page tabs (accepted)** are `button.tablinks`: **Pay To | Details | Items | Messages | Documents**.

**Offer page tabs (pending)** are `button.tablinks`: **Ship To | Details | Items**.

#### Offer #365842 (A — pending in sale)

- List filter: `PENDINGIN`
- Headline: `Offer #365842: Sell To CA-DS`
- Status: PENDING
- Actions: Accept, Decline, Revise, Refresh
- Default tab: Details
- Ship To: CA-DS buyer address (San Rafael)
- Items: Donruss FIFA WC Hobby, UPC 746134178665, 1× $380

#### Offer #365788 (A — pending in purchase)

- List filter: `PENDINGIN` (2 rows as of 2026-06-13)
- Dealer: from PA-MIDO (Wanted)
- Status: PENDING
- Total: $884.00
- Likely **Buy From PA-MIDO** — you must Accept/Decline/Revise on their wanted listing offer

#### Offer #364263 (C — accepted purchase, no tracking)

- Status: ACCEPTED
- Shipping: (empty on Details at probe time)

#### Offer #364363 (D — accepted purchase + tracking)

- Status: ACCEPTED
- Shipping field: `UPS on 06/11/2026 Tracking: 1ZV15H760335239776`
- Items: 15× blaster @ $48.50, UPC 887521143436

#### Offer #361004 (F — you labeled declined/rated)

- Probe still showed **ACCEPTED** on Details; check **Transaction Rating** row and whether rated offers keep ACCEPTED status in Dealernet UI.

#### Still needed

- **E** — accepted sale ready to ship (post-accept Ship To on sale side)
