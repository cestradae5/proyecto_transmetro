import { useState, type FormEvent } from "react";

import { ApiError, getCard, NETWORK_ERROR_MESSAGE, type Card } from "../api";

interface CardLookupProps {
  onFound: (card: Card) => void;
}

// S8: the card number is the only identity (no login).
export function CardLookup({ onFound }: CardLookupProps) {
  const [numero, setNumero] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = numero.trim();
    if (!trimmed) {
      setError("Ingrese el número de tarjeta.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      onFound(await getCard(trimmed));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-outline-variant">
      <h2 className="font-display text-xl font-bold text-primary">Consultar mi tarjeta</h2>
      <div>
        <label htmlFor="card-number" className="block text-sm font-medium text-on-surface-variant">
          Número de tarjeta
        </label>
        <input
          id="card-number"
          value={numero}
          onChange={(event) => setNumero(event.target.value)}
          autoComplete="off"
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
        disabled={loading}
        className="w-full rounded-lg bg-primary px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        Consultar
      </button>
    </form>
  );
}
