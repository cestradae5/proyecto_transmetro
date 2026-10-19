# Demo role switch ("Ver como")

The admin web only accepts Google sign-in, and each email maps to exactly one
employee with one role. For academic review, the demo role switch lets an
allowlisted reviewer sign in with their own Google account and act as a
representative employee of every role, without one Google account per role.

## How it works

- The reviewer signs in normally and is an `ADMINISTRADOR_SISTEMA` employee.
- The landing page header shows a **Ver como** selector with one entry per
  active role (except the reviewer's own role).
- Choosing a role issues a new session (JWT) **as a real employee of that
  role**, preferring one with an operational assignment (a pilot with a
  unit, a station operator with a station). This way role-scoped screens such
  as *Mi unidad* and *Mi estación* show data.
- While impersonating, a **Modo demo** badge and a **Volver a mi cuenta**
  button are shown. Switching again keeps the original reviewer as the actor.
- Every switch and restore is written to the audit log (`tbl_bitacora`,
  actions `DEMO_ROLE_SWITCH` / `DEMO_ROLE_RESTORE`) under the reviewer.
  Actions taken while impersonating are recorded under the persona employee.

## Safety rails

- Off by default. The API answers `404` unless `DEMO_ROLE_SWITCH_ENABLED=true`
  **and** `DEMO_ROLE_SWITCH_EMAILS` is non-empty.
- Only emails in `DEMO_ROLE_SWITCH_EMAILS` may switch (`403` otherwise). An
  impersonated session is authorized by the signed `demoActor` claim of the
  real reviewer, never by the persona's email.
- The reviewer must still be an ACTIVE employee with an ACTIVE role on every
  switch; deactivating them revokes the ability immediately.
- Demo personas created by the seed use the reserved `.invalid` email domain,
  so nobody can sign in as them through Google.

## Setup

The reviewer account (`nportillop1@miumg.edu.gt`, `ADMINISTRADOR_SISTEMA`) and
the demo personas (one per operational role, with a unit / station assigned)
are created by `database/init.sql`, so loading that single script is enough.

1. Load the database once (local or Render, see below).
2. Add to the API environment (`apps/api/.env`, or Render > Environment) and
   restart the API:

   ```env
   DEMO_ROLE_SWITCH_ENABLED=true
   DEMO_ROLE_SWITCH_EMAILS=nportillop1@miumg.edu.gt,cestradae5@miumg.edu.gt
   ```

3. The reviewer opens the admin web, clicks **Continuar con Google**, and uses
   **Ver como** in the landing page header.

### Loading the database on Render

Render Postgres does not run scripts by itself. Run `init.sql` once from your
machine with the **External Database URL** (Render > your database > Connect):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" "<EXTERNAL_DATABASE_URL>" -v ON_ERROR_STOP=1 -f database/init.sql
```

The script is idempotent: running it again does not duplicate or overwrite
existing rows.

## API

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/authentication/demo/personas` | — | `{ actorEmail, impersonating, activeEmployeeId, personas[] }` |
| POST | `/authentication/demo/switch` | `{ "roleCode": "PILOTO" }` | `{ token, expiresAt, usuario }` as that persona |
| POST | `/authentication/demo/restore` | — | `{ token, expiresAt, usuario }` for the reviewer |

All routes need `Authorization: Bearer <JWT>`. Errors: `404` disabled or no
eligible persona for the role, `403` account not allowlisted.

Turn it off after the review by setting `DEMO_ROLE_SWITCH_ENABLED=false`.
