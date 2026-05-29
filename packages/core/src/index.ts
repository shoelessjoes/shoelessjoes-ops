export { normalizeUpc, normalizeDealernetTitle } from "./normalize.js";
export { matchOfferLineToVariant, type VariantIndexEntry } from "./mapping.js";
export type { DealernetLoginConfig } from "./dealernet/types.js";
export { recommendPriceAction, type PriceInputs, type PriceAction } from "./pricing.js";
export {
  syncAcceptedOffersToShopify,
  fetchVariantIndex,
  type SyncMode,
  type SyncOfferLineInput,
  type SyncResult,
} from "./shopify-sync.js";
export { sendSmtpAlert, type AlertSmtpConfig } from "./notifications.js";
export { collectDealernetOffers, type DealernetOfferLineRow } from "./dealernet/offers.js";
export { collectDealernetMessages, type DealernetMessageRow } from "./dealernet/messages.js";
export {
  classifyMessage,
  type ClassifiedMessage,
  type DealernetMessageType,
} from "./dealernet/classify.js";
export {
  formatMessageDigest,
  type FormattedMessageEmail,
  type DigestMeta,
} from "./dealernet/digest.js";
