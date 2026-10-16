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
    (Simulada/QPayPro), Comprobante (or "—" while not approved).
  - Empty lists: "Sin pasadas registradas." / "Sin recargas registradas.".
- **Errors**: 401 -> session expired; 403 -> "No tiene permiso para consultar
  las tarjetas."; 404 -> the API message ("La tarjeta no existe."); network ->
  retry message. Only the latest request updates the screen.

Read-only: there are no actions on cards from this view.
