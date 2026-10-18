# Pagos con QPayPro: guía del sandbox

Cómo configurar y probar a mano la recarga de tarjetas con el checkout alojado
de QPayPro en su ambiente de pruebas (sandbox). Reglas y contrato del API:
`apps/api/src/citizen/README.md`. Especificación: `odd/tasks/qpaypro-checkout.md`.

## 1. Cómo funciona

Primero servidor a servidor y después redirección del navegador:

```text
1. El ciudadano elige monto (Q10/Q25/Q50/Q100) y correo, y pulsa "Pagar con QPayPro" (user-web)
2. user-web -> POST /citizen/cards/:numeroTarjeta/payments            (API)
3. API -> POST {QPAYPRO_BASE_URL}/checkout/register_transaction_store (servidor a servidor)
4. QPayPro responde un token; el API responde 201 { referencia, checkoutUrl }
5. user-web lleva el navegador a checkoutUrl (página de pago alojada por QPayPro)
6. El ciudadano ingresa su tarjeta en la página de QPayPro
7. QPayPro redirige el navegador al relay del API:
     GET {API_PUBLIC_URL}/citizen/payments/qpaypro/relay?order_id&x_trans_id&x_amount&x_response_status&order_hash
   o, si cancela, a {API_PUBLIC_URL}/citizen/payments/qpaypro/cancel?referencia=
8. El API valida la firma y el monto, actualiza el pago (acredita si fue aprobado)
   y redirige a {USER_WEB_URL}/?pago=<referencia>
9. user-web consulta GET /citizen/payments/:referencia y muestra el resultado
```

Notas:

- El API no responde un 302 al paso 2: entrega `checkoutUrl` y es user-web
  quien navega (un `fetch` no puede seguir una redirección a otra página).
- QPayPro no envía una notificación de servidor a servidor: el resultado llega
  solo por la redirección del navegador (paso 7). Si el navegador se cierra
  antes, el pago se resuelve con la conciliación (sección 6).

## 2. Variables de entorno del API

En el repositorio no hay un archivo `.env.example` (las herramientas usadas no
crean archivos que empiezan con punto). La lista de variables está en esta guía
y en `apps/api/src/citizen/README.md`.

Los valores de abajo son las **credenciales públicas de prueba del sandbox**
que QPayPro publica en su documentación. No son credenciales reales de un
comercio y solo funcionan en `sandboxpayments.qpaypro.com`. El login es
compartido por todos los que prueban el sandbox.

| Variable | Valor en el sandbox | Uso |
|---|---|---|
| `QPAYPRO_LOGIN` | `visanetgt_qpay` (`x_login`) | Registro y consulta de transacciones |
| `QPAYPRO_API_KEY` | `99999999999` (`x_api_key`) | Registro de la transacción |
| `QPAYPRO_PRIVATE_KEY` | `88888888888` (`x_private_key`) | Valida la firma `order_hash` del relay y se envía en la consulta |
| `QPAYPRO_API_SECRET` | `99999999999` (`x_api_secret`) | Solo la consulta de transacciones (conciliación) |
| `QPAYPRO_BASE_URL` | `https://sandboxpayments.qpaypro.com` (valor por defecto) | Base de los servicios de QPayPro |
| `API_PUBLIC_URL` | URL pública del API, sin `/` al final | Base del relay y de la cancelación |
| `USER_WEB_URL` | URL de user-web, sin `/` al final | Adonde vuelve el navegador después de pagar o cancelar |

Si falta el login, la api key, la private key, `API_PUBLIC_URL` o
`USER_WEB_URL`, iniciar un pago responde 503 "Los pagos con QPayPro no están
disponibles." y no se guarda nada. Sin `QPAYPRO_API_SECRET` se puede pagar,
pero la conciliación no puede confirmar nada. Las credenciales nunca llegan a
user-web ni a los logs.

## 3. Configuración local

1. En `apps/api/.env` agregue:

   ```env
   QPAYPRO_LOGIN=visanetgt_qpay
   QPAYPRO_API_KEY=99999999999
   QPAYPRO_PRIVATE_KEY=88888888888
   QPAYPRO_API_SECRET=99999999999
   QPAYPRO_BASE_URL=https://sandboxpayments.qpaypro.com
   API_PUBLIC_URL=http://localhost:3000
   USER_WEB_URL=http://localhost:5174
   ```

2. Levante el API en el puerto 3000 (`npm run start:dev` en `apps/api`).
3. Levante user-web en el puerto 5174 (`npm run dev` en `apps/user-web`, con
   `VITE_API_BASE_URL=http://localhost:3000`).

`localhost` funciona aunque QPayPro esté en internet: el relay es una
redirección del navegador del pagador, no una llamada desde los servidores de
QPayPro. El navegador que pagó es el que abre `http://localhost:3000/...`.

## 4. Configuración en Render

En el servicio del API:

- `API_PUBLIC_URL` = URL del servicio del API en Render
  (por ejemplo `https://<servicio-api>.onrender.com`).
- `USER_WEB_URL` = URL del sitio estático de user-web en Render
  (por ejemplo `https://<sitio-user-web>.onrender.com`).
- Las cuatro variables `QPAYPRO_*` con los valores del sandbox de la sección 2.

En el sitio estático de user-web, `VITE_API_BASE_URL` = la misma URL del API.
El plan gratuito de Render duerme el servicio: no hay tareas programadas, la
expiración se aplica cuando alguien consulta el pago (sección 6).

## 5. Pago de prueba paso a paso

Use una tarjeta de Transmetro `ACTIVA` (por ejemplo una de
`docs/postman/ridership-test-data.sql` en una base local).

1. Abra user-web, consulte la tarjeta y anote el saldo.
2. En la recarga elija **Q25**, escriba un correo válido y pulse
   **Pagar con QPayPro**. El navegador pasa a la página de QPayPro, que muestra
   el monto 25.00, "Recarga Transmetro" y la referencia `QPP-...`.
3. Pague con la **tarjeta de prueba del sandbox de QPayPro** (no es una tarjeta
   real):
   - Número: `4111111111111111`
   - Vencimiento: cualquier fecha futura
   - CVV: cualquiera de 3 dígitos
4. QPayPro devuelve el navegador al relay y este a user-web con
   `?pago=QPP-...`.

Qué revisar después:

- **user-web**: "Recarga exitosa", el comprobante `QPP-REC-<id>`, "Monto:
  Q25.00" y el nuevo saldo (saldo anterior + 25). Si muestra "Estamos
  confirmando tu pago...", vea la sección 6.
- **admin-web**: en el detalle de la tarjeta, la actividad muestra la recarga
  con origen `QPAYPRO`.
- **Base de datos**: la fila del pago en `tbl_transaccion_pago`:

  ```sql
  SELECT referencia_pago, estado_pago, monto_pago, id_transaccion_qpaypro,
         codigo_respuesta, numero_autorizacion, fecha_transaccion, fecha_confirmacion
  FROM tbl_transaccion_pago
  WHERE referencia_pago = 'QPP-...';
  ```

  Debe estar `APROBADA`, con `id_transaccion_qpaypro` y `fecha_confirmacion`,
  y tener una sola recarga y un solo comprobante asociados.
- **Log del API**: no debe aparecer "QPayPro relay for ... ignored".

Para probar la cancelación, en el paso 3 use la opción de cancelar de la
página de QPayPro (lleva a `x_url_cancel`): user-web muestra "Pago cancelado o
expirado." y la fila queda `EXPIRADA`. Sin pasar por QPayPro se puede simular
con `3. Cancelar` de la colección de Postman.

Los mismos endpoints se pueden probar sin navegador con la colección
`docs/postman/qpaypro-checkout.postman_collection.json` (ver
`docs/postman/README.md`).

## 6. Conciliación y expiración

Si el relay no llega (el navegador se cerró, la firma no coincidió), el pago
queda `INICIADA`. Se resuelve consultando a QPayPro
(`/checkout/get_transaction_detail`):

- **user-web**: el botón **Verificar de nuevo** vuelve a pedir el estado.
- **admin-web**: en la tabla de recargas del detalle de la tarjeta, cada fila
  `QPAYPRO` en `INICIADA` o `EXPIRADA` tiene **Verificar con QPayPro**
  (permiso `RECARGAS_REPORTES_CONSULTAR`).
- **Expiración a los 10 minutos**: al consultar un pago `INICIADA` con más de
  10 minutos, el API primero consulta a QPayPro y, si no puede confirmarlo, lo
  marca `EXPIRADA`. Una aprobación firmada que llega después todavía acredita
  (el banco ya cobró).

## 7. Puntos a confirmar en el primer pago real del sandbox

Esto no se pudo probar sin un pago con navegador; revíselo en el primer pago
de la sección 5 y anote el resultado en `odd/tasks/qpaypro-checkout.md`.

1. **Qué clave firma `order_hash`.** El registro aceptó `99999999999` y
   `88888888888` como api key, así que no se sabe cuál usa QPayPro para firmar
   el relay. Si el pago queda `INICIADA` y el log del API dice
   `QPayPro relay for QPP-... ignored: bad order_hash`, cambie
   `QPAYPRO_PRIVATE_KEY` al otro valor público (`99999999999`), reinicie el API
   y repita el pago.
2. **Si QPayPro conserva `x_fp_sequence`** del checkout alojado. Pruebe un pago
   y cierre la pestaña antes de que vuelva el relay; luego use
   **Verificar con QPayPro**. Si nunca lo encuentra ("Transacción no
   encontrada"), un pago sin relay solo puede expirar.
3. **Estados no finales.** Hoy cualquier estado distinto de "Aprobada" en la
   consulta se toma como `RECHAZADA`. Si QPayPro devuelve un estado intermedio
   (por ejemplo pendiente), habría que tratarlo como desconocido.
4. **Significado de `x_type AUTH_ONLY`.** El registro se envía como
   `AUTH_ONLY` (igual que el plugin oficial). Confirme en el panel del sandbox
   si eso deja el cobro solo autorizado o si se liquida; si queda solo
   autorizado, falta definir la captura.
