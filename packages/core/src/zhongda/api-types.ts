export type ZhongdaApiConfig = {
  apiBaseUrl?: string;
  username: string;
  password: string;
};

export type ZhongdaGoodsRow = {
  id: number;
  goods_name: string;
  goods_no: string;
  cost_price: string | null;
  sell_price: string | null;
  market_price: string | null;
  category_name: string | null;
  goods_unit_name: string | null;
  brand_name: string | null;
  goods_from: string | null;
  image_url: string | null;
  http_image_url: string | null;
  /** Present on detail responses when available. */
  barcode?: string | null;
  upc?: string | null;
};

export type ZhongdaApiResponse<T> = {
  code: number;
  count: number;
  msg: string;
  data: T;
};

export class ZhongdaApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "ZhongdaApiError";
  }
}
