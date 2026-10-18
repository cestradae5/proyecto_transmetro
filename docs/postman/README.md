# Postman: conteo de pasajeros (ridership)

Colección para probar a mano la talanquera, la alerta de capacidad por parada
(requerimiento 14) y la regla del bus bajo el 25% (requerimiento 15). Reglas y
contrato: `apps/api/src/operations/README.md`.

## 1. Preparar el API

1. Aplique `database/init.sql` a su base local (agrega
   `tbl_parada.capacidad_pasajeros`, `tbl_evento_talanquera`,
   `tbl_parada_unidad`, deja `tbl_alerta.id_empleado` opcional y migra al
   conteo por parada los datos de una versión anterior). Se puede ejecutar
   varias veces.
2. Cargue las tarjetas de prueba con `docs/postman/ridership-test-data.sql`
   (solo en una base local).
3. En `apps/api/.env` agregue:

   ```env
   TURNSTILE_SIMULATOR_ENABLED=true
   TURNSTILE_API_KEY=una-clave-local
   ```

4. Levante el API (`npm run start:dev` en `apps/api`).

## 2. Importar y configurar

Importe `ridership.postman_collection.json` y complete las variables de la
colección:

| Variable | Valor |
|---|---|
| `baseUrl` | `http://localhost:3000` |
| `token` | JWT de un usuario `ADMINISTRADOR_SISTEMA` u `OPERADOR_CENTRAL` (inicie sesión en admin-web y copie el token) |
| `turnstileKey` | El mismo valor de `TURNSTILE_API_KEY` |
| `idParada` | Una parada existente (sea o no estación: el conteo, la capacidad y la alerta son de la parada) |
| `idUnidad` | Una unidad existente |
| `tokenPiloto` | JWT de un usuario `PILOTO` con unidad asignada y línea (para la carpeta del bus) |
| `idLineaParada` | Posición de una parada en la línea de esa unidad (`GET /fleet/units/my-unit/stops`) |

La talanquera no usa el token: se identifica con el header `X-Turnstile-Key`.

## 3. Escenarios

**Alerta de capacidad de la parada (150%)**

1. `1. Parada / Fijar capacidad de la parada (4)`.
2. `1. Parada / Leer ocupación de la parada`: guarda cuántas personas hay.
3. Envíe `2. Talanquera / Entrada` hasta llegar a 6 personas. En esa entrada
   la respuesta trae `alertaGenerada: true`; las siguientes no crean otra
   alerta mientras siga sin resolver.
4. `3. Alertas de capacidad / Listar` y luego `Resolver alerta`: la alerta
   pasa a `RESUELTA` con `autor: null`. La próxima entrada por encima del
   150% genera una alerta nueva.

**Talanquera y bus: dos funciones separadas**

- La talanquera es lo único que suma o resta personas en una parada:
  `Entrada` suma 1 y cobra el pasaje; `Salida` resta 1 (nunca baja de 0).
- El bus solo traslada pasajeros entre paradas: lo reporta el piloto.

**Bus bajo el 25% (con el token del piloto)**

1. `4. Bus (piloto) / 1. Marcar parada actual`: la parada donde está la unidad.
2. `2. Leer mi unidad`: guarda cuántos van a bordo.
3. `3. Reportar pasajeros` con `{ "bajaron": N, "subieron": M }`: primero
   bajan (pasan a la parada) y después suben (salen de la parada). Si la
   unidad queda bajo el 25% de su capacidad, `minutosEsperaExtra` es `5`. Se
   acepta que suban más de los que cuenta la parada (la parada queda en 0).
4. Errores: bajan más de los que van a bordo o se supera la capacidad (409);
   números negativos o con decimales (400).

Las carpetas de errores comprueban 401 (sin clave), 409 (tarjeta bloqueada,
saldo insuficiente, parada abierta o inexistente), 404 (tarjeta inexistente)
y 400 (tipo inválido).

Los conteos se acumulan entre corridas: los tests de Postman comparan contra
la lectura anterior en lugar de esperar números fijos.
