# Cards module

Staff view of citizen cards: turnstile passes and recharges per card, plus
the QPayPro payment verify. Specs: `odd/tasks/card-activity.md`,
`odd/tasks/qpaypro-checkout.md` (S7). The public, unauthenticated card
routes (lookup, recharges, QPayPro checkout) live in `apps/api/src/citizen`.

Every route needs a Bearer token and `RECARGAS_REPORTES_CONSULTAR` (seeded
for `ADMINISTRADOR_SISTEMA` and `OPERADOR_CENTRAL`): no token -> 401, other
roles -> 403. Money is in GTQ and returned as numbers; ids are strings and
dates ISO 8601.

| Method | Path | Result |
|---|---|---|
| GET | `/cards?search=&page=` | `{ total, page, pageSize: 20, items: [{ numeroTarjeta, saldo, estadoTarjeta }] }`, by number |
| GET | `/cards/:numeroTarjeta/activity` | `{ tarjeta, pasadas, recargas }`; unknown card -> 404 "La tarjeta no existe." |
| POST | `/cards/:numeroTarjeta/payments/:referencia/verify` | 200 `{ referencia, numeroTarjeta, monto, estadoPago, numeroComprobante, saldo }` |

- **Search**: optional, trimmed, max 50 chars; matches part of the number,
  case-insensitive. `%`, `_` and `\` are literal characters. `page` is an
  integer from 1 to 1000000 (default 1). Anything else -> 400.
- **pasadas**: the card's turnstile events, newest first, max 100:
  `{ idEvento, tipo: "ENTRADA" | "SALIDA", montoCobrado, parada: { idParada,
  nombreParada, esEstacion }, fecha }`.
- **recargas**: the card's payment transactions (`tbl_transaccion_pago`),
  newest first, max 100: `{ idTransaccion, referencia, monto, estadoPago,
  origen: "SIMULADA" | "QPAYPRO", numeroComprobante, fecha }`. `origen` is
  `QPAYPRO` when the referencia starts with `QPP-` (a started QPayPro
  payment has no QPayPro id yet) or the transaction has a QPayPro id; `numeroComprobante` is the
  receipt of its recharge, `null` while the payment is not approved. Payments
  in any state are listed, so pending or rejected QPayPro payments show up.
- **verify** (no body): for an `INICIADA` or `EXPIRADA` QPayPro payment of
  that card, at any age, asks QPayPro about it (the reconciliation in
  `apps/api/src/citizen/README.md`): approved -> credited once (`APROBADA`,
  `QPP-REC-<idRecarga>`, balance + monto), another final status ->
  `RECHAZADA`, unknown -> unchanged (no expiry here). Any other state only
  answers the body. The body is the citizen payment status, with the
  current balance. Unknown card -> 404 "La tarjeta no existe."; an unknown
  referencia, one of another card or one that is not `QPP-` -> 404 "El pago
  no existe.". Repeated or concurrent verifies credit once.
