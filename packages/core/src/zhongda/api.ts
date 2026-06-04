import type {
  ZhongdaApiConfig,
  ZhongdaApiResponse,
  ZhongdaGoodsRow,
} from "./api-types.js";
import { ZhongdaApiError } from "./api-types.js";

const DEFAULT_BASE = "https://us.zhongdacloud.com";

function baseUrl(cfg: ZhongdaApiConfig): string {
  return (cfg.apiBaseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
}

async function parseJson<T>(res: Response): Promise<ZhongdaApiResponse<T>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as ZhongdaApiResponse<T>;
  } catch {
    throw new ZhongdaApiError(`Invalid JSON from ${res.url} (${res.status}): ${text.slice(0, 200)}`);
  }
}

function assertOk<T>(payload: ZhongdaApiResponse<T>, context: string): T {
  if (payload.code !== 0) {
    throw new ZhongdaApiError(`${context}: ${payload.msg}`, payload.code);
  }
  return payload.data;
}

/** Login via REST (same as browser form). Returns bearer token without prefix. */
export async function zhongdaApiLogin(cfg: ZhongdaApiConfig): Promise<string> {
  const body = new URLSearchParams({
    username: cfg.username,
    password: cfg.password,
  });

  const res = await fetch(`${baseUrl(cfg)}/sapi/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new ZhongdaApiError(`Login HTTP ${res.status}`);
  }

  const payload = await parseJson<{ token: string; expires_in: number }>(res);
  const data = assertOk(payload, "Login failed");
  const raw = (data.token ?? "").trim();
  if (!raw) throw new ZhongdaApiError("Login returned empty token");
  return raw.replace(/^bearer\s+/i, "");
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `bearer ${token}` };
}

export async function fetchZhongdaGoodsPage(
  cfg: ZhongdaApiConfig,
  token: string,
  page: number,
): Promise<{ rows: ZhongdaGoodsRow[]; total: number }> {
  const url = `${baseUrl(cfg)}/sapi/goods?page=${page}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new ZhongdaApiError(`GET goods page ${page}: HTTP ${res.status}`);

  const payload = await parseJson<ZhongdaGoodsRow[]>(res);
  if (payload.code !== 0) {
    throw new ZhongdaApiError(`GET goods page ${page}: ${payload.msg}`, payload.code);
  }

  return {
    rows: payload.data ?? [],
    total: payload.count ?? 0,
  };
}

export async function fetchZhongdaGoodsDetail(
  cfg: ZhongdaApiConfig,
  token: string,
  goodsId: number,
): Promise<ZhongdaGoodsRow | null> {
  const url = `${baseUrl(cfg)}/sapi/goods/${goodsId}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new ZhongdaApiError(`GET goods/${goodsId}: HTTP ${res.status}`);

  const payload = await parseJson<ZhongdaGoodsRow>(res);
  if (payload.code !== 0) return null;
  return payload.data ?? null;
}

/** Paginate until a page returns no rows. */
export async function fetchAllZhongdaGoods(cfg: ZhongdaApiConfig): Promise<ZhongdaGoodsRow[]> {
  const token = await zhongdaApiLogin(cfg);
  const all: ZhongdaGoodsRow[] = [];
  let page = 1;
  let total = 0;

  for (;;) {
    const { rows, total: reportedTotal } = await fetchZhongdaGoodsPage(cfg, token, page);
    if (page === 1) total = reportedTotal;
    if (!rows.length) break;
    all.push(...rows);
    if (total > 0 && all.length >= total) break;
    if (rows.length < 10) break; // typical page size fallback
    page += 1;
    if (page > 500) break;
  }

  return all;
}

export async function updateZhongdaGoodsPrice(
  cfg: ZhongdaApiConfig,
  token: string,
  goodsId: number,
  sellPrice: number,
): Promise<void> {
  const attempts: Array<{ url: string; init: RequestInit }> = [
    {
      url: `${baseUrl(cfg)}/sapi/goods/${goodsId}`,
      init: {
        method: "PUT",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ sell_price: sellPrice.toFixed(2) }),
      },
    },
    {
      url: `${baseUrl(cfg)}/sapi/goods/${goodsId}`,
      init: {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ sell_price: sellPrice.toFixed(2) }).toString(),
      },
    },
    {
      url: `${baseUrl(cfg)}/sapi/goods/update`,
      init: {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          id: String(goodsId),
          sell_price: sellPrice.toFixed(2),
        }).toString(),
      },
    },
  ];

  for (const { url, init } of attempts) {
    const res = await fetch(url, init);
    if (res.status === 404) continue;
    const payload = await parseJson<unknown>(res);
    if (payload.code === 0) return;
  }

  throw new ZhongdaApiError(
    `Could not update sell_price for goods id ${goodsId} — run job:vending-diagnose-price-edit to capture the real endpoint`,
  );
}
