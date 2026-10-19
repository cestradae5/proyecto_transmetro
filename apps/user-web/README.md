# user-web

Citizen SPA: look up a card by its number, see its balance, recharge it
through the QPayPro hosted checkout (optionally also with the simulated
recharge) and, in development, simulate turnstile passes. Specs:
`odd/tasks/user-web.md` and `odd/tasks/qpaypro-checkout.md` (S9, S10). API contract: `apps/api/src/citizen/README.md` and
the ridership section of `apps/api/src/operations/README.md`.

There is no citizen login: the card number is the identity.

## Run locally

1. API (`apps/api/.env`):

   ```env
   RECHARGE_SIMULATOR_ENABLED=true
   TURNSTILE_SIMULATOR_ENABLED=true
   TURNSTILE_API_KEY=a-local-key
   ```

   QPayPro payments also need `QPAYPRO_LOGIN`, `QPAYPRO_API_KEY`,
   `QPAYPRO_PRIVATE_KEY`, `QPAYPRO_BASE_URL` (optional, sandbox by default),
   `API_PUBLIC_URL` (public URL of the API, base of the QPayPro relay and
   cancel URLs) and `USER_WEB_URL` (this SPA, e.g. `http://localhost:5174`).
   See `apps/api/.env.example`; without them the API answers 503 and the SPA
   shows that message.

   Apply `database/init.sql` and load test cards with
   `docs/postman/ridership-test-data.sql` (for example `TEST-RID-0001`).

2. SPA (`apps/user-web/.env.local`, not committed):

   ```env
   VITE_API_BASE_URL=http://localhost:3000
   VITE_RECHARGE_SIMULATOR=true
   VITE_TURNSTILE_SIMULATOR=true
   VITE_TURNSTILE_API_KEY=a-local-key
   ```

3. `npm install` at the repo root, then `npm run dev` in `apps/user-web`
   (http://localhost:5174). Tests: `npx vitest run`. Build: `npm run build`.

## Environment

| Variable | Where | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | SPA | API URL (default `http://localhost:3000`) |
| `VITE_RECHARGE_SIMULATOR` | SPA | `true` also shows the simulated recharge, below QPayPro |
| `VITE_TURNSTILE_SIMULATOR` | SPA | `true` shows the turnstile simulator |
| `VITE_TURNSTILE_API_KEY` | SPA | Sent as `X-Turnstile-Key`; must equal the API's `TURNSTILE_API_KEY` |
| `RECHARGE_SIMULATOR_ENABLED` | API | `true` enables simulated recharges (free balance) |
| `TURNSTILE_SIMULATOR_ENABLED` | API | `true` enables the turnstile endpoint |
| `TURNSTILE_API_KEY` | API | Key the turnstile must send |
| `QPAYPRO_LOGIN`, `QPAYPRO_API_KEY`, `QPAYPRO_PRIVATE_KEY`, `QPAYPRO_BASE_URL` | API | QPayPro credentials and base URL; never sent to the SPA |
| `API_PUBLIC_URL` | API | Public API URL; QPayPro sends the browser back to its relay/cancel routes |
| `USER_WEB_URL` | API | This SPA's URL; the API redirects to `/?pago=<referencia>` |

**Warning:** every `VITE_*` value is embedded in the public JavaScript
bundle. `VITE_TURNSTILE_API_KEY` is readable by anyone who opens the site,
so the simulator is a development and demo tool only. In production, set
`TURNSTILE_SIMULATOR_ENABLED=false` and `RECHARGE_SIMULATOR_ENABLED=false` on
the API and leave `VITE_TURNSTILE_SIMULATOR` and `VITE_RECHARGE_SIMULATOR`
unset.

## Deploy on Render (Static Site)

| Setting | Value |
|---|---|
| Root directory | *(empty: repository root, so the npm workspace installs)* |
| Build command | `npm ci && npm run build --workspace @transmetro/user-web` |
| Publish directory | `apps/user-web/dist` |
| Environment | `VITE_API_BASE_URL=https://<your-api>.onrender.com` (plus the simulator variables only for a demo) |

`VITE_*` variables are read at build time: changing them needs a new
deploy. The API already allows any origin (CORS `*`) and the
`X-Turnstile-Key` header, so no API change is needed for a new Static Site.

## Behavior

- **Card**: an empty number is not sent; an unknown card shows the API
  message ("La tarjeta no existe.").
- **QPayPro recharge**: pick one of Q10, Q25, Q50 or Q100 and enter an
  email; "Pagar con QPayPro" stays disabled until both are valid (email up
  to 100 characters) and while sending. The SPA posts
  `POST /citizen/cards/:numeroTarjeta/payments { monto, email }` and, on
  201, sends the browser to the answered `checkoutUrl`, where the card is
  entered on the QPayPro page. API errors (400/404/409/502/503) show their
  message.
- **Payment result**: QPayPro returns the browser to the API, which redirects
  to `/?pago=<referencia>`. On load the SPA calls
  `GET /citizen/payments/:referencia` and shows `APROBADA` -> "Recarga
  exitosa" with comprobante, amount and new balance; `RECHAZADA` -> "El pago
  fue rechazado."; `EXPIRADA` -> "Pago cancelado o expirado."; `ERROR` -> "No
  se pudo completar el pago."; `INICIADA` -> "Estamos confirmando tu
  pago..." with "Verificar de nuevo" (asks again). `?pago=desconocido` or a
  404 -> "No encontramos el pago.". "Volver" clears the query string and
  returns to the card lookup.
- **Simulated recharge** (only with `VITE_RECHARGE_SIMULATOR=true`): Q1.00 to Q500.00 with up to 2 decimals, checked before
  sending. Each attempt has one `referencia`; retrying the same amount after
  a network error reuses it, so the API never charges twice. A 404 from the
  recharge route shows "Las recargas no están disponibles.".
- **Simulator**: pick any active parada from `GET /citizen/lines`, grouped by
  line (`Línea 6 - nombre`) with the paradas without line last; stations show
  "(estación)" and a parada on two lines appears in both. The pass sends
  `idParada`, and the result shows the people in that parada. Each pass has
  its own `idempotencyKey`; repeating the same parada and type right after a
  network error reuses it, so the API never charges twice. The balance is
  never sent (the API reads it); the shown balance follows the API answer.
