import { useState } from "react";

import { formatMoney, type Card } from "./api";
import { CardLookup } from "./components/card-lookup";
import { DemoCredentials } from "./components/demo-credentials";
import { PaymentForm } from "./components/payment-form";
import { PaymentResult } from "./components/payment-result";
import { RechargeForm } from "./components/recharge-form";
import { TurnstileSimulator } from "./components/turnstile-simulator";
import { forgetPayment, resolvePaymentReference } from "./pending-payment";

// Read at render time so tests (and a rebuilt bundle) can switch them.
const simulatorEnabled = () => import.meta.env.VITE_TURNSTILE_SIMULATOR === "true";
const rechargeSimulatorEnabled = () => import.meta.env.VITE_RECHARGE_SIMULATOR === "true";

const assignLocation = (url: string) => window.location.assign(url);

// The API sends the browser back from QPayPro to /?pago=<referencia>, or to
// ?pago=desconocido when QPayPro omits order_id (then this tab's payment).
const paymentReference = () => resolvePaymentReference(new URLSearchParams(window.location.search).get("pago"));

interface AppProps {
  /** Leaves the SPA for the QPayPro checkout; injectable for tests. */
  navigate?: (url: string) => void;
}

// One screen: look up a card, then see its balance, recharge it and, in
// development, simulate turnstile passes (odd/tasks/user-web.md S8-S10); or
// the result of a QPayPro payment (odd/tasks/qpaypro-checkout.md S9-S10).
export function App({ navigate = assignLocation }: AppProps) {
  const [card, setCard] = useState<Card | null>(null);
  const [pago, setPago] = useState(paymentReference);

  const setBalance = (saldo: number) => setCard((current) => (current ? { ...current, saldo } : current));

  const leaveResult = () => {
    window.history.replaceState(null, "", window.location.pathname);
    forgetPayment();
    setPago(null);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8 lg:flex-row lg:items-start">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="flex items-center gap-3">
          <img src="/transmetro-logo.png" alt="" className="h-10 w-10" />
          <h1 className="font-display text-2xl font-extrabold text-primary">Mi tarjeta Transmetro</h1>
        </header>

        {pago !== null ? (
          <PaymentResult referencia={pago} onBack={leaveResult} />
        ) : card === null ? (
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

            <PaymentForm numeroTarjeta={card.numeroTarjeta} navigate={navigate} />

            {rechargeSimulatorEnabled() && <RechargeForm numeroTarjeta={card.numeroTarjeta} onBalance={setBalance} />}

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
      </main>

      {/* Left on wide screens (order-first); below the main content on mobile. */}
      <div className="mx-auto w-full max-w-md lg:order-first lg:w-80 lg:shrink-0">
        <DemoCredentials />
      </div>
    </div>
  );
}
