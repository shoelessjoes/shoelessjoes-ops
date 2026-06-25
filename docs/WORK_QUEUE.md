# Work queue — what stays on your list

**Goal:** One operational view of things that need attention. Done items drop off; history stays in Dealernet/Shopify/email.

See also: `docs/INBOUND_OPS_HANDOFF.md`, `docs/VENDOR_CHANNELS_AND_DASHBOARD.md`, `docs/DEALERNET_OFFER_PAGE.md`, `docs/AGENT_HANDOFF.md`.

---

## Dashboard queues (target)

| Queue | Source | On list until |
|-------|--------|----------------|
| **Pending In** | Dealernet `PENDINGIN` | You Accept / Decline / Revise |
| **Pending Out** | Dealernet `PENDINGOUT` | Counterparty responds (informational) |
| **Purchases inbound** | Dealernet `PURCHASESUNRATED` + ACCEPTED | **Scanned/received in shop** |
| **Sales outbound** | Dealernet `SALESUNRATED` + ACCEPTED | **Shipped + payment received** |
| **eBay to ship** | eBay API (future) | Marked shipped |
| **Vendor inbound** | Gmail invoices (Claude pipeline) | Received in shop (same scan flow) |

**Purchases vs sales exit differently:**

- **Purchase:** Accepted → tracking (still on list) → receive scan → **off list**. Rating optional.
- **Sale:** Accepted → ship + pay → **off list**. Rating optional cleanup.

---

## Dealernet offer lifecycle

```
Pending In  →  you accept  →  Unrated purchase/sale  →  done (rules above)
Pending Out →  they accept →  inbox "Offer Accepted" →  ingest + sync
```

**Inbox-driven (built / in progress):**

| Message | Action |
|---------|--------|
| New Offer Received | Email + link; manual Accept/Decline |
| Offer Accepted | Classify → ingest offer → Shopify sync |
| Offer Declined | Notify only |
| Offer Shipping Updated | Tracking → DB → draft order |
| Price Alert Triggered | Loud email (pricing table, not inbox SMS) |

**You accept on offer page:** no inbox message; unrated count +1.

---

## Multi-channel inbound (normalized shape)

All sources should map to the same row shape for the dashboard + receive scan:

```
source:     dealernet | ebay | topps | panini | gts
direction:  inbound | outbound
stage:      pending_action | awaiting_ship | in_transit | ready_to_receive | ready_to_ship | done
```

- **Dealernet purchases** + **vendor Gmail** → inbound → receive scan clears
- **Dealernet sales** + **eBay** → outbound → ship + pay clears

---

## Tracking sources (purchases)

| Source | Status | Notes |
|--------|--------|-------|
| Dealernet offer page / inbox | Built | `poll-messages`, ingest with `fetchOfferTracking` |
| **UPS business account** | Planned | Email alerts or [UPS Track Alert API](https://developer.ups.com/) — cross-ref `1Z…` to open inbound lines |
| Shopify tracking apps | Skip for now | Often clunky; we own draft PO notes + receive queue |

Target: merge Dealernet tracking + UPS notifications into one inbound shipment row; update draft order + dashboard when status changes (shipped, out for delivery, delivered → ready to receive).

| Piece | Status |
|-------|--------|
| `ingest-offers` (unrated purchases/sales) | Built |
| `InboundLine` + sync after ingest | Built — `/app/queue` |
| `poll-messages` + classify (incl. Offer Accepted/Declined) | Built |
| `sync-offers` purchase/sale | Built (execute is manual gate) |
| `probe-offer` + offer page matrix | Built |
| Pending In/Out ingest for dashboard | To add |
| Sale "shipped + paid" auto-done | To add |
| Receive scan UI | To build (`apps/web`) |
| Gmail invoice ingest | Claude building |
| eBay pending ship | Future |

---

## Offer page reference (probe)

```powershell
npm run job:probe-offer -- --filter PENDINGIN --max-details 3
npm run job:probe-offer -- --offerid 365842
```

Matrix samples in `docs/DEALERNET_OFFER_PAGE.md` (pending sale #365842, purchase Pay To #366037, etc.).
