# Card activity

Staff view of each citizen card's turnstile passes and recharges (route
`/recharges`, landing card "Recarga", module `recharge_reporting`). Spec:
`odd/tasks/card-activity.md`. API contract: `apps/api/src/cards/README.md`.

- **List**: `GET /cards?search=&page=`, 20 cards per page by number (Número,
  Estado, Saldo). The search box ("Buscar por número") is debounced (300 ms),
  trimmed, and restarts from page 1. No match -> "No hay tarjetas que
  coincidan.".
- **Activity**: selecting a card loads `GET /cards/:numeroTarjeta/activity`
  (number URL-encoded) and shows its number, state and balance, then:
  - "Pasadas por talanquera": Fecha, Tipo (Entrada/Salida), Parada (with
    "(estación)" when the parada is a station), Cobro.
  - "Recargas": Fecha, Monto, Estado (payment state in Spanish), Origen
    (Simulada/QPayPro), Comprobante (or "—" while not approved), Acción.
  - "Verificar con QPayPro" (qpaypro-checkout S11): only on QPayPro rows
    in `INICIADA` or `EXPIRADA`. It calls
    `POST /cards/:numeroTarjeta/payments/:referencia/verify` (both
    URL-encoded); every button is disabled while one is sending. The answer
    updates the row's state and receipt and the card balance shown; the
    button stays while QPayPro could not confirm the payment. Errors show
    above the table: 401/403/404 as below (404 with the API message, e.g.
    "El pago no existe."), others "No se pudo verificar el pago con
    QPayPro.", network -> retry message.
  - Empty lists: "Sin pasadas registradas." / "Sin recargas registradas.".
- **Errors**: 401 -> session expired; 403 -> "No tiene permiso para consultar
  las tarjetas."; 404 -> the API message ("La tarjeta no existe."); network ->
  retry message. Only the latest request updates the screen.

The verify button is the only action of this view.
