import type { DealernetLoginConfig } from "@dealernet-ops/core";
import { requireEnv } from "./env.js";

export function loadDealernetLogin(): DealernetLoginConfig {
  return {
    loginUrl: "https://www.dealernetx.com/login.php",
    usernameSelector: "main #userName, main input[name='userName']",
    passwordSelector: "main #userPass, main input[name='userPass']",
    submitSelector: "main button[name='loginBtn']",
    username: requireEnv("DEALERNET_USERNAME"),
    password: requireEnv("DEALERNET_PASSWORD"),
    slowMoMs: 150,
  };
}
