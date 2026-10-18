# Citizen module

Public endpoints used by `apps/user-web`. Specs: `odd/tasks/user-web.md`,
`odd/tasks/qpaypro-checkout.md` (QPayPro payments).
There is no citizen login: the card number identifies the card. Money is in
GTQ and returned as numbers; ids are strings and dates ISO 8601.

| Method | Path | Result |
|---|---|---|
| GET | `/citizen/cards/:numeroTarjeta` | `{ numeroTarjeta, saldo, estadoTarjeta }`; unknown card -> 404 "La tarjeta no existe." |
| GET | `/citizen/lines` | `[{ idLinea, numeroLinea, nombreLinea, paradas: [{ idParada, nombreParada, orden, esEstacion }] }]`: `ACTIVA` lines by number with their `ACTIVA` paradas in route order (a parada on two lines appears in both); last, if any, `{ idLinea: null, numeroLinea: null, nombreLinea: "Sin línea" }` with the `ACTIVA` paradas on no `ACTIVA` line, by name, `orden: null`. Every active parada appears; a station is a parada with `esEstacion: true` |
| POST | `/citizen/cards/:numeroTarjeta/recharges` | `{ monto, referencia }` -> 201 `{ idRecarga, numeroComprobante, monto, saldo, fechaRecarga, repetida }` |
| POST | `/citizen/cards/:numeroTarjeta/payments` | `{ monto, email }` -> 201 `{ referencia, checkoutUrl }` (QPayPro) |
| GET | `/citizen/payments/qpaypro/relay` | Browser return from QPayPro -> 302 `{USER_WEB_URL}/?pago=<referencia>` |
| GET | `/citizen/payments/qpaypro/cancel?referencia=` | Payer cancelled -> 302 `{USER_WEB_URL}/?pago=<referencia>` |
| GET | `/citizen/payments/:referencia` | `{ referencia, numeroTarjeta, monto, estadoPago, numeroComprobante, saldo }`; unknown -> 404 "El pago no existe." |

## QPayPro payments (hosted checkout)

The API registers the transaction with QPayPro server to server, the SPA
sends the browser to QPayPro's page, and QPayPro sends the browser back to
the relay URL. There is no server notification and no cron.

Environment (read on each request):

| Variable | Use |
|---|---|
| `QPAYPRO_LOGIN`, `QPAYPRO_API_KEY` | Sent to `register_transaction_store` |
| `QPAYPRO_PRIVATE_KEY` | Verifies the relay's `order_hash`; never sent to QPayPro at registration |
| `QPAYPRO_API_SECRET` | Only for the transaction query (S7); not needed to start a payment |
| `QPAYPRO_BASE_URL` | Default `https://sandboxpayments.qpaypro.com` |
| `API_PUBLIC_URL` | Public base of this API: relay and cancel URLs |
| `USER_WEB_URL` | Where the browser lands after paying or cancelling |

Without login, api key, private key, `API_PUBLIC_URL` or `USER_WEB_URL`,
`POST .../payments` answers 503 "Los pagos con QPayPro no están
disponibles." and stores nothing. Credentials are never returned, stored or
logged: QPayPro messages are scrubbed of them.

1. **Start** (`POST /citizen/cards/:numeroTarjeta/payments`): `monto` is
   exactly 10, 25, 50 or 100; `email` a valid email, max 100 chars (else
   400). Unknown card -> 404, card not `ACTIVA` -> 409. Stores one
   `tbl_transaccion_pago` `INICIADA` with `referencia_pago = QPP-<uuid>`,
   then POSTs multipart to `{QPAYPRO_BASE_URL}/checkout/register_transaction_store`
   with `x_fp_sequence` = the payment's fp sequence, `x_relay_url` and
   `x_url_cancel` (15 s timeout). On a token -> 201 with
   `checkoutUrl = {QPAYPRO_BASE_URL}/checkout/woocommerce?token=<token>`.
   Otherwise the row becomes `ERROR` with QPayPro's message in
   `mensaje_respuesta` and the API answers 502 "No se pudo iniciar el pago
   con QPayPro.". The email goes to QPayPro only and is never stored.
   The fp sequence (`fpSequenceFor`, L10) is a 10-digit number, first digit
   1-9: the first 64 bits of `sha256(referencia)` mapped into
   `[1000000000, 9999999999]`. It is recomputed from the referencia, never
   stored; a small row id could match another merchant's transaction on the
   shared sandbox login.
2. **Relay** (`GET .../relay?order_id&x_trans_id&x_amount&x_response_status&order_hash`):
   `order_hash` must be `sha256(order_id|x_trans_id|x_amount|x_response_status|QPAYPRO_PRIVATE_KEY)`
   (raw `x_amount`, constant-time compare) and `x_amount` must equal
   `monto_pago`; otherwise nothing changes. Status `1` -> `APROBADA`, one
   `tbl_recarga`, a `tbl_comprobante` `QPP-REC-<idRecarga>` and the amount
   added to the balance; any other status -> `RECHAZADA`. Only `INICIADA` or
   `EXPIRADA` payments are settled (a late signed approval still credits);
   the payment row is locked, so repeated or concurrent relays credit once.
   Always 302 to `{USER_WEB_URL}/?pago=<order_id>`, or `?pago=desconocido`
   when `order_id` is not a QPayPro payment.
3. **Cancel**: an `INICIADA` payment becomes `EXPIRADA`; other states are
   unchanged. 302 like the relay.
4. **Status**: only `QPP-` referencias. An `INICIADA` payment older than 10
   minutes is first reconciled with QPayPro (5) and, if that cannot
   confirm it, marked `EXPIRADA`.
5. **Reconciliation** (S7, `reconcile`): POSTs multipart to
   `{QPAYPRO_BASE_URL}/checkout/get_transaction_detail` with `x_login`,
   `x_private_key`, `x_api_secret` (`QPAYPRO_API_SECRET`) and `idTrans` =
   `id_transaccion_qpaypro` when known, else `x_fp_sequence` = the fp
   sequence. Only transactions whose `dateTransaction` (ISO 8601, e.g.
   `2021-07-28T20:13:06.000000Z`) is not earlier than `fecha_transaccion`
   minus 5 minutes (clock skew) count; older, missing or unparseable dates
   are ignored, for both kinds of query. The query runs outside any DB
   transaction; then, with the payment row locked and only from `INICIADA`
   or `EXPIRADA`:
   - a transaction with status `Aprobada` and `amount` equal to
     `monto_pago` (to the cent) -> the same credit as the relay, with
     `id_transaccion_qpaypro`, `numero_autorizacion` and `codigo_respuesta`
     from QPayPro (when `x_fp_sequence` lists several attempts, the
     approved one wins);
   - another status -> `RECHAZADA`, no recharge;
   - `result: 0` (not found), no transaction inside the date window, a
   network error, timeout or unexpected body,
   an approval of another amount, a QPayPro id already stored on another
   payment (UNIQUE `id_transaccion_qpaypro`), a query by `idTrans` that
   answers another id, or no `QPAYPRO_API_SECRET` -> unknown, nothing
   changes.
   Also used by the staff route `POST /cards/:numeroTarjeta/payments/:referencia/verify`
   (`apps/api/src/cards/README.md`). If QPayPro does not keep
   `x_fp_sequence` from the hosted checkout, a payment whose relay never
   arrived stays unknown and only expiry applies.

## Simulated recharge

- Exists only while `RECHARGE_SIMULATOR_ENABLED` is exactly `true` (404
  otherwise): there is no real payment, so it hands out free balance. It
  coexists with QPayPro payments (qpaypro-checkout S8).
- `monto`: number, 1.00 to 500.00, at most 2 decimals. `referencia`: 8-100
  chars `[A-Za-z0-9-]`, generated by the client once per attempt, not
  starting with `QPP-` (reserved for QPayPro). Anything else -> 400.
- One transaction writes a `tbl_transaccion_pago` (`APROBADA`, `GTQ`,
  `referencia_pago = referencia`, confirmed now, no QPayPro id), a
  `tbl_recarga`, a `tbl_comprobante` numbered `SIM-<idRecarga>`, and adds the
  amount to the balance. The card row is locked (`FOR UPDATE`).
- Retry: the same `referencia` for the same card and amount returns the
  original recharge with status 200, `repetida: true` and the current
  balance, without charging again. The same `referencia` with another card
  or amount -> 409.
- A card that is not `ACTIVA` -> 409 "La tarjeta está BLOQUEADA y no puede
  recargarse."; unknown card -> 404. Rejections change nothing.

## Limits

Anyone who knows a card number can read its balance and state; there is no
rate limiting yet. The turnstile simulator lives in
`operations/ridership` (`apps/api/src/operations/README.md`).
