# Infrastructure Module

## Overview

The Infrastructure module manages the complete transportation infrastructure of Transmetro, including stops, stations, parking lots, lines, and disruptions. It provides a comprehensive CRUD interface with search, filtering, and real-time status tracking.

## File Structure

```
infrastructure/
├── components/
│   ├── afectaciones/
│   │   ├── afectacion-dialog.tsx    # Create/Edit modal for disruptions
│   │   ├── afectacion-form.tsx      # Form with XOR validation (parada OR estacion)
│   │   └── afectaciones-table.tsx   # Table with search/filter
│   ├── estaciones/
│   │   ├── estacion-dialog.tsx      # Create/Edit modal for stations
│   │   ├── estacion-form.tsx        # Form with validation
│   │   └── estaciones-table.tsx     # Table with search/filter
│   ├── lineas/
│   │   ├── linea-dialog.tsx         # Create/Edit modal for lines
│   │   ├── linea-form.tsx           # Form with color picker
│   │   └── lineas-table.tsx         # Table with search/filter
│   ├── paradas/
│   │   ├── parada-dialog.tsx        # Create/Edit modal for stops
│   │   ├── parada-form.tsx          # Form with validation
│   │   └── paradas-table.tsx        # Table with search/filter
│   └── parqueos/
│       ├── parqueo-dialog.tsx       # Create/Edit modal for parking lots
│       ├── parqueo-form.tsx         # Form with validation
│       └── parqueos-table.tsx       # Table with search/filter
├── hooks/
│   ├── use-afectaciones.ts          # API hook for disruptions
│   ├── use-estaciones.ts            # API hook for stations
│   ├── use-lineas.ts                # API hook for lines
│   ├── use-paradas.ts               # API hook for stops
│   └── use-parqueos.ts              # API hook for parking lots
├── types/
│   └── infrastructure.types.ts      # TypeScript types and DTOs
├── index.tsx                        # Main page with tabs
└── README.md                        # This file

```

## Entities

### 1. Parada (Stop)
Basic bus stop in the system.

**Fields:**
- `nombre` (required): Stop name
- `latitud` (required): GPS latitude (-90 to 90)
- `longitud` (required): GPS longitude (-180 to 180)
- `estado` (required): ABIERTA | CERRADA

### 2. Estación (Station)
Major transfer station that may contain a stop.

**Fields:**
- `nombre` (required): Station name
- `latitud` (required): GPS latitude (-90 to 90)
- `longitud` (required): GPS longitude (-180 to 180)
- `id_parada` (optional): Associated stop ID
- `estado` (required): ABIERTA | CERRADA

### 3. Parqueo (Parking Lot)
Bus parking facility that may be attached to a station.

**Fields:**
- `nombre` (required): Parking lot name
- `tipo_parqueo` (required): PUBLICO | PRIVADO | MIXTO
- `direccion` (required): Street address
- `latitud` (required): GPS latitude (-90 to 90)
- `longitud` (required): GPS longitude (-180 to 180)
- `capacidad_unidades` (required): Number of buses (>= 0)
- `id_estacion` (optional): Associated station ID
- `estado` (required): ABIERTA | CERRADA

### 4. Línea (Bus Line)
A numbered route with a color identifier.

**Fields:**
- `numero_linea` (required): Line identifier (e.g., "L1", "T2")
- `nombre_linea` (required): Line name
- `color_hex` (required): Hex color code (e.g., "#FF0000")
- `tipo_recorrido` (required): CIRCULAR | LINEAL
- `id_parqueo` (optional): Home parking lot ID
- `estado` (required): ABIERTA | CERRADA

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
