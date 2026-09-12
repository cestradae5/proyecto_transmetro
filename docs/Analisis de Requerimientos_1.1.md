**UNIVERSIDAD MARIANO GÁLVEZ DE GUATEMALA**  
**FACULTAD DE INGENIERÍA EN SISTEMAS DE INFORMACIÓN**

**Análisis de requerimientos**

**[CESAR ARMANDO ESTRADA ELIAS](mailto:cestradae5@miumg.edu.gt)**

**090-22-10153**

**GUATEMALA, 4 de septiembre del 2026**

1. **Descripción de producto**

## Actualmente, el sistema de transporte Transmetro concentra sus operaciones principalmente en la ciudad de Guatemala, lo que limita la conectividad eficiente con los municipios aledaños. Además, existe una dispersión en la gestión administrativa interna y una falta de canales digitales unificados para informar sobre el estado del servicio de transporte a los pasajeros. 

**Alcance del producto.**

El producto comprende un portal web público para los usuario que utilizaran el servicio del transmetro y un componente administrativo interno para el Transmetro de Ciudad de Guatemala, con despliegue en un servidor al finalizar el período del proyecto. 

**Portal Administrativo**

El Portal de Administración centraliza la gestión operativa y el control interno del sistema para garantizar el funcionamiento eficiente del transporte. En primer lugar, la administración del sistema a través de la Gestión de Infraestructura, permitiendo el registro y control detallado de líneas, rutas, estaciones, paradas y sus respectivos accesos a municipios aledaños de Guatemala. En segundo lugar, la Gestión de Flota, para mantener un control unificado sobre los buses mediante la asignación de unidades a rutas específicas, el monitoreo de parqueos y el seguimiento de métricas operativas clave como el estado del vehículo y la capacidad de pasajeros. Por último, la Gestión de Personal, destinada al control administrativo, asignación de roles y gestión del personal operativo del Transmetro.


**Límites de responsabilidades**

## La plataforma operará exclusivamente en un entorno simulado y enfocado en la gestión del transporte. Todas las funciones relacionadas con pagos, recargas y saldos se manejan de forma 100% ficticia a través de simulaciones, sin procesar dinero real ni utilizar hardware de geolocalización físico. Asimismo, las rutas y líneas hacia los municipios serán creadas únicamente con fines de simulación. La plataforma está destinada únicamente a la administración operativa del servicio y al control de los procesos de sus trabajadores, excluyendo cualquier función de recursos humanos u otros servicios ajenos al transporte. 

## 

2. **Clases y características de usuario.**

| Clase de usuario | Objetivo | Permisos | Frecuencia de uso | Necesidades de accesibilidad |
| :---- | :---- | :---- | :---- | :---- |
|  |  |  |  |  |
| Pilotos | Consultar sus rutas asignadas, comunicar el estado de su unidad y gestionar novedades operativas. | Consultar las rutas y líneas relacionadas con su operación; actualizar únicamente el estado de su unidad y las novedades operativas autorizadas. | Frecuente. | Interfaz sencilla, legible y optimizada para dispositivos móviles. |
| Guardias | Consultar información necesaria para realizar sus funciones de seguridad y supervisión. | Consultar su perfil y la información autorizada de líneas, rutas y estaciones. Sin permisos de modificación. | Ocasional. | Navegación sencilla y accesible, compatibilidad con dispositivos móviles. |
|  Operador de estación. |  Supervisar la información operativa y gestionar las novedades operativas correspondientes a su estación. |  Consultar y actualizar exclusivamente la información y las novedades operativas de su estación asignada. |  Frecuente |  Navegación sencilla y accesible, compatibilidad con dispositivos móviles y de escritorio. |
| Operador central | Supervisar el estado general de la operación y coordinar la información de estaciones, líneas, rutas y unidades. | Consultar y actualizar estados, itinerarios y novedades operativas dentro del alcance autorizado.  | Frecuente | Interfaz clara, adaptable y compatible con dispositivos móviles y de escritorio. |
| Administrador del sistema. | Consultar y gestionar usuarios, roles, permisos y configuraciones globales autorizadas. | Tiene permisos de un operador central y editar perfiles de los roles. | Ocasional. | Navegación sencilla y compatibilidad con dispositivos de escritorio.. |

3. **Entorno operativo**

El portal estará previsto para ejecutarse en teléfonos inteligentes con Android o iOS y en computadoras con Windows o macOS.  Los navegadores oficialmente compatibles serán Google Chrome y Safari.

**Restricciones del producto**

**Plataforma**: El sistema va a implementarse como una aplicación web responsive, utilizable desde dispositivos móviles y computadoras. No se contempla el desarrollo de aplicaciones móviles nativas.

**Compatibilidad:** El sistema funcionará en Google Chrome y Safari.

**Identidad visual:** La interfaz respeta los lineamientos de diseño e identidad visual institucional proporcionados por la Municipalidad de Guatemala.

**Supuestos y dependencias**

| ID | Tipo | Dependencias o supuestos | Impacto si no se cumple | Responsable |
| :---- | :---- | :---- | :---- | :---- |
|  |  |  |  |  |
|  |  |  |  |  |
| Dep-001 | Dependencia | Se requiere que la municipalidad proporcione el hardware específico para sus empleados. | Los empleados no podrán acceder a la plataforma desde un dispositivo que pertenezca a la municipalidad.. | Municipalidad de Guatemala. |
| Dep-002 | Dependencia | Se requiere que la Municipalidad de Guatemala proporcione o autorice los datos geográficos de las estaciones, paradas y accesos. | No será posible representar información geográfica oficial o validada | Municipalidad de Guatemala |
| Dep-003 | Dependencia | Se asume que las creación de los correos institucionales previamente registrados serán proporcionados por la municipalidad. | No será posible representar información geográfica oficial o validada | Municipalidad de Guatemala. |

**Límites y exclusiones**

**Servicio cubierto:** La plataforma estará limitada a la consulta y gestión de información relacionada con la operación del servicio Transmetro. No se utilizará para administrar otros servicios municipales.

**Servicios administrativos:** El sistema no gestionará procesos propios de Recursos Humanos, como contratación, nómina, evaluaciones laborales. Únicamente administra perfiles y permisos necesarios para operar la plataforma.

**Ámbito territorial:** La plataforma está destinada exclusivamente al uso de ciudadanos en Guatemala, por lo que no está configurada ni autorizada para su operación en otros países o regiones. 

4. **Requisitos de interfaz externa**

1\. **Interfaz administrativa:** presentará funciones según los permisos asignados a pilotos, guardias, operadores de estación, operadores centrales y administradores de perfiles.

La interfaz deberá ser responsive, comprensible y compatible con teléfonos Android o iOS y computadoras con Windows o macOS mediante Google Chrome o Safari.

**Interfaces de software**

**Interfaces con QPayPro** 

El sistema debe utilizar QPayPro  en modo de prueba para simular los pagos asociados con las recargas de la Tarjeta Ciudadana.

**Interfaz con Google Identity Services**

El sistema debe permitir que los empleados se autentiquen mediante cuentas institucionales de Google previamente autorizadas.

**Interfaces de hardware**

El sistema no debe depender de conexiones con dispositivos físicos reales para demostrar sus funciones.

**Interfaces de comunicación**

La plataforma intercambiará información por Internet con Google Maps, QPayPro  y Google Identity Services.

**4\. Requerimientos Funcionales \- NO APLICA**

**Portal Público**

| Id. Requerimiento | REQ-FUNC-001 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Registro de recarga exprés** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir recargar de saldo a la tarjeta ciudadana sin necesidad de iniciar sesión.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Realizar recargas exprés sin necesidad de iniciar sesión. Ingresar identificador único de tarjeta Seleccionar monto de recarga. Pagar por medio de tarjeta de débito/crédito.  |  |  |  |  | Al aprobar una recarga, genera un comprobante con (tarjeta destinataria, fecha y hora, monto). La operación se puede hacer sin login. No expone datos de pago. | Prueba funcional |  |

| Id. Requerimiento | REQ-FUNC-002 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Consultar la información de las líneas.** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que cualquier persona consulte las líneas, estaciones y recorridos disponibles del Transmetro sin iniciar sesión.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Visualizar líneas disponibles. Visualizar diagrama topológico de las líneas. Consultar el recorrido de una línea seleccionada. Visualizar tiempos estimados del recorrido o entre paradas. Identificar conexiones o transbordos con otras líneas. Consultar detalles de las estaciones. Consultar paradas en Google Maps. |  |  |  |  | La consulta de líneas puede realizarse sin autenticación. Muestra el listado de líneas disponibles. Al seleccionar una línea, se muestran sus paradas, estaciones y recorrido asociado Muestra tiempos estimados del recorrido. Muestra paradas de la línea en Google Maps. |  Prueba funcional. |  |

| Id. Requerimiento | REQ-FUNC-003 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Consulta visual general en mapa de las líneas.** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que cualquier persona visualice y filtre las líneas del Transmetro en un mapa interactivo sin iniciar sesión.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Filtrar las líneas en el mapa interactivo. Visualizar todas las líneas del Transmetro en el mapa interactivo. Visualizar estaciones o paradas asociadas a las líneas mostradas Seleccionar una línea para resaltar su recorrido visual. Visualizar mapa topológico general de todas las líneas. Cambiar el tipo de visualización del mapa. |  |  |  |  | La consulta del mapa puede realizarse sin autenticación Al aplicar un filtro, el mapa refleja únicamente las líneas seleccionadas. El mapa muestra las líneas disponibles del Transmetro Mostrar el mapa satelital con las líneas y paradas marcadas. La vista topológica, si está disponible, representa todas las líneas de forma comprensible.  |  Prueba funcional, prueba de interfaz. |  |

| Id. Requerimiento | REQ-FUNC-004 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Consultar planificador de viaje con horarios y novedades del servicio del transmetro.** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que cualquier persona planifique un viaje ingresando un punto de origen y un punto de destino, mostrando rutas, horarios estimados y novedades del servicio del Transmetro sin iniciar sesión.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Ingresar punto de origen y destino y por día y hora. Mostrar líneas y paradas involucradas en el trayecto. Mostrar tiempos estimados relacionados con el viaje. Consultar horarios de las líneas. Indicar conexiones o transbordos necesarios.  Mostrar novedades del servicio que puedan afectar la ruta sugerida. Imprimir ruta y mapa sugerido. |  |  |  |  | El planificador puede utilizarse sin autenticación. El sistema genera una ruta cuando el origen y destino son válidos. La ruta sugerida muestra líneas, estaciones involucradas. Si existe una novedad que afecte una línea, estación o ruta sugerida, esta se muestra junto al resultado. Si no existe una ruta disponible, el sistema informa que no se encontraron opciones. El sistema genera una ruta en formato de diagrama de flujo. El sistema genera una ruta en formato de mapa topológico. Se muestran los horarios de servicio según su línea y día. Se muestra el tiempo estimado, paradas, transbordos y llegada aprox.  | Prueba funcional, prueba de autorización y prueba con datos de novedades del servicio. |  |

|  |  |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
|  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |

**Portal administrativo.**

| Id. Requerimiento | REQ-FUNC-006 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Gestión y control de infraestructura.** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que el personal administrativo autorizado gestione la información de líneas, rutas, estaciones y paradas del Transmetro dentro de la plataforma administrativa.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Actualizar el estado operativo o desactivar líneas, rutas, estaciones o paradas. Consultar líneas, rutas, estaciones y paradas registradas. Administrar la información de líneas, rutas, estaciones y parada Consultar el historial básico de modificaciones realizadas. |  |  |  |  | Solo los roles autorizados pueden crear, editar, desactivar o consultar la gestión administrativa de infraestructura. Los cambios realizados se reflejan en las consultas públicas cuando corresponda. Cada modificación registra usuario responsable, fecha, hora y elemento modificado. Las modificaciones se guardan de forma persistente El sistema impide el acceso a usuarios no autenticados o sin permisos administrativos.  La interfaz administrativa no permite eliminar información crítica sin confirmación o control definido. | Prueba funcional, prueba de interfaz. |  |

| Id. Requerimiento | REQ-FUNC-007 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Gestión y control de flotas.** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que el personal autorizado gestione las unidades del Transmetro, asignando pilotos, líneas, rutas y ubicaciones operativas según los permisos definidos para cada rol.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Asignación de pilotos a unidades. Registrar y consultar unidades disponibles. Consultar la ubicación operativa asignada a cada unidad, como estación, parqueo o ruta. Actualizar el estado de una unidad: disponible, en servicio, en mantenimiento o fuera de servicio. Consultar capacidad y disponibilidad de las unidades. Recibir reportes operativos enviados por pilotos o estaciones. El operador de estación gestiona órdenes operativas, enviar solicitudes a la central, actualizar información de la flota. La central envía mensajes de actualización a estaciones y pilotos. |  |  |  |  | Solo usuarios autenticados con rol autorizado pueden gestionar la flota. El sistema permite asignar un piloto a una unidad disponible. El sistema permite asignar una unidad a una línea o ruta registrada. Cada unidad muestra estado, capacidad y disponibilidad. Las actualizaciones de flota quedan guardadas de forma persistente. El sistema registra usuario responsable, fecha y hora de cada cambio.  Los roles sólo pueden realizar acciones permitidas según su jerarquía operativa. | Prueba funcional |  |

| Id. Requerimiento | REQ-FUNC-008 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Gestión de novedades y avisos** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que el personal administrativo autorizado cree, actualice, publique y desactive novedades y avisos operativos relacionados con el servicio del Transmetro.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Enviar una alerta predefinida desde una unidad hacia su estación asignada. Enviar una alerta predefinida desde una estación hacia la central operativa. Seleccionar tipos de alerta como: accidente de la unidad, mantenimiento, limpieza, retraso, unidad detenida o emergencia. Consultar alertas recibidas según el rol del usuario. Cambiar el estado de una alerta: recibida, en atención o resuelta. Actualización de líneas al portal web. |  |  |  |  | Solo usuarios autenticados con rol autorizado pueden enviar o consultar alertas operativas. Cada alerta registra tipo de alerta, usuario emisor, origen, destino, fecha, hora y estado. Las alertas de pilotos llegan a la estación correspondiente Las alertas de estación llegan a la central operativa. El sistema permite marcar una alerta como recibida, en atención o resuelta. El sistema conserva el historial de alertas enviadas. El cambio de estado de una línea se ve reflejado en el portal publico. | Prueba funcional. |  |

| Id. Requerimiento | REQ-FUNC-009 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Control administrativo del personal operativo** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que la central administrativa registre, consulte y actualice los perfiles del personal operativo del Transmetro, incluyendo choferes, guardias, operadores y administradores autorizados.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Registrar perfiles de empleados. Consultar información básica del personal operativo. Asignar rol operativo al empleado. Asignar estación, unidad, línea o área de trabajo cuando corresponda. Actualizar estado del empleado: activo, suspendido o inactivo. |  |  |  |  | Solo la central administrativa puede crear o editar perfiles de personal. Cada perfil registra datos básicos del empleado, rol, estado y asignación operativa cuando aplique. Los cambios quedan guardados de forma persistente. El sistema registra usuario responsable, fecha y hora de cada modificación. Los usuarios sin permiso no pueden modificar perfiles de empleados. Un empleado inactivo o suspendido no puede acceder a funciones operativas restringidas. | Prueba funcional |  |

| Id. Requerimiento | REQ-FUNC-010 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Autenticación del personal administrativo** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que únicamente el personal administrativo autorizado acceda al sistema interno mediante autenticación con Google OAuth y validación previa de su correo institucional registrado.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Iniciar sesión con Google. Validar la identidad del usuario mediante Google OAuth. Verificar que el correo institucional exista en la base de datos de personal autorizado. Rechazar el acceso si el correo no está registrado. Rechazar el acceso si el usuario está desactivado. Identificar el rol administrativo u operativo del usuario autorizado. Registrar el inicio de sesión en la bitácora. Validar la sesión y permisos al acceder a páginas privadas. |  |  |  |  | El sistema muestra la opción “Iniciar sesión con Google”. Solo los correos institucionales previamente registrados previamente registrados pueden acceder al sistema interno. Un correo no registrado no puede ingresar. Un usuario desactivado no puede ingresar. Al iniciar sesión correctamente, el sistema identifica el rol del usuario. El sistema registra en bitácora el usuario, fecha y hora del inicio de sesión. Las páginas privadas verifican que la sesión esté vigente y que el rol tenga permiso de acceso. | Prueba funcional |  |

| Id. Requerimiento | REQ-FUNC-011 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Gestión de usuarios, roles y permisos** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que el administrador gestione los usuarios internos del Transmetro y asigne permisos según el rol operativo de cada empleado.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Registrar usuarios internos. Asignar roles: central, operador, piloto, guardia o administrador. Activar o desactivar usuarios. Definir permisos según rol. Consultar el perfil y rol de cada usuario. |  |  |  |  | Solo el administrador puede crear, editar o desactivar usuarios internos. Cada usuario tiene un rol asignado. La central puede administrar líneas, estaciones y enviar avisos a operadores. Los operadores pueden controlar su estación/línea asignada, comunicarse con pilotos y enviar avisos a central. Los pilotos pueden consultar/controlar su unidad asignada y enviar reportes a operadores. Los guardias solo tienen perfil registrado, sin permisos administrativos. El sistema oculta acciones no permitidas para cada rol. | Prueba funcional, prueba de autorización |  |

| Id. Requerimiento | REQ-FUNC-012 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Panel operativo central** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe permitir que la central operativa visualice el estado general del servicio del Transmetro desde un panel administrativo.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Consultar el estado general de las líneas. Consultar el estado de las estaciones. Consultar el estado de flota. Visualizar alertas operativas recibidas. Visualizar novedades del servicio. Identificar elementos con estado crítico o pendiente de atención. |  |  |  |  | Solo usuarios autorizados pueden acceder al panel operativo central. El panel muestra líneas, estaciones, flota, alertas y novedades. Las alertas pendientes se muestran de forma visible. Los estados mostrados corresponden a la información registrada en el sistema. El panel no permite acciones fuera del permiso del rol activo. | Prueba funcional, prueba de autorización |  |

| Id. Requerimiento | REQ-FUNC-012 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Auditoría e historial de cambios** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe registrar en una bitácora las acciones administrativas realizadas por los usuarios internos para permitir trazabilidad de cambios y accesos.** |  |  |  |  |  |  |
| **Funcionalidades disponibles** |  |  |  |  | **Criterio de aceptación** | **Método de verificación** |  |
| Registrar inicios de sesión. Registrar creación, edición o desactivación de registros administrativos. Consultar historial de cambios por módulo. Consultar al usuario responsable de cada acción. Filtrar bitácora por fecha, usuario, módulo o tipo de acción. |  |  |  |  | Cada acción administrativa registra usuario, fecha, hora, módulo y acción realizada. Los inicios de sesión exitosos quedan registrados en la bitácora. Las modificaciones de infraestructura, flota, personal, roles y avisos quedan registradas. Solo usuarios autorizados pueden consultar la bitácora. La bitácora no puede ser editada por usuarios operativos. | Prueba funcional, prueba de auditoría, prueba de autorización y prueba de persistencia. |  |

5. **Requerimientos no funcionales.**

| Id. Requerimiento | RNF-001 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Seguridad y control de acceso.** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe proteger el acceso a las funciones administrativas mediante autenticación, autorización por roles y sesiones temporales.** |  |  |  |  |  |  |
| **Criterio de aceptación** |  |  |  |  |  | **Método de verificación** |  |
| Solo usuarios autenticados pueden acceder al sistema administrativo. Cada usuario solo puede usar las funciones permitidas por su rol. Las sesiones administrativas tienen una duración limitada. El sistema bloquea intentos de acceso a páginas privadas sin permiso. |  |  |  |  |  | Prueba de autenticación, prueba de autorización y prueba de sesión. |  |

| Id. Requerimiento | RNF-002 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Privacidad de datos** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe proteger los datos personales, administrativos y operativos registrados en la plataforma, evitando su exposición a usuarios no autorizados.** |  |  |  |  |  |  |
| **Criterio de aceptación** |  |  |  |  |  | **Método de verificación** |  |
| La interfaz pública no muestra datos personales ni administrativos. Los perfiles de empleados solo son visibles para roles autorizados. Los datos de recargas no muestran información completa del medio de pago. |  |  |  |  |  | Prueba de autorización, revisión de interfaz y prueba de privacidad. |  |

| Id. Requerimiento | RNF-003 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Rendimiento del sistema** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe responder en tiempos aceptables durante la consulta de funciones públicas y administrativas principales.** |  |  |  |  |  |  |
| **Criterio de aceptación** |  |  |  |  |  | **Método de verificación** |  |
| Las páginas públicas principales cargan en un tiempo aceptable bajo condiciones normales de uso. Las consultas de líneas, rutas, mapas topológicos y planificador responden sin retrasos excesivos. El panel administrativo muestra información operativa sin bloquear la interfaz. |  |  |  |  |  | Prueba funcional y prueba de rendimiento. |  |

| Id. Requerimiento | RNF-004 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Usabilidad de la interfaz** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe ofrecer interfaces claras y fáciles de usar para ciudadanos, pilotos, operadores, central y administradores.** |  |  |  |  |  |  |
| **Criterio de aceptación** |  |  |  |  |  | **Método de verificación** |  |
| Las funciones principales son accesibles desde botones visibles. Los formularios solicitan solo los datos necesarios. Las alertas operativas pueden enviarse mediante opciones rápidas y comprensibles. Los mensajes de error indican el problema de forma clara. La interfaz diferencia correctamente funciones públicas y administrativas. |  |  |  |  |  | Prueba de interfaz, prueba funcional y revisión de usabilidad |  |

| Id. Requerimiento | RNF-005 |  |  |  |  |  |  |
| ----- | :---: | ----- | ----- | ----- | ----- | ----- | ----- |
| **Nombre Requerimiento** | **Disponibilidad del servicio** |  |  |  |  |  |  |
| **Declaración** | **El sistema debe estar disponible para consultas públicas y operación administrativa durante los períodos definidos para el servicio del Transmetro.** |  |  |  |  |  |  |
| **Criterio de aceptación** |  |  |  |  |  | **Método de verificación** |  |
| Las funciones públicas pueden consultarse durante el horario definido del servicio. El sistema administrativo está disponible para usuarios autorizados durante la operación. Si una función no está disponible, el sistema muestra un mensaje claro al usuario. Las fallas no deben impedir el acceso a funciones no afectadas. |  |  |  |  |  | Prueba de interfaz, prueba funcional y revisión de usabilidad |  |

| Version | Fecha | Cambio |
| :---- | :---- | :---- |
| **1** | **11/9/2026** | **\-** |
| **1.1** | **12/9/2026** | **Se quito la parte del modulo publico, solo se dejo el pago expres.** |

