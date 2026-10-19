import { useState, type FormEvent } from "react";

import { ApiError, NETWORK_ERROR_MESSAGE, startPayment } from "../api";

const AMOUNTS = [10, 25, 50, 100] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 100;

interface PaymentFormProps {
  numeroTarjeta: string;
  /** Sends the browser to the QPayPro hosted checkout. */
  navigate: (url: string) => void;
}

// qpaypro-checkout S9: fixed amounts and an email; the API registers the
// payment and answers the hosted checkout URL, where the card is entered.
export function PaymentForm({ numeroTarjeta, navigate }: PaymentFormProps) {
  const [monto, setMonto] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const ready = monto !== null && trimmedEmail.length <= EMAIL_MAX && EMAIL.test(trimmedEmail);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (monto === null || !ready || sending) return;
    setError(null);
    setSending(true);
    try {
      const { checkoutUrl } = await startPayment(numeroTarjeta, monto, trimmedEmail);
      // Stay disabled: the browser is leaving for the checkout.
      navigate(checkoutUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-outline-variant">
      <h2 className="font-display text-lg font-bold text-primary">Recargar saldo</h2>
      <div className="grid grid-cols-4 gap-2">
        {AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            aria-pressed={monto === amount}
            onClick={() => setMonto(amount)}
            className={`rounded-lg px-2 py-2 font-semibold ring-1 ring-outline ${
              monto === amount ? "bg-primary text-white" : "text-primary"
            }`}
          >
            {`Q${amount}`}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="payment-email" className="block text-sm font-medium text-on-surface-variant">
          Correo electrónico
        </label>
        <input
          id="payment-email"
          type="email"
          autoComplete="email"
          maxLength={EMAIL_MAX}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-lg border-outline"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!ready || sending}
        className="w-full rounded-lg bg-secondary px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        Pagar con QPayPro
      </button>
    </form>
  );
}
