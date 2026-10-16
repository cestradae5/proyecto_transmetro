import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCardActivity, useCards, type CardActivity } from "./hooks/use-card-activity";

// odd/tasks/card-activity.md S5: staff view of each card's turnstile passes and
// recharges. Read-only.

const SEARCH_DEBOUNCE_MS = 300;
const CONTROL =
  "px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30";
const TH = "text-left text-xs font-semibold uppercase tracking-wide text-slate-500 px-3 py-2";
const TD = "px-3 py-2 text-sm text-slate-700";

const CARD_STATE: Record<string, string> = {
  ACTIVA: "Activa",
  BLOQUEADA: "Bloqueada",
  VENCIDA: "Vencida",
  ANULADA: "Anulada",
};

const PAYMENT_STATE: Record<string, string> = {
  INICIADA: "Iniciada",
  PENDIENTE_AUTENTICACION: "Pendiente de autenticación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  ERROR: "Error",
  EXPIRADA: "Expirada",
};

const money = (amount: number) => `Q${amount.toFixed(2)}`;
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-GT", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

function ActivityDetail({ activity }: { activity: CardActivity }) {
  const { tarjeta, pasadas, recargas } = activity;
  return (
    <section aria-label={`Actividad de ${tarjeta.numeroTarjeta}`} className="space-y-6">
      <div className="rounded-2xl bg-primary text-white p-5">
        <p className="font-mono text-lg">{tarjeta.numeroTarjeta}</p>
        <p className="text-sm opacity-80">{CARD_STATE[tarjeta.estadoTarjeta] ?? tarjeta.estadoTarjeta}</p>
        <p className="font-display text-2xl font-bold mt-1">Saldo: {money(tarjeta.saldo)}</p>
      </div>

      <div>
        <h2 className="font-display font-bold text-lg text-slate-900 mb-2">Pasadas por talanquera</h2>
        {pasadas.length === 0 ? (
          <p className="text-sm text-slate-500">Sin pasadas registradas.</p>
        ) : (
          <table aria-label="Pasadas por talanquera" className="w-full border border-slate-100 rounded-xl">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Tipo</th>
                <th className={TH}>Parada</th>
                <th className={TH}>Cobro</th>
              </tr>
            </thead>
            <tbody>
              {pasadas.map((pasada) => (
                <tr key={pasada.idEvento} className="border-t border-slate-100">
                  <td className={TD}>{dateTime(pasada.fecha)}</td>
                  <td className={TD}>{pasada.tipo === "ENTRADA" ? "Entrada" : "Salida"}</td>
                  <td className={TD}>
                    {pasada.parada.esEstacion ? `${pasada.parada.nombreParada} (estación)` : pasada.parada.nombreParada}
                  </td>
                  <td className={TD}>{money(pasada.montoCobrado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h2 className="font-display font-bold text-lg text-slate-900 mb-2">Recargas</h2>
        {recargas.length === 0 ? (
          <p className="text-sm text-slate-500">Sin recargas registradas.</p>
        ) : (
          <table aria-label="Recargas" className="w-full border border-slate-100 rounded-xl">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Monto</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Origen</th>
                <th className={TH}>Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {recargas.map((recarga) => (
                <tr key={recarga.idTransaccion} className="border-t border-slate-100">
                  <td className={TD}>{dateTime(recarga.fecha)}</td>
                  <td className={TD}>{money(recarga.monto)}</td>
                  <td className={TD}>{PAYMENT_STATE[recarga.estadoPago] ?? recarga.estadoPago}</td>
                  <td className={TD}>{recarga.origen === "QPAYPRO" ? "QPayPro" : "Simulada"}</td>
                  <td className={TD}>{recarga.numeroComprobante ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function CardActivityPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  // Only the debounced text reaches the API, so typing does not query per keystroke.
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const cards = useCards(search, page);
  const activity = useCardActivity(selected);
  const total = cards.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (cards.data?.pageSize ?? 20)));

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 fixed top-0 left-0">
        <div className="flex items-center gap-4">
          <button aria-label="Volver" onClick={() => navigate("/landing")} className="text-slate-600 hover:text-slate-900">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <span className="font-display font-bold text-xl text-primary">Transmetro</span>
        </div>
      </header>

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-7xl mx-auto grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="bg-white rounded-3xl border border-slate-200/70 p-6 space-y-4">
          <h1 className="font-display font-bold text-2xl text-slate-900">Tarjetas ({total})</h1>
          <label className="flex flex-col text-xs text-slate-600 gap-1">
            Buscar por número
            <input type="search" className={CONTROL} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </label>

          {cards.error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {cards.error}
            </div>
          )}
          {cards.loading && !cards.data && <p className="text-sm text-slate-500">Cargando...</p>}
          {cards.data && cards.data.items.length === 0 && (
            <p className="text-sm text-slate-500">No hay tarjetas que coincidan.</p>
          )}
          {cards.data && cards.data.items.length > 0 && (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Número</th>
                  <th className={TH}>Estado</th>
                  <th className={TH}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {cards.data.items.map((card) => (
                  <tr
                    key={card.numeroTarjeta}
                    className={`border-t border-slate-100 ${selected === card.numeroTarjeta ? "bg-primary/5" : ""}`}
                  >
                    <td className={TD}>
                      <button
                        type="button"
                        aria-label={`Ver actividad de ${card.numeroTarjeta}`}
                        onClick={() => setSelected(card.numeroTarjeta)}
                        className="font-mono text-primary hover:underline"
                      >
                        {card.numeroTarjeta}
                      </button>
                    </td>
                    <td className={TD}>{CARD_STATE[card.estadoTarjeta] ?? card.estadoTarjeta}</td>
                    <td className={TD}>{money(card.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex items-center justify-between text-sm text-slate-600">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">
              Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">
              Siguiente
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/70 p-6">
          {selected === null && <p className="text-sm text-slate-500">Seleccione una tarjeta para ver su actividad.</p>}
          {selected !== null && activity.error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {activity.error}
            </div>
          )}
          {selected !== null && activity.loading && <p className="text-sm text-slate-500">Cargando actividad...</p>}
          {selected !== null && !activity.loading && activity.data && <ActivityDetail activity={activity.data} />}
        </div>
      </main>
    </div>
  );
}
