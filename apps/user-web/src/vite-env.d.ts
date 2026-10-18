/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** "true" renders the turnstile simulator (development tool). */
  readonly VITE_TURNSTILE_SIMULATOR?: string;
  /** "true" also offers the simulated recharge (development tool). */
  readonly VITE_RECHARGE_SIMULATOR?: string;
  /** Shipped in the public bundle: only for the simulator. */
  readonly VITE_TURNSTILE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
