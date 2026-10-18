# Cards module

Staff, read-only view of citizen cards: turnstile passes and recharges per
card. Spec: `odd/tasks/card-activity.md`. The public, unauthenticated card
routes (lookup and simulated recharge) live in `apps/api/src/citizen`.

Every route needs a Bearer token and `RECARGAS_REPORTES_CONSULTAR` (seeded
for `ADMINISTRADOR_SISTEMA` and `OPERADOR_CENTRAL`): no token -> 401, other
roles -> 403. Money is in GTQ and returned as numbers; ids are strings and
dates ISO 8601.

| Method | Path | Result |
|---|---|---|
| GET | `/cards?search=&page=` | `{ total, page, pageSize: 20, items: [{ numeroTarjeta, saldo, estadoTarjeta }] }`, by number |
| GET | `/cards/:numeroTarjeta/activity` | `{ tarjeta, pasadas, recargas }`; unknown card -> 404 "La tarjeta no existe." |

- **Search**: optional, trimmed, max 50 chars; matches part of the number,
  case-insensitive. `%`, `_` and `\` are literal characters. `page` is an
  integer from 1 to 1000000 (default 1). Anything else -> 400.
- **pasadas**: the card's turnstile events, newest first, max 100:
  `{ idEvento, tipo: "ENTRADA" | "SALIDA", montoCobrado, parada: { idParada,
  nombreParada, esEstacion }, fecha }`.
- **recargas**: the card's payment transactions (`tbl_transaccion_pago`),
  newest first, max 100: `{ idTransaccion, referencia, monto, estadoPago,
  origen: "SIMULADA" | "QPAYPRO", numeroComprobante, fecha }`. `origen` is
  `QPAYPRO` when the transaction has a QPayPro id; `numeroComprobante` is the
  receipt of its recharge, `null` while the payment is not approved. Payments
  in any state are listed, so pending or rejected QPayPro payments show up.
