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
| C | Accepted, no tracking | Purchase | https://www.dealernetx.com/offer.php?offerid=366037 | Pay To tab — FL-MNPCOLL, $590 PayPal GS |
| D | Accepted + tracking | Purchase | https://www.dealernetx.com/offer.php?offerid=364363 | |
| E | Accepted sale, ready to ship | Sale | https://www.dealernetx.com/offer.php?offerid=365842 | Ship To tab (not Pay To); EFT $380 to CA-DS |
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

### Accepted — `pagePhase: accepted`

Tabs depend on **side**:

| Side | Tabs | First tab content |
|------|------|-------------------|
| **Purchase** (you buy) | Pay To \| Details \| Items \| Documents | **Pay To** — seller name, address, phone, email, payment notes |
| **Sale** (you sell) | Ship To \| Details \| Items \| Documents | **Ship To** — buyer ship-to address; **Items** includes offer line + **Update Listings** editor |

**Header action:** Invoice button (top right). No Accept/Decline.

**Details tab** includes: Offer Id, Status (Accepted date), Member Status, Offer Total, Payment Timing/Method, Transactions (listing fee debit), Created, **Shipping** (or "Not Provided" + Edit link), **Transaction Rating**, Message Dealer.

**Items tab (accepted sale only)** has two sections:

1. **Offer line item** — what sold on this offer (Product, UPC, Qty, Unit Price, Subtotal).
2. **Update Listings** — inline editor for your existing For Sale listing on the same product. Use when the offer qty is less than your listing qty (e.g. sold 1 of 2). Fields: ListingID (link to full editor), Product, UPC, editable **Qty**, editable **Price**, **Active** checkbox, then **Update Listings** button. Uncheck Active or lower Qty to reflect remaining inventory.

**Automation note:** Do not auto-click Update Listings — manual inventory adjustment on Dealernet after partial sale.

#### Offer #366037 (C — accepted purchase, no tracking)

- Headline: `Offer #366037: Purchase From FL-MNPCOLL`
- Pay To: Nikil Patel / MNP collectibles LLC, Lutz FL, phone, email
- Payment: PayPal GS seller covers fees — `contact@shoelessjoescards.com`
- Offer notes: `fnf please`
- Total: $590.00
- Listing fee debit: -$5.90
- Shipping: Not Provided
- Rating: unrated (until 08/12/2026)

#### Offer #365842 (E — accepted sale)

- Headline: `Offer #365842: Sell To CA-DS`
- **Ship To:** Robert Michener (ID VERIFIED) / Diamond Sportscards, 1144 Fourth St, San Rafael CA 94901, 925-876-9961, michdiamond@yahoo.com
- Payment: EFT upfront
- Total: $380.00; listing fee debit -$3.80
- **Offer item:** Donruss FIFA WC Hobby, UPC `746134178665`, 1× $380
- **Update Listings:** ListingID `2408463`, listing had Qty 2 @ $380, Active unchecked (1 sold on offer, 1 remaining)
- Shipping: Not Provided (awaiting your shipment + tracking)

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

**Probe adds** (`offer-probe.ts`): `offerHeadline`, `pagePhase`, `primaryActions`, `payToText`, `shipToText`, `listingAdjustments`, tab crawl.

---

## Probe notes (legacy ids)

See matrix above for current samples. Additional probes:

- **#364363** — purchase + tracking: `UPS … 1ZV15H760335239776`
- **#361004** — rated offer may still show ACCEPTED status in UI
