// The QPayPro sandbox credits the payment through a relay call that carries
// order_id, but sends the payer's browser back to the relay without it, so the
// API can only answer ?pago=desconocido. The tab that started the payment
// remembers its referencia (sessionStorage survives the round trip to the
// checkout in the same tab) and uses it when the URL does not name one.
const KEY = "transmetro.pendingPayment";

// The API's redirect when the relay or cancel names no known payment.
export const UNKNOWN_PAYMENT = "desconocido";

// Storage can be unavailable (privacy modes); the result then falls back to
// the referencia in the URL, as before.
export function rememberPayment(referencia: string): void {
  try {
    window.sessionStorage.setItem(KEY, referencia);
  } catch {
    // Not remembered: a ?pago=desconocido return shows "not found".
  }
}

export function forgetPayment(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}

export function resolvePaymentReference(fromUrl: string | null): string | null {
  if (fromUrl !== UNKNOWN_PAYMENT) return fromUrl;
  try {
    return window.sessionStorage.getItem(KEY) ?? fromUrl;
  } catch {
    return fromUrl;
  }
}
