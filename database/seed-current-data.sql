-- ---------------------------------------------------------------------------
-- seed-current-data.sql
-- ---------------------------------------------------------------------------
-- Purpose: reload the data that currently exists in the local `transmetro`
-- database, on the infrastructure flow schema (Municipalidad -> Linea ->
-- Parada/Estacion -> Acceso).
--
-- Usage: run AFTER database/init.sql on a freshly created database, e.g.
--   psql -v ON_ERROR_STOP=1 -d <db> -f database/init.sql
--   psql -v ON_ERROR_STOP=1 -d <db> -f database/seed-current-data.sql
--
-- Generated: 2026-10-12, from `pg_dump --data-only --column-inserts` of the
-- local `transmetro` database.
--
-- Notes:
-- - tbl_bitacora and tbl_sesion are intentionally not seeded.
-- - tbl_parqueo.id_estacion no longer exists in init.sql and is omitted (the
--   source database still carries that legacy column).
-- - tbl_municipalidad and tbl_linea_municipalidad are seeded with their
--   current rows.
-- - tbl_acceso is included only when the source database has rows; it is
--   currently empty, so it starts empty.
-- - Rows that init.sql already inserts (roles, permissions, role-permission
--   links, admin employee) use ON CONFLICT DO NOTHING, so init.sql values win.
-- - Permissions and role-permission links are matched by their natural keys
--   (codigo / codigo_permiso), not by the source ids: the source database
--   assigned different id_permiso values than a fresh init.sql run does, so
--   copying ids would link roles to the wrong permissions.
-- ---------------------------------------------------------------------------

SET client_encoding = 'UTF8';

BEGIN;

-- Roles (same ids and codes as init.sql).
INSERT INTO tbl_rol (id_rol, nombre_rol, codigo, descrip_rol, activo, creado_en, actualizado_en) VALUES
    (1, 'Piloto', 'PILOTO', 'Personal responsable de una unidad asignada.', true, '2026-09-16 22:22:59.301146-06', '2026-10-12 07:10:38.792582-06'),
    (2, 'Guardia', 'GUARDIA', 'Personal de seguridad sin permisos operativos asignados.', true, '2026-09-16 22:22:59.301146-06', '2026-10-12 07:10:38.792582-06'),
    (3, 'Operador de estación', 'OPERADOR_ESTACION', 'Personal responsable de una estación asignada.', true, '2026-09-16 22:22:59.301146-06', '2026-10-12 07:10:38.792582-06'),
    (4, 'Operador central', 'OPERADOR_CENTRAL', 'Personal responsable del panel operativo central.', true, '2026-09-16 22:22:59.301146-06', '2026-10-12 07:10:38.792582-06'),
    (5, 'Administrador del sistema', 'ADMINISTRADOR_SISTEMA', 'Personal responsable de la administración del sistema.', true, '2026-09-16 22:22:59.301146-06', '2026-10-12 07:10:38.792582-06')
ON CONFLICT DO NOTHING;

-- Permissions, matched by codigo_permiso. The first four are legacy codes
-- present in the source database but not in init.sql.
INSERT INTO tbl_permiso (codigo_permiso, accion_permiso) VALUES
    ('PERFIL_CONSULTAR', 'Consultar perfil'),
    ('UNIDAD_ASIGNADA_CONTROLAR', 'Controlar unidad asignada'),
    ('ESTACION_ASIGNADA_GESTIONAR', 'Gestionar estación asignada'),
    ('ALERTAS_ENVIAR_ATENDER', 'Enviar y atender alertas'),
    ('PERFIL_PROPIO_CONSULTAR', 'Consultar perfil propio'),
    ('EMPLEADOS_PERFILES_ADMINISTRAR', 'Administrar empleados y perfiles'),
    ('ROLES_PERMISOS_ADMINISTRAR', 'Administrar roles y permisos'),
    ('INFRAESTRUCTURA_GESTIONAR', 'Gestionar infraestructura'),
    ('FLOTA_GESTIONAR', 'Gestionar flota'),
    ('FLOTA_ESTACION_SOLICITAR', 'Solicitar flota para estación'),
    ('FLOTA_ESTACION_CONSULTAR', 'Consultar flota de estación'),
    ('UNIDAD_ASIGNADA_CONSULTAR', 'Consultar unidad asignada'),
    ('METRICAS_UNIDAD_REPORTAR', 'Reportar métricas de unidad'),
    ('ALERTAS_ESTACION_GESTIONAR', 'Gestionar alertas de estación'),
    ('ALERTAS_UNIDAD_GESTIONAR', 'Gestionar alertas de unidad'),
    ('ALERTAS_OPERATIVAS_GESTIONAR', 'Gestionar alertas operativas'),
    ('PANEL_OPERATIVO_CENTRAL_USAR', 'Usar panel operativo central'),
    ('REPORTES_ADMINISTRATIVOS_CONSULTAR', 'Consultar reportes administrativos'),
    ('AUDITORIA_BITACORA_CONSULTAR', 'Consultar auditoría y bitácora'),
    ('RECARGAS_REPORTES_CONSULTAR', 'Consultar reportes de recargas')
ON CONFLICT DO NOTHING;

-- Role-permission links, matched by (rol.codigo, permiso.codigo_permiso).
INSERT INTO tbl_rol_permiso (id_rol, id_permiso)
SELECT rol.id_rol, permiso.id_permiso
FROM (VALUES
    ('ADMINISTRADOR_SISTEMA', 'PERFIL_CONSULTAR'),
    ('ADMINISTRADOR_SISTEMA', 'EMPLEADOS_PERFILES_ADMINISTRAR'),
    ('ADMINISTRADOR_SISTEMA', 'ROLES_PERMISOS_ADMINISTRAR'),
    ('ADMINISTRADOR_SISTEMA', 'INFRAESTRUCTURA_GESTIONAR'),
    ('ADMINISTRADOR_SISTEMA', 'FLOTA_GESTIONAR'),
    ('ADMINISTRADOR_SISTEMA', 'UNIDAD_ASIGNADA_CONTROLAR'),
    ('ADMINISTRADOR_SISTEMA', 'ESTACION_ASIGNADA_GESTIONAR'),
    ('ADMINISTRADOR_SISTEMA', 'PANEL_OPERATIVO_CENTRAL_USAR'),
    ('ADMINISTRADOR_SISTEMA', 'REPORTES_ADMINISTRATIVOS_CONSULTAR'),
    ('ADMINISTRADOR_SISTEMA', 'AUDITORIA_BITACORA_CONSULTAR'),
    ('ADMINISTRADOR_SISTEMA', 'ALERTAS_ENVIAR_ATENDER'),
    ('ADMINISTRADOR_SISTEMA', 'PERFIL_PROPIO_CONSULTAR'),
    ('ADMINISTRADOR_SISTEMA', 'FLOTA_ESTACION_SOLICITAR'),
    ('ADMINISTRADOR_SISTEMA', 'UNIDAD_ASIGNADA_CONSULTAR'),
    ('ADMINISTRADOR_SISTEMA', 'METRICAS_UNIDAD_REPORTAR'),
    ('ADMINISTRADOR_SISTEMA', 'ALERTAS_ESTACION_GESTIONAR'),
    ('ADMINISTRADOR_SISTEMA', 'ALERTAS_UNIDAD_GESTIONAR'),
    ('ADMINISTRADOR_SISTEMA', 'ALERTAS_OPERATIVAS_GESTIONAR'),
    ('ADMINISTRADOR_SISTEMA', 'RECARGAS_REPORTES_CONSULTAR'),
    ('ADMINISTRADOR_SISTEMA', 'FLOTA_ESTACION_CONSULTAR'),
    ('PILOTO', 'PERFIL_PROPIO_CONSULTAR'),
    ('PILOTO', 'UNIDAD_ASIGNADA_CONSULTAR'),
    ('PILOTO', 'METRICAS_UNIDAD_REPORTAR'),
    ('PILOTO', 'ALERTAS_UNIDAD_GESTIONAR'),
    ('GUARDIA', 'PERFIL_PROPIO_CONSULTAR'),
    ('OPERADOR_ESTACION', 'PERFIL_PROPIO_CONSULTAR'),
    ('OPERADOR_ESTACION', 'FLOTA_ESTACION_SOLICITAR'),
    ('OPERADOR_ESTACION', 'ALERTAS_ESTACION_GESTIONAR'),
    ('OPERADOR_ESTACION', 'FLOTA_ESTACION_CONSULTAR'),
    ('OPERADOR_CENTRAL', 'EMPLEADOS_PERFILES_ADMINISTRAR'),
    ('OPERADOR_CENTRAL', 'INFRAESTRUCTURA_GESTIONAR'),
    ('OPERADOR_CENTRAL', 'FLOTA_GESTIONAR'),
    ('OPERADOR_CENTRAL', 'PANEL_OPERATIVO_CENTRAL_USAR'),
    ('OPERADOR_CENTRAL', 'REPORTES_ADMINISTRATIVOS_CONSULTAR'),
    ('OPERADOR_CENTRAL', 'AUDITORIA_BITACORA_CONSULTAR'),
    ('OPERADOR_CENTRAL', 'PERFIL_PROPIO_CONSULTAR'),
    ('OPERADOR_CENTRAL', 'ALERTAS_OPERATIVAS_GESTIONAR'),
    ('OPERADOR_CENTRAL', 'RECARGAS_REPORTES_CONSULTAR'),
    ('OPERADOR_CENTRAL', 'FLOTA_ESTACION_CONSULTAR')
) AS link (codigo_rol, codigo_permiso)
INNER JOIN tbl_rol AS rol ON rol.codigo = link.codigo_rol
INNER JOIN tbl_permiso AS permiso ON permiso.codigo_permiso = link.codigo_permiso
ON CONFLICT DO NOTHING;

-- Employees. id_emple 1 is the admin already inserted by init.sql (kept as-is).
INSERT INTO tbl_empleado (id_emple, nombre_emple, estado_emple, correo_emple, id_rol, telefono_emple, dpi_emple, fecha_ingreso_emple, direccion_emple, licencia_emple, historial_educativo_emple, idiomas_emple) VALUES
    (1, 'admin', 'ACTIVO', 'cestradae5@miumg.edu.gt', 5, '+50247069196', '3710345660101', '2026-10-02', '14 av 9-65 zona 11 colonia carabanchell', NULL, NULL, NULL),
    (61, 'cesar', 'ACTIVO', 'cesarestradaelias2003@gmail.com', 1, '+50247069196', '3710345660102', '2026-10-09', '14 av 9-65 zona 11 colonia carabanchell', '3710345660101', 'Primero basico', 'español')
ON CONFLICT DO NOTHING;

-- Infrastructure, in FK order: municipalidad -> parqueo -> linea ->
-- linea_municipalidad -> parada -> estacion -> linea_parada ->
-- estacion_linea -> afectacion -> asignacion_estacion.
INSERT INTO tbl_municipalidad (id_municipalidad, nombre_municipalidad, departamento, estado_municipalidad) VALUES
    (1, 'Guatemala', 'Guatemala', 'ACTIVA');

INSERT INTO tbl_parqueo (id_parqueo, nombre_parqueo, tipo_parqueo, direccion, latitud, longitud, capacidad_unidades, estado_parqueo) VALUES
    (1, 'Transmetro Playa 4', 'AUXILIAR', 'Anillo periferico', 14.64804680, -90.53170960, 30, 'ACTIVO'),
    (2, 'Transmetro Playa 1 Línea 12', 'AUXILIAR', '21a avenida Plaza central zur', 14.56122480, -90.56350830, 115, 'ACTIVO'),
    (3, 'Transmetro Playa 2', 'CENTRAL', 'calzada Atanasio Tzul 6av z.4', 14.62304390, -90.51881010, 30, 'ACTIVO');

INSERT INTO tbl_linea (id_linea, numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido, id_parqueo) VALUES
    (1, 'L2', 'Linea 2 (Hipodromo)', '#b45bcd', 'ACTIVA', 'CIRCULAR', 3),
    (10, 'L1', 'Linea 1 San Sebastián', '#ff0033', 'ACTIVA', 'CIRCULAR', 3),
    (13, 'L6', 'Linea 6 Proyectos', '#fbff00', 'ACTIVA', 'CIRCULAR', NULL);

INSERT INTO tbl_linea_municipalidad (id_linea, id_municipalidad) VALUES
    (1, 1),
    (10, 1),
    (13, 1);

INSERT INTO tbl_parada (id_parada, nombre_parada, latitud, longitud, estado_parada) VALUES
    (4, 'san Sebastian', 14.64582000, -90.51306000, 'ACTIVA'),
    (5, 'Simeon Cañas', 14.65388000, -90.51184000, 'ACTIVA'),
    (6, 'Hipodromo del Norte', 14.65920000, -90.50985000, 'ACTIVA'),
    (7, 'San José de la Montaña', 14.65385000, -90.51201000, 'ACTIVA'),
    (8, 'Jocotenango', 14.65098000, -90.51310000, 'ACTIVA'),
    (20, 'Mercado Central', 14.64242000, -90.51149000, 'ACTIVA'),
    (21, 'Correos', 14.63716000, -90.51222000, 'ACTIVA'),
    (22, 'Beatas de Belén', 14.63337000, -90.51277000, 'ACTIVA'),
    (23, 'Paseo de las Letras', 14.62989000, -90.51332000, 'ACTIVA'),
    (24, 'Centro Civico', 14.62773000, -90.51489000, 'ACTIVA'),
    (25, 'Sur 2', 14.63129000, -90.51632000, 'ACTIVA'),
    (26, 'Gómez Carrillo', 14.63459000, -90.51578000, 'ACTIVA'),
    (27, 'San Agustín', 14.63869000, -90.51525000, 'ACTIVA'),
    (28, 'Parque Centenario', 14.64206000, -90.51478000, 'ACTIVA'),
    (29, 'Fegua', 14.63051000, -90.51179000, 'ACTIVA'),
    (30, 'Francos y Monrroy', 14.63268000, -90.50937000, 'ACTIVA'),
    (31, 'Parque Colón', 14.63996000, -90.50832000, 'ACTIVA'),
    (32, 'Cerro del Carmen', 14.64805000, -90.50493000, 'ACTIVA'),
    (33, 'Parroquia', 14.65005000, -90.49984000, 'ACTIVA'),
    (34, 'IGSS zona 6', 14.65154000, -90.49745000, 'ACTIVA'),
    (35, 'Centro zona 6', 14.65499000, -90.49598000, 'ACTIVA'),
    (36, 'Academia', 14.65909000, -90.49407000, 'ACTIVA'),
    (37, 'Cipresales', 14.66525000, -90.49385000, 'ACTIVA'),
    (38, 'Proyectos 4-4', 14.66752000, -90.49205000, 'ACTIVA'),
    (39, 'Proyectos', 14.67317000, -90.48743000, 'ACTIVA'),
    (40, 'Quintanal', 14.65854000, -90.49603000, 'ACTIVA'),
    (41, 'Corpus Christi', 14.65612000, -90.49721000, 'ACTIVA'),
    (42, 'José Martí', 14.65294000, -90.49995000, 'ACTIVA'),
    (43, 'Santa Teresa', 14.64418000, -90.50914000, 'ACTIVA'),
    (44, 'Capuchinas', 14.63843000, -90.50992000, 'ACTIVA');

INSERT INTO tbl_estacion (id_estacion, nombre_estacion, latitud, longitud, estado_estacion, id_parada) VALUES
    (5, 'San Sebastian est', 14.64582000, -90.51306000, 'ACTIVA', 4),
    (6, 'Centro Civico est', 14.62773000, -90.51489000, 'ACTIVA', 24),
    (7, 'Fegua est', 14.63051000, -90.51179000, 'ACTIVA', 29),
    (8, 'Parq. Colón est', 14.63996000, -90.50832000, 'ACTIVA', 31),
    (9, 'Cerro del Carmen est', 14.64805000, -90.50493000, 'ACTIVA', 32),
    (11, 'Capuchinas est', 14.63843000, -90.50992000, 'ACTIVA', 44);

INSERT INTO tbl_linea_parada (id_linea_parada, orden, minutos_hasta_siguiente, id_parada, id_linea) VALUES
    (1, 1, 8, 4, 1),
    (2, 2, 8, 5, 1),
    (3, 3, 8, 6, 1),
    (27, 4, 8, 7, 1),
    (5, 5, 8, 8, 1),
    (17, 1, 2, 26, 10),
    (18, 2, 2, 27, 10),
    (19, 3, 2, 28, 10),
    (20, 4, 2, 4, 10),
    (21, 5, 2, 20, 10),
    (22, 6, 2, 21, 10),
    (23, 7, 2, 22, 10),
    (24, 8, 2, 23, 10),
    (25, 9, 2, 25, 10),
    (26, 10, 2, 24, 10),
    (29, 1, 8, 29, 13),
    (30, 2, 8, 30, 13),
    (31, 3, 10, 31, 13),
    (33, 4, 8, 33, 13),
    (32, 5, 10, 32, 13),
    (34, 6, 20, 34, 13),
    (35, 7, 10, 35, 13),
    (36, 8, 8, 36, 13),
    (37, 9, 10, 37, 13),
    (38, 10, 10, 38, 13),
    (41, 11, 10, 39, 13),
    (42, 12, 10, 40, 13),
    (43, 13, 10, 41, 13),
    (44, 14, 10, 42, 13),
    (45, 15, 10, 43, 13),
    (46, 16, 10, 44, 13);

INSERT INTO tbl_estacion_linea (id_linea, id_estacion, tipo_punto, estado_asignacion) VALUES
    (10, 5, 'PRINCIPAL', 'ACTIVA');

INSERT INTO tbl_afectacion (id_afectacion, tipo_afectacion, motivo, fecha_inicio, fecha_fin, estado_afectacion, id_parada, id_estacion) VALUES
    (1, 'TEMPORAL', 'En mantenimiento', '2026-09-28 00:00:00-06', '2026-09-28 00:00:00-06', 'CERRADA', 8, NULL);

INSERT INTO tbl_asignacion_estacion (id_asignacion_estacion, fecha_asignacion, estado_asignacion, id_empleado, id_estacion) VALUES
    (3, '2026-10-06 08:34:04.321-06', 'ACTIVA', 1, 5);

-- Fleet.
INSERT INTO tbl_unidad (id_unidad, numero_placa, marca, modelo, anio, capacidad_pasajeros, estado_unidad, fecha_registro, fecha_actualizacion) VALUES
    (72, '123', 'mazda', 'T-800', 2026, 100, 'DISPONIBLE', '2026-10-01 19:10:56.297-06', '2026-10-09 18:52:11.298-06'),
    (73, '333', 'Toyota', 'T-500', 2003, 97, 'FUERA_DE_SERVICIO', '2026-10-06 08:49:52.929-06', '2026-10-12 08:42:36.687-06');

INSERT INTO tbl_asignacion_unidad (id_asignacion_unidad, fecha_asignacion, fecha_actualizacion, id_unidad, id_linea, id_linea_parada_actual, fecha_reporte_ubicacion) VALUES
    (19, '2026-10-01 20:07:20.474-06', '2026-10-12 08:41:55.837-06', 72, 13, NULL, NULL),
    (20, '2026-10-06 08:50:03.846-06', '2026-10-12 07:59:29.964-06', 73, 13, NULL, NULL);

INSERT INTO tbl_asignacion_piloto (id_asignacion_piloto, fecha_asignacion, fecha_actualizacion, id_empleado, id_unidad) VALUES
    (34, '2026-10-12 08:42:29.524-06', '2026-10-12 08:42:29.524-06', 61, 72);

-- Move identity sequences past the explicit ids inserted above.
SELECT setval(pg_get_serial_sequence('tbl_rol', 'id_rol'), COALESCE(MAX(id_rol), 1)) FROM tbl_rol;
SELECT setval(pg_get_serial_sequence('tbl_permiso', 'id_permiso'), COALESCE(MAX(id_permiso), 1)) FROM tbl_permiso;
SELECT setval(pg_get_serial_sequence('tbl_empleado', 'id_emple'), COALESCE(MAX(id_emple), 1)) FROM tbl_empleado;
SELECT setval(pg_get_serial_sequence('tbl_municipalidad', 'id_municipalidad'), COALESCE(MAX(id_municipalidad), 1)) FROM tbl_municipalidad;
SELECT setval(pg_get_serial_sequence('tbl_parqueo', 'id_parqueo'), COALESCE(MAX(id_parqueo), 1)) FROM tbl_parqueo;
SELECT setval(pg_get_serial_sequence('tbl_linea', 'id_linea'), COALESCE(MAX(id_linea), 1)) FROM tbl_linea;
SELECT setval(pg_get_serial_sequence('tbl_parada', 'id_parada'), COALESCE(MAX(id_parada), 1)) FROM tbl_parada;
SELECT setval(pg_get_serial_sequence('tbl_estacion', 'id_estacion'), COALESCE(MAX(id_estacion), 1)) FROM tbl_estacion;
SELECT setval(pg_get_serial_sequence('tbl_linea_parada', 'id_linea_parada'), COALESCE(MAX(id_linea_parada), 1)) FROM tbl_linea_parada;
SELECT setval(pg_get_serial_sequence('tbl_afectacion', 'id_afectacion'), COALESCE(MAX(id_afectacion), 1)) FROM tbl_afectacion;
SELECT setval(pg_get_serial_sequence('tbl_asignacion_estacion', 'id_asignacion_estacion'), COALESCE(MAX(id_asignacion_estacion), 1)) FROM tbl_asignacion_estacion;
SELECT setval(pg_get_serial_sequence('tbl_unidad', 'id_unidad'), COALESCE(MAX(id_unidad), 1)) FROM tbl_unidad;
SELECT setval(pg_get_serial_sequence('tbl_asignacion_unidad', 'id_asignacion_unidad'), COALESCE(MAX(id_asignacion_unidad), 1)) FROM tbl_asignacion_unidad;
SELECT setval(pg_get_serial_sequence('tbl_asignacion_piloto', 'id_asignacion_piloto'), COALESCE(MAX(id_asignacion_piloto), 1)) FROM tbl_asignacion_piloto;

COMMIT;
