# Infrastructure Module

## Overview

The Infrastructure module manages the complete transportation infrastructure of Transmetro, including municipalities, lines, stops, stations, stop accesses, parking lots, and disruptions. It provides a comprehensive CRUD interface with search, filtering, and real-time status tracking.

Tabs follow the creation flow: **Municipalidades → Líneas → Paradas → Parqueos → Afectaciones** (default: Municipalidades). The tabs are for review and editing only (T8 replaces them with a grouped view).

**Creation paths:** the "Nueva infraestructura" button opens the wizard, the only
way to create municipalidades, líneas, paradas (and estaciones) and parqueos.
Afectaciones are operational and keep their own "Nueva afectación" button on
the Afectaciones tab. Accesos are created from the paradas table ("Accesos").

## "Nueva infraestructura" wizard

`components/wizard/` — a large modal with a stepper header (`wizard-stepper.tsx`).
Steps are `locked` (disabled, with a hint of what unlocks them), `active`, or
`done` (with a summary). Each step persists to the API when completed; there is
no draft, so closing mid-way (button or Escape) asks for confirmation once
step 1 is done and keeps what was already saved. Closing after saving reloads
the page data (the wizard uses its own hook instances).

1. **Municipalidad** (`step-municipalidad.tsx`): "Elegir existente" (ACTIVA
   only) or "Crear nueva" (nombre ≤120, departamento ≤60; 409 → "Ya existe una
   municipalidad con ese nombre"). Read-only once the línea exists.
2. **Línea** (`step-linea.tsx`): número (≤10), nombre (≤120), color, tipo de
   recorrido, estado; created with `idParqueo: null`, then linked with
   `POST /lineas/:id/municipalidades` (`linkMunicipalidadToLinea`). If the link
   fails, "Reintentar vínculo" retries only the link (the línea is not created
   again).
3. **Paradas y parqueo** (`step-paradas-parqueo.tsx`):
   - `parqueo-section.tsx`: "Sin parqueo asignado" or the assigned one;
     "Elegir existente" + "Asignar", or "Crear nuevo" + "Crear y asignar"
     (PATCH `idParqueo`); "Quitar" sends `null`. A parqueo created whose
     assignment failed is reused on retry.
   - `paradas-section.tsx`: the línea's ordered paradas (Estación badge,
     inline "Minutos hasta la siguiente" save via PATCH, up/down via
     `reorderParadas` → `PUT /lineas/:id/paradas/orden` with the full id list,
     "Quitar" with the `LINEA_MIN_PARADAS` message).
   - `parada-add-panel.tsx`: "Elegir existente" (paradas not in the línea) or
     "Crear nueva" (nombre, coordenadas, "Es estación" + nombre; saved with
     `saveParadaWithEstacion`, the estación reuses the parada's coordinates);
     appended at `orden = max + 1`. A retry after a partial failure never
     creates the parada (or its estación) twice.
   - "Finalizar" shows a summary (municipalidad, línea, paradas, parqueo);
     "Cerrar" closes and reloads.

## File Structure

```
infrastructure/
├── components/
│   ├── afectaciones/
│   │   ├── afectacion-dialog.tsx    # Create/Edit modal for disruptions
│   │   ├── afectacion-form.tsx      # Form with XOR validation (parada OR estacion)
│   │   └── afectaciones-table.tsx   # Table with search/filter
│   ├── lineas/
│   │   ├── linea-dialog.tsx         # Create/Edit modal for lines
│   │   ├── linea-form.tsx           # Form with color picker
│   │   ├── linea-parada-*.tsx       # "Gestionar paradas" dialog (ordered sequence)
│   │   ├── linea-municipalidades-dialog.tsx # "Municipalidades" dialog (link/unlink)
│   │   └── lineas-table.tsx         # Table with search/filter
│   ├── municipalidades/
│   │   ├── municipalidad-dialog.tsx # Create/Edit modal for municipalities
│   │   ├── municipalidad-form.tsx   # Form (nombre ≤120, departamento ≤60, estado)
│   │   └── municipalidades-table.tsx # Table with search, "Desactivar" (soft delete)
│   ├── paradas/
│   │   ├── parada-dialog.tsx        # Create/Edit modal for stops
│   │   ├── parada-form.tsx          # Form with validation + "Es estación" toggle
│   │   ├── accesos-dialog.tsx       # "Accesos" dialog: list/create/edit/deactivate
│   │   ├── acceso-form.tsx          # Acceso form (coords prefilled from the parada)
│   │   └── paradas-table.tsx        # Table with search/filter, Estación badge, station lines, accesos
│   ├── wizard/
│   │   ├── infrastructure-wizard.tsx # "Nueva infraestructura" modal: state, close confirm, Escape
│   │   ├── wizard-stepper.tsx       # Stepper header (done/active/locked)
│   │   ├── step-municipalidad.tsx   # Step 1
│   │   ├── step-linea.tsx           # Step 2 (create + link, link retry)
│   │   ├── step-paradas-parqueo.tsx # Step 3 container + Finalizar
│   │   ├── parqueo-section.tsx      # Step 3 parqueo card
│   │   ├── paradas-section.tsx      # Step 3 ordered paradas card
│   │   ├── parada-add-panel.tsx     # Step 3 "Agregar parada"
│   │   └── wizard-ui.tsx            # Shared classes, ErrorAlert, ModeToggle
│   └── parqueos/
│       ├── parqueo-dialog.tsx       # Edit modal for parking lots
│       ├── parqueo-form.tsx         # Form with validation
│       └── parqueos-table.tsx       # Table with search/filter
├── hooks/
│   ├── use-accesos.ts               # API hook for a parada's accesos (mapped Spanish errors)
│   ├── use-afectaciones.ts          # API hook for disruptions
│   ├── use-estaciones.ts            # API hook for stations
│   ├── use-lineas.ts                # API hook for lines
│   ├── use-linea-municipalidades.ts # API hook for línea ↔ municipalidad links (mapped errors)
│   ├── use-linea-paradas.ts         # API hook for a línea's parada sequence (mapped errors, reorderParadas)
│   ├── use-municipalidades.ts       # API hook for municipalities (mapped Spanish errors)
│   ├── use-paradas.ts               # API hook for stops
│   ├── save-parada-estacion.ts      # Parada save + estación create/update/force-delete
│   └── use-parqueos.ts              # API hook for parking lots
├── types/
│   └── infrastructure.types.ts      # TypeScript types and DTOs
├── index.tsx                        # Main page: tabs + "Nueva infraestructura" wizard
└── README.md                        # This file

```

## Entities

### Municipalidad (Municipality)
First step of the creation flow. Líneas are linked to municipalidades (N:M)
from the lineas table ("Municipalidades" action): the dialog lists the linked
municipalidades, offers only ACTIVA municipalidades not yet linked, and removes
links after confirmation. A duplicate link (409 `LINEA_MUNICIPALIDAD_DUPLICATE`)
shows "La municipalidad ya está asignada a la línea". The lineas table does not
show municipalidad names per row (that would need one request per línea).

**Fields:**
- `nombre` (required, max 120, unique): duplicate → "Ya existe una municipalidad con ese nombre" (409 `MUNICIPALIDAD_NOMBRE_DUPLICATE`)
- `departamento` (required, max 60)
- `estado` (required): ACTIVA | INACTIVA

"Desactivar" calls `DELETE /infrastructure/municipalidades/:id`, a soft delete
to INACTIVA (only offered for ACTIVA rows; links to líneas are kept).

### Acceso (Stop entrance)
Belongs to a parada (`/infrastructure/paradas/:id/accesos`). Managed from the
paradas table ("Accesos" action). On create, latitud/longitud are prefilled
with the parada's coordinates. "Desactivar" is a soft delete to DESHABILITADO
(only offered for HABILITADO rows).

**Fields:**
- `nombre` (required, max 120)
- `tipo` (required): PEATONAL | RAMPA | ESCALERA | ELEVADOR
- `estado` (required): HABILITADO | DESHABILITADO
- `latitud` (required, -90 to 90), `longitud` (required, -180 to 180)

### 1. Parada (Stop)
Basic bus stop in the system.

**Fields:**
- `nombre` (required): Stop name
- `latitud` (required): GPS latitude (-90 to 90)
- `longitud` (required): GPS longitude (-180 to 180)
- `estado` (required): ABIERTA | CERRADA

### 2. Estación (Station)
A 1:1 extension of a parada (`id_parada` NOT NULL UNIQUE). There is no
standalone Estaciones tab: the parada form's "Es estación" toggle creates or
updates the estación (blank coordinates default to the parada's). Turning the
toggle off on a parada that has an estación asks for confirmation and, on save,
hard-deletes it (`DELETE /infrastructure/estaciones/:id?force=true`); a 409
`ESTACION_IN_USE` keeps the toggle on with "No se puede quitar la estación
porque tiene asignaciones o vínculos". The station's líneas are managed from the
paradas table ("Líneas de la estación", reusing the fleet dialog).

**Fields:**
- `nombre` (required): Station name
- `latitud`/`longitud` (required by the API; default to the parada's)
- `estado` (required): ACTIVA | CERRADA | MANTENIMIENTO

### 3. Parqueo (Parking Lot)
Bus parking facility (no estación link: `id_estacion` was dropped).

**Fields:**
- `nombre` (required): Parking lot name
- `tipo_parqueo` (required): PUBLICO | PRIVADO | MIXTO
- `direccion` (required): Street address
- `latitud` (required): GPS latitude (-90 to 90)
- `longitud` (required): GPS longitude (-180 to 180)
- `capacidad_unidades` (required): Number of buses (>= 0)
- `estado` (required): ABIERTA | CERRADA

### 4. Línea (Bus Line)
A numbered route with a color identifier.

**Fields:**
- `numero_linea` (required): Line identifier (e.g., "L1", "T2")
- `nombre_linea` (required): Line name
- `color_hex` (required): Hex color code (e.g., "#FF0000")
- `tipo_recorrido` (required): CIRCULAR | LINEAL
- `id_parqueo` (optional): Home parking lot ID; "Sin parqueo" sends `null`
- `estado` (required): ACTIVA | INACTIVA

**Special Feature:** Color picker input for `color_hex`

### 5. Afectación (Disruption)
Service disruptions affecting stops or stations.

**Fields:**
- `tipo_afectacion` (required): DESVIO | CIERRE_TEMPORAL | MANTENIMIENTO
- `motivo` (required): Text description of the disruption
- `fecha_inicio` (required): Start date
- `fecha_fin` (optional): End date
- `id_parada` XOR `id_estacion` (required): Exactly ONE must be set
- `estado` (required): ABIERTA | CERRADA

**Special Feature:** XOR validation ensures a disruption affects either a stop OR a station, never both.

## Adding a New Entity

To add a new entity to the infrastructure module:

1. **Define Types** in `types/infrastructure.types.ts`:
   ```typescript
   export interface MyEntity {
     id: number;
     nombre: string;
     estado: EstadoInfraestructura;
     fecha_creacion: string;
     fecha_actualizacion: string;
   }
   
   export type CreateMyEntityDto = Omit<MyEntity, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
   export type UpdateMyEntityDto = Partial<CreateMyEntityDto>;
   ```

2. **Create API Hook** in `hooks/use-my-entity.ts`:
   ```typescript
   import { useState, useEffect, useCallback } from 'react';
   import { apiClient } from '../../../lib/api-client';
   import type { MyEntity, CreateMyEntityDto, UpdateMyEntityDto } from '../types/infrastructure.types';
   
   export function useMyEntity() {
     const [entities, setEntities] = useState<MyEntity[]>([]);
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState<string | null>(null);
   
     const fetchEntities = useCallback(async () => {
       setLoading(true);
       try {
         const data = await apiClient.get<MyEntity[]>('/infrastructure/my-entity');
         setEntities(data);
       } catch (err: any) {
         setError(err.message);
       } finally {
         setLoading(false);
       }
     }, []);
   
     const createEntity = async (data: CreateMyEntityDto) => {
       const result = await apiClient.post<MyEntity>('/infrastructure/my-entity', data);
       await fetchEntities();
       return result;
     };
   
     const updateEntity = async (id: number, data: UpdateMyEntityDto) => {
       const result = await apiClient.patch<MyEntity>(`/infrastructure/my-entity/${id}`, data);
       await fetchEntities();
       return result;
     };
   
     const deleteEntity = async (id: number) => {
       await apiClient.delete(`/infrastructure/my-entity/${id}`);
       await fetchEntities();
     };
   
     useEffect(() => {
       fetchEntities();
     }, [fetchEntities]);
   
     return { entities, loading, error, createEntity, updateEntity, deleteEntity };
   }
   ```

3. **Create Components** in `components/my-entity/`:
   - `my-entity-dialog.tsx` - Modal wrapper
   - `my-entity-form.tsx` - Form with validation
   - `my-entity-table.tsx` - Table with search

4. **Add to Main Page** in `index.tsx`:
   ```typescript
   // Import hook and components
   import { useMyEntity } from './hooks/use-my-entity';
   import { MyEntityDialog } from './components/my-entity/my-entity-dialog';
   import { MyEntityTable } from './components/my-entity/my-entity-table';
   
   // Add to tabs array
   { id: 'my-entity', label: 'My Entities', count: myEntities.length }
   
   // Add to handleCreate switch
   case 'my-entity':
     await createMyEntity(data);
     break;
   
   // Add table render
   {activeTab === 'my-entity' && (
     <MyEntityTable entities={myEntities} onUpdate={updateMyEntity} onDelete={deleteMyEntity} />
   )}
   
   // Add dialog render
   {showCreateDialog && activeTab === 'my-entity' && (
     <MyEntityDialog onSave={handleCreate} onClose={() => setShowCreateDialog(false)} />
   )}
   ```

## API Integration

All API calls use the centralized `apiClient` from `lib/api-client.ts`.

**Base URL:** `/infrastructure`

**Endpoints per entity:**
- `GET /infrastructure/{entity}` - List all
- `POST /infrastructure/{entity}` - Create
- `GET /infrastructure/{entity}/:id` - Get one
- `PATCH /infrastructure/{entity}/:id` - Update
- `DELETE /infrastructure/{entity}/:id` - Delete

**Error Handling:**
All hooks expose an `error` state that can be used for error boundaries or toast notifications.

## Permissions

This module requires the `INFRAESTRUCTURA_GESTIONAR` permission. Users without this permission are redirected to the landing page.

## Validation Rules

All forms implement client-side validation:

- **Required fields:** Marked with `*` in the UI
- **Coordinates:** Latitude (-90 to 90), Longitude (-180 to 180)
- **Numbers:** Non-negative integers for capacity
- **Dates:** End date must be after start date (Afectaciones)
- **XOR Logic:** Afectaciones must have exactly one of `id_parada` or `id_estacion`
- **Color Hex:** Must match pattern `/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/`

## UI Patterns

### Estado Badges
```tsx
<span className={`px-2 py-1 text-xs font-medium rounded ${
  estado === 'ABIERTA'
    ? 'bg-green-100 text-green-700'
    : 'bg-red-100 text-red-700'
}`}>
  {estado}
</span>
```

### Loading States
All buttons show loading spinners:
```tsx
<button disabled={submitting}>
  {submitting ? 'Guardando...' : 'Guardar'}
</button>
```

### Error Display
```tsx
{errors.submit && (
  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
    {errors.submit}
  </div>
)}
```

## Testing Checklist

- [ ] All 5 entities load correctly
- [ ] Create new records works
- [ ] Edit existing records works
- [ ] Delete records works (with confirmation)
- [ ] Search/filter works
- [ ] Form validation shows errors
- [ ] Estado badges show correct colors
- [ ] XOR validation works (Afectaciones)
- [ ] Color picker works (Líneas)
- [ ] Permission check redirects properly
- [ ] Loading states show during API calls
- [ ] Error messages display on failures

## Future Enhancements

- [ ] Pagination for large datasets
- [ ] Advanced filtering (by date, status, type)
- [ ] Export to CSV/Excel
- [ ] Bulk operations
- [ ] Map view for coordinates
- [ ] Audit log for changes
- [ ] Soft delete / restore
