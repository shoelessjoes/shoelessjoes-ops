export type ZhongdaVendingConfig = {
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  /** Tried in order until one clicks successfully. */
  submitSelectors: string[];
  /** Login failed if final URL still contains any of these fragments. */
  successUrlExcludes?: string[];
  /** Optional post-login DOM hints. */
  successSelectors?: string[];
  username: string;
  password: string;
  slowMoMs?: number;
  navigationTimeoutMs?: number;
  selectorTimeoutMs?: number;
};

export type ZhongdaProbeResult = {
  ok: boolean;
  finalUrl: string;
  submitSelectorUsed: string | null;
  screenshotPath: string | null;
  error: string | null;
};

export type ZhongdaNetworkLogEntry = {
  ts: string;
  method: string;
  url: string;
  status: number | null;
  resourceType: string;
  postDataPreview: string | null;
};
