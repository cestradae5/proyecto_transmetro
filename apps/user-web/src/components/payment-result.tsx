import { useCallback, useEffect, useState } from "react";

import { ApiError, formatMoney, getPayment, NETWORK_ERROR_MESSAGE, type Payment, type PaymentState } from "../api";
import { UNKNOWN_PAYMENT } from "../pending-payment";
const NOT_FOUND_MESSAGE = "No encontramos el pago.";

const STATE_MESSAGES: Record<Exclude<PaymentState, "APROBADA">, string> = {
  INICIADA: "Estamos confirmando tu pago...",
  RECHAZADA: "El pago fue rechazado.",
  EXPIRADA: "Pago cancelado o expirado.",
  ERROR: "No se pudo completar el pago.",
};

interface PaymentResultProps {
  referencia: string;
  onBack: () => void;
}

// qpaypro-checkout S10: the browser comes back from QPayPro with
// ?pago=<referencia>; the API (S6) tells how the payment ended.
export function PaymentResult({ referencia, onBack }: PaymentResultProps) {
  const unknown = referencia === UNKNOWN_PAYMENT;
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(unknown ? NOT_FOUND_MESSAGE : null);
  const [retryable, setRetryable] = useState(false);
  const [loading, setLoading] = useState(!unknown);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      setPayment(await getPayment(referencia));
      setError(null);
      setRetryable(false);
    } catch (err) {
      setPayment(null);
      if (err instanceof ApiError) {
        setError(err.status === 404 ? NOT_FOUND_MESSAGE : err.message);
        setRetryable(false);
      } else {
        setError(NETWORK_ERROR_MESSAGE);
        setRetryable(true);
      }
    } finally {
      setLoading(false);
    }
  }, [referencia]);

  useEffect(() => {
    if (!unknown) void check();
  }, [unknown, check]);

  const pending = payment?.estadoPago === "INICIADA";

  return (
    <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-outline-variant">
      <h2 className="font-display text-lg font-bold text-primary">Resultado del pago</h2>
      {loading && payment === null && error === null && <p className="text-sm">Consultando el pago...</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {payment?.estadoPago === "APROBADA" ? (
        <div className="rounded-lg bg-secondary-container/40 p-3 text-sm">
          <p className="font-semibold text-secondary">Recarga exitosa</p>
          <p>
            Comprobante: <strong>{payment.numeroComprobante}</strong>
          </p>
          <p>{`Monto: ${formatMoney(payment.monto)}`}</p>
          <p>{`Nuevo saldo: ${formatMoney(payment.saldo)}`}</p>
        </div>
      ) : (
        payment && <p className="text-sm font-semibold">{STATE_MESSAGES[payment.estadoPago]}</p>
      )}
      {(pending || retryable) && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void check()}
          className="w-full rounded-lg bg-secondary px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Verificar de nuevo
        </button>
      )}
      <button
        type="button"
        onClick={onBack}
        className="w-full rounded-lg px-4 py-2 font-semibold text-primary ring-1 ring-outline"
      >
        Volver
      </button>
    </section>
  );
}
