# Dealernet offer page — probe matrix & automation map

Inbox messages link to `offer.php?offerid={id}`. This doc tracks what each page state looks like for automation (ingest, sync, tracking).

**Probe tool:** capture DOM snapshot for offer ids (and optional home pending counters):

```powershell
cd shoelessjoes-ops

# Default matrix ids (364263, 364363, 361004)
npm run job:probe-offer

# Specific offers + home pending in/out hints
npm run job:probe-offer -- --offerid 364263 --offerid 364363 --offerid 361004 --home

# Visible browser
npm run job:probe-offer -- --headed --pause 15000
```

Output: `data/offer-probes/offer-{id}.json` and a timestamped bundle JSON.

---

## Reference matrix (your samples)

| Code | State | Side | Example URL | Notes |
|------|--------|------|-------------|--------|
| A | Pending — you Accept/Decline | Sale (buyer sent offer) | *n/a* | Send when **Pending In** counter has a sample |
| B | Pending — waiting on them | Purchase | *n/a* | Send when **Pending Out** counter has a sample |
| C | Accepted, no tracking | Purchase | https://www.dealernetx.com/offer.php?offerid=364263 | |
| D | Accepted + tracking | Purchase | https://www.dealernetx.com/offer.php?offerid=364363 | |
| E | Accepted sale, ready to ship | Sale | *n/a* | Send when available |
| F | Declined or completed/rated | either | https://www.dealernetx.com/offer.php?offerid=361004 | |

When you have pending offers, also note **Purchases → Pending In / Pending Out** and **Sales → Pending In / Pending Out** counts on home/account (probe with `--home`).

---

## Inbox → offer page workflow

| Inbox subject | Typical next step | Automation (target) |
|---------------|-------------------|---------------------|
| New Offer Received | Open offer → Accept / Decline / Revise | Email + offer link; **no auto-accept** |
| Offer Accepted | Offer page shows ACCEPTED | Ingest offer id → Shopify sync |
| Offer Declined | Terminal | Notify only |
| Offer Shipping Updated | Tracking on offer page | Update DB + purchase draft |
| Payment Completed | Sale side | Notify; optional fulfillment nudge |

**You accept on the offer page:** no inbox message; offer appears on **Purchases/Sales — Unrated Only** (homepage badge +1).

**They accept your offer:** inbox **Offer Accepted** → same offer page.

---

## Purchases / sales list filters (context)

- **Unrated Only** — default; homepage badge count; what `ingest-offers` uses (`PURCHASESUNRATED` / `SALESUNRATED`).
- **Last 14 days / All time** — history; offers still exist after rating.
- **Pending In / Pending Out** — counters when counterparty action is needed (capture when available).

Rating (1–5 stars) removes from **Unrated** view only; it does not delete the offer.

---

## Fields we already scrape (list page + partial detail)

From `packages/core/src/dealernet/offers.ts`:

- Offer id, dealer, status badge, created, total
- Line items: title, UPC, qty, unit price, subtotal, listing URL
- Tracking (offer detail `#offerdata` table)
- Case qty (from listing page legend)

**To map via probe:** tabs, Accept/Decline/Revise buttons, payment/shipment sections, rated/declined UI.

---

## After probe run

1. Open `data/offer-probes/offer-364263.json` (etc.) and fill tab/button notes below.
2. Add pending A/B/E URLs when available.
3. Wire `Offer Accepted` classifier + single-offer ingest (separate task).

### Probe notes (2026-06-13 run)

**Offer page tabs** are `button.tablinks`: **Pay To | Details | Items | Messages | Documents** (+ **Update Listings** action).

**Details tab** (default) includes labeled rows: Offer Id, Status, Member Status, Offer Total, Payment Timing/Method, Created, **Shipping** (carrier + `Tracking: …`), **Transaction Rating** (1–5), Admin Assistance.

**Home (with `--home`):**

- Purchases (17) → `PURCHASESUNRATED`
- Sales (22) → `SALESUNRATED`
- Also: `PURCHASES` / `PURCHASESALL`, `SALES` / `SALESALL`

#### Offer #364263 (C — accepted purchase, no tracking)

- Status: ACCEPTED
- Shipping: (empty on Details at probe time)

#### Offer #364363 (D — accepted purchase + tracking)

- Status: ACCEPTED
- Shipping field: `UPS on 06/11/2026 Tracking: 1ZV15H760335239776`
- Items: 15× blaster @ $48.50, UPC 887521143436

#### Offer #361004 (F — you labeled declined/rated)

- Probe still showed **ACCEPTED** on Details; check **Transaction Rating** row and whether rated offers keep ACCEPTED status in Dealernet UI.

#### Still needed from you

- **A / B** — pending in/out sample URLs when counters appear
- **E** — accepted sale ready to ship
