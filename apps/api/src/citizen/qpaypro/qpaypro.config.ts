export const QPAYPRO_SANDBOX_URL = "https://sandboxpayments.qpaypro.com";

export interface QpayproEnv {
  login?: string;
  apiKey?: string;
  privateKey?: string;
  // Used only by the transaction query (S7, T4).
  apiSecret?: string;
  baseUrl: string;
  apiPublicUrl?: string;
  userWebUrl?: string;
}

export type QpayproCheckoutConfig = Required<Omit<QpayproEnv, "apiSecret">> & Pick<QpayproEnv, "apiSecret">;

const value = (name: string): string | undefined => {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
};
const withoutSlash = (url: string | undefined) => url?.replace(/\/+$/, "");

// qpaypro-checkout S2. Read on each request, like RechargeSimulatorGuard, so
// a deploy can change it without a restart of the module graph.
export function readQpayproEnv(): QpayproEnv {
  return {
    login: value("QPAYPRO_LOGIN"),
    apiKey: value("QPAYPRO_API_KEY"),
    privateKey: value("QPAYPRO_PRIVATE_KEY"),
    apiSecret: value("QPAYPRO_API_SECRET"),
    baseUrl: withoutSlash(value("QPAYPRO_BASE_URL")) ?? QPAYPRO_SANDBOX_URL,
    apiPublicUrl: withoutSlash(value("API_PUBLIC_URL")),
    userWebUrl: withoutSlash(value("USER_WEB_URL")),
  };
}

// Everything S3 needs to start a payment, or null (503).
export function readCheckoutConfig(): QpayproCheckoutConfig | null {
  const env = readQpayproEnv();
  if (!env.login || !env.apiKey || !env.privateKey || !env.apiPublicUrl || !env.userWebUrl) return null;
  return env as QpayproCheckoutConfig;
}

// The credential values, so error messages can be scrubbed before they are
// stored or logged.
export function qpayproSecrets(): string[] {
  const env = readQpayproEnv();
  return [env.login, env.apiKey, env.privateKey, env.apiSecret].filter(
    (secret): secret is string => secret !== undefined && secret.length >= 4,
  );
}

export function redactSecrets(text: string): string {
  // Longest first, so a secret that contains another is replaced whole.
  const secrets = qpayproSecrets().sort((a, b) => b.length - a.length);
  return secrets.reduce((result, secret) => result.split(secret).join("***"), text);
}
