import { useEffect, useState } from "react";

// Sample data so visitors can try the app without real cards. The Transmetro
// cards come from docs/postman/ridership-test-data.sql; the bank card is the
// public QPayPro sandbox test card. QPayPro merchant keys never belong here.
const SAMPLE_CARDS = [
  { numero: "TEST-RID-0001", uso: "Tarjeta activa con saldo: recargue y pase por la talanquera." },
  { numero: "TEST-RID-POOR", uso: "Tarjeta activa con poco saldo: pruebe el saldo insuficiente." },
  { numero: "TEST-RID-BLOCKED", uso: "Tarjeta bloqueada: la talanquera rechaza la entrada." },
];

// Only the card number gets a copy button (copied without spaces).
const QPAYPRO_TEST_CARD: { campo: string; valor: string; copia?: { valor: string; nombre: string } }[] = [
  { campo: "Número", valor: "4111 1111 1111 1111", copia: { valor: "4111111111111111", nombre: "número de tarjeta QPayPro" } },
  { campo: "Vencimiento", valor: "Cualquier fecha futura, por ejemplo 01/30" },
  { campo: "CVV", valor: "Cualquiera de 3 dígitos, por ejemplo 123" },
  { campo: "Correo", valor: "prueba@ejemplo.com" },
];

type CopyState = "idle" | "copied" | "failed";

const COPY_TEXT: Record<CopyState, string> = {
  idle: "Copiar",
  copied: "Copiado",
  failed: "No se pudo copiar",
};

function CopyButton({ value, name }: { value: string; name: string }) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copiar ${name}`}
      className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-primary ring-1 ring-outline hover:bg-gray-100"
    >
      <span aria-live="polite">{COPY_TEXT[state]}</span>
    </button>
  );
}

export function DemoCredentials() {
  return (
    <aside
      aria-labelledby="demo-credentials-title"
      className="h-fit space-y-5 rounded-2xl bg-white p-5 shadow ring-1 ring-outline lg:sticky lg:top-8"
    >
      <div className="space-y-1">
        <h2 id="demo-credentials-title" className="font-display text-lg font-bold text-primary">
          Datos de prueba
        </h2>
        <p className="text-sm text-gray-600">
          Este es un proyecto académico: use solo estos datos de ejemplo, nunca una tarjeta real.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Tarjetas Transmetro</h3>
        <ul className="space-y-2">
          {SAMPLE_CARDS.map((card) => (
            <li key={card.numero} className="rounded-lg bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="select-all font-mono text-sm font-semibold">{card.numero}</p>
                <CopyButton value={card.numero} name={card.numero} />
              </div>
              <p className="text-xs text-gray-600">{card.uso}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Tarjeta de prueba QPayPro (sandbox)</h3>
        <p className="text-xs text-gray-600">Úsela en la página de pago de QPayPro. No genera cobros reales.</p>
        <dl className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
          {QPAYPRO_TEST_CARD.map((item) => (
            <div key={item.campo} className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <dt className="text-xs text-gray-600">{item.campo}</dt>
                <dd className="select-all font-mono">{item.valor}</dd>
              </div>
              {item.copia && <CopyButton value={item.copia.valor} name={item.copia.nombre} />}
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}
