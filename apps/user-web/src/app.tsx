import { useState } from "react";

import { formatMoney, type Card } from "./api";
import { CardLookup } from "./components/card-lookup";
import { RechargeForm } from "./components/recharge-form";
import { TurnstileSimulator } from "./components/turnstile-simulator";

// Read at render time so tests (and a rebuilt bundle) can switch it.
const simulatorEnabled = () => import.meta.env.VITE_TURNSTILE_SIMULATOR === "true";

// One screen: look up a card, then see its balance, recharge it and, in
// development, simulate turnstile passes (odd/tasks/user-web.md S8-S10).
export function App() {
  const [card, setCard] = useState<Card | null>(null);

  const setBalance = (saldo: number) => setCard((current) => (current ? { ...current, saldo } : current));

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-center gap-3">
        <img src="/transmetro-logo.png" alt="" className="h-10 w-10" />
        <h1 className="font-display text-2xl font-extrabold text-primary">Mi tarjeta Transmetro</h1>
      </header>

      {card === null ? (
        <CardLookup onFound={setCard} />
      ) : (
        <>
          <section className="space-y-3 rounded-2xl bg-primary p-6 text-white shadow">
            <p className="text-sm opacity-80">Tarjeta</p>
            <p className="font-mono text-lg">{card.numeroTarjeta}</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm opacity-80">Saldo</p>
                <p className="font-display text-3xl font-bold">{formatMoney(card.saldo)}</p>
              </div>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{card.estadoTarjeta}</span>
            </div>
          </section>

          <RechargeForm numeroTarjeta={card.numeroTarjeta} onBalance={setBalance} />

          {simulatorEnabled() && <TurnstileSimulator numeroTarjeta={card.numeroTarjeta} onBalance={setBalance} />}

          <button
            type="button"
            onClick={() => setCard(null)}
            className="rounded-lg px-4 py-2 font-semibold text-primary ring-1 ring-outline"
          >
            Consultar otra tarjeta
          </button>
        </>
      )}
    </div>
  );
}
