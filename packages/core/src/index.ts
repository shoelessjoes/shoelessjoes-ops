export { normalizeUpc, normalizeUpcCandidates, normalizeDealernetTitle } from "./normalize.js";
export { matchOfferLineToVariant, type VariantIndexEntry } from "./mapping.js";
export type { DealernetLoginConfig } from "./dealernet/types.js";
export { recommendPriceAction, type PriceInputs, type PriceAction } from "./pricing.js";
export { exportSealedCatalog } from "./shopify/catalog-export.js";
export type { CatalogRow } from "./shopify/catalog-export.js";
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
export { parseTrackingFromText, resolveTrackingOfferId } from "./dealernet/tracking.js";
export {
  buildPurchaseDraftTags,
  findDraftOrderIdByOfferTag,
  updateDraftOrderMetadata,
} from "./shopify-draft-orders.js";
export type { ShopifySession } from "./shopify-session.js";
export type {
  ZhongdaVendingConfig,
  ZhongdaProbeResult,
  ZhongdaNetworkLogEntry,
} from "./zhongda/types.js";
export { zhongdaLogin, zhongdaLoginLooksSuccessful } from "./zhongda/login.js";
export { probeZhongdaLogin, diagnoseZhongdaSession } from "./zhongda/probe.js";
export type { ZhongdaApiConfig, ZhongdaGoodsRow } from "./zhongda/api-types.js";
export { ZhongdaApiError } from "./zhongda/api-types.js";
export {
  zhongdaApiLogin,
  fetchAllZhongdaGoods,
  fetchZhongdaGoodsPage,
  fetchZhongdaGoodsDetail,
  updateZhongdaGoodsPrice,
} from "./zhongda/api.js";
export {
  matchShopifyToZhongdaGoods,
  parseMoney as parseZhongdaMoney,
  type ZhongdaMatchResult,
} from "./zhongda/match.js";
