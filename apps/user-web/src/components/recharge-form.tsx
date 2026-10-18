import { useRef, useState, type FormEvent } from "react";

import { ApiError, formatMoney, rechargeCard, type Recharge } from "../api";

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const MIN = 1;
const MAX = 500;

interface RechargeFormProps {
  numeroTarjeta: string;
  onBalance: (saldo: number) => void;
}

// S9: simulated recharge. One referencia per attempt: a retry of the same
// amount after a network error reuses it, so the API never charges twice.
export function RechargeForm({ numeroTarjeta, onBalance }: RechargeFormProps) {
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Recharge | null>(null);
  const pendingAttempt = useRef<{ monto: number; referencia: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = amount.trim();
    const monto = Number(text);
    if (!AMOUNT.test(text) || monto < MIN || monto > MAX) {
      setError("Ingrese un monto entre Q1.00 y Q500.00 con hasta 2 decimales.");
      return;
    }

    const attempt =
      pendingAttempt.current?.monto === monto ? pendingAttempt.current : { monto, referencia: crypto.randomUUID() };
    pendingAttempt.current = attempt;
    setError(null);
    setReceipt(null);
    setSending(true);
    try {
      const result = await rechargeCard(numeroTarjeta, monto, attempt.referencia);
      pendingAttempt.current = null;
      setReceipt(result);
      onBalance(result.saldo);
    } catch (err) {
      if (err instanceof ApiError) {
        // The API answered: this attempt is over, the next one is new.
        pendingAttempt.current = null;
        setError(err.status === 404 ? "Las recargas no están disponibles." : err.message);
      } else {
        setError("No se pudo conectar con el servidor. Intente de nuevo.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-outline-variant">
      <h2 className="font-display text-lg font-bold text-primary">Recargar saldo</h2>
      <p className="text-sm text-on-surface-variant">Recarga simulada: no se realiza ningún cobro real.</p>
      <div>
        <label htmlFor="recharge-amount" className="block text-sm font-medium text-on-surface-variant">
          Monto a recargar (Q)
        </label>
        <input
          id="recharge-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="mt-1 w-full rounded-lg border-outline"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {receipt && (
        <div className="rounded-lg bg-secondary-container/40 p-3 text-sm">
          <p className="font-semibold text-secondary">Recarga exitosa</p>
          <p>
            Comprobante: <strong>{receipt.numeroComprobante}</strong>
          </p>
          <p>{`Monto: ${formatMoney(receipt.monto)}`}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-lg bg-secondary px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {sending ? "Recargando..." : "Recargar"}
      </button>
    </form>
  );
}
