# user-web

Citizen SPA: look up a card by its number, see its balance, recharge it
(simulated) and, in development, simulate turnstile passes. Spec:
`odd/tasks/user-web.md`. API contract: `apps/api/src/citizen/README.md` and
the ridership section of `apps/api/src/operations/README.md`.

There is no citizen login: the card number is the identity.

## Run locally

1. API (`apps/api/.env`):

   ```env
   RECHARGE_SIMULATOR_ENABLED=true
   TURNSTILE_SIMULATOR_ENABLED=true
   TURNSTILE_API_KEY=a-local-key
   ```

   Apply `database/init.sql` and load test cards with
   `docs/postman/ridership-test-data.sql` (for example `TEST-RID-0001`).

2. SPA (`apps/user-web/.env.local`, not committed):

   ```env
   VITE_API_BASE_URL=http://localhost:3000
   VITE_TURNSTILE_SIMULATOR=true
   VITE_TURNSTILE_API_KEY=a-local-key
   ```

3. `npm install` at the repo root, then `npm run dev` in `apps/user-web`
   (http://localhost:5174). Tests: `npx vitest run`. Build: `npm run build`.

## Environment

| Variable | Where | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | SPA | API URL (default `http://localhost:3000`) |
| `VITE_TURNSTILE_SIMULATOR` | SPA | `true` shows the turnstile simulator |
| `VITE_TURNSTILE_API_KEY` | SPA | Sent as `X-Turnstile-Key`; must equal the API's `TURNSTILE_API_KEY` |
| `RECHARGE_SIMULATOR_ENABLED` | API | `true` enables simulated recharges (free balance) |
| `TURNSTILE_SIMULATOR_ENABLED` | API | `true` enables the turnstile endpoint |
| `TURNSTILE_API_KEY` | API | Key the turnstile must send |

**Warning:** every `VITE_*` value is embedded in the public JavaScript
bundle. `VITE_TURNSTILE_API_KEY` is readable by anyone who opens the site,
so the simulator is a development and demo tool only. In production, set
`TURNSTILE_SIMULATOR_ENABLED=false` and `RECHARGE_SIMULATOR_ENABLED=false` on
the API and leave `VITE_TURNSTILE_SIMULATOR` unset.

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
- **Recharge**: Q1.00 to Q500.00 with up to 2 decimals, checked before
  sending. Each attempt has one `referencia`; retrying the same amount after
  a network error reuses it, so the API never charges twice. A 404 from the
  recharge route shows "Las recargas no están disponibles.".
- **Simulator**: each pass has its own `idempotencyKey`; repeating the same
  station and type right after a network error reuses it, so the API never
  charges twice. The balance is never sent (the API reads it). The shown balance follows
  the API answer.
