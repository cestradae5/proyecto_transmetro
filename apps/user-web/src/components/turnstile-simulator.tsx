import { useEffect, useRef, useState } from "react";

import {
  ApiError,
  formatMoney,
  listLines,
  NETWORK_ERROR_MESSAGE,
  passTurnstile,
  type Line,
  type TurnstilePass,
  type TurnstileType,
} from "../api";

interface TurnstileSimulatorProps {
  numeroTarjeta: string;
  onBalance: (saldo: number) => void;
}

// S10: development tool that plays the role of a parada turnstile (a station
// is a parada too). Each pass has its own idempotencyKey; repeating the same
// parada and type right after a network error reuses it, so the API never
// charges twice (S7).
// "Línea 6 - Norte - Centro"; the group without line is "Sin línea".
function lineLabel(line: Line): string {
  return line.idLinea === null ? line.nombreLinea : `Línea ${line.numeroLinea} - ${line.nombreLinea}`;
}

export function TurnstileSimulator({ numeroTarjeta, onBalance }: TurnstileSimulatorProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [idParada, setIdParada] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TurnstilePass | null>(null);
  const pendingPass = useRef<{ idParada: string; tipo: TurnstileType; key: string } | null>(null);

  useEffect(() => {
    let active = true;
    listLines()
      .then((list) => {
        if (!active) return;
        setLines(list);
        setIdParada((current) => current || list[0]?.paradas[0]?.idParada || "");
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
      });
    return () => {
      active = false;
    };
  }, []);

  async function send(tipo: TurnstileType) {
    setSending(true);
    setError(null);
    setResult(null);
    const previous = pendingPass.current;
    const attempt =
      previous && previous.idParada === idParada && previous.tipo === tipo
        ? previous
        : { idParada, tipo, key: crypto.randomUUID() };
    pendingPass.current = attempt;
    try {
      const pass = await passTurnstile(numeroTarjeta, Number(idParada), tipo, attempt.key);
      pendingPass.current = null;
      setResult(pass);
      onBalance(pass.saldo);
    } catch (err) {
      if (err instanceof ApiError) {
        // The API answered: this pass is over, the next one is new.
        pendingPass.current = null;
        setError(err.message);
      } else {
        setError(NETWORK_ERROR_MESSAGE);
      }
    } finally {
      setSending(false);
    }
  }

  const disabled = sending || !idParada;

  return (
    <section className="space-y-4 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-6">
      <div>
        <h2 className="font-display text-lg font-bold text-amber-900">Simulador de talanquera</h2>
        <p className="text-sm text-amber-900">Herramienta de desarrollo: simula el paso por la talanquera de una parada.</p>
      </div>
      <div>
        <label htmlFor="turnstile-parada" className="block text-sm font-medium text-amber-900">
          Parada
        </label>
        <select
          id="turnstile-parada"
          value={idParada}
          onChange={(event) => setIdParada(event.target.value)}
          className="mt-1 w-full rounded-lg border-outline"
        >
          {lines.map((line) => (
            <optgroup key={line.idLinea ?? "none"} label={lineLabel(line)}>
              {line.paradas.map((parada) => (
                <option key={`${line.idLinea ?? "none"}-${parada.idParada}`} value={parada.idParada}>
                  {parada.esEstacion ? `${parada.nombreParada} (estación)` : parada.nombreParada}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => send("ENTRADA")}
          className="flex-1 rounded-lg bg-primary px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Entrar
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => send("SALIDA")}
          className="flex-1 rounded-lg bg-primary-container px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Salir
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-1 text-sm text-amber-950">
          <p>{`Cobro: ${formatMoney(result.montoCobrado)}`}</p>
          <p>{`Personas en la parada: ${result.parada.personasEnParada}`}</p>
          {result.alertaGenerada && <p className="font-semibold text-red-700">Se generó una alerta de capacidad</p>}
        </div>
      )}
    </section>
  );
}
