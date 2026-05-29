export type DealernetLoginConfig = {
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  username: string;
  password: string;
  slowMoMs?: number;
  navigationTimeoutMs?: number;
  selectorTimeoutMs?: number;
};
