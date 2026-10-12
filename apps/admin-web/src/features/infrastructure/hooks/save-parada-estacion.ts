import { ApiError } from '../../../lib/api-client';
import type {
  CreateEstacionDto,
  CreateParadaDto,
  Estacion,
  Parada,
  ParadaFormValues,
  UpdateEstacionDto,
  UpdateParadaDto,
} from '../types/infrastructure.types';

/** Error code the API returns (409) when a referenced estación cannot be hard-deleted. */
export const ESTACION_IN_USE = 'ESTACION_IN_USE';

export const ESTACION_IN_USE_MESSAGE =
  'No se puede quitar la estación porque tiene asignaciones o vínculos';

/** True when `error` is the API's 409 ESTACION_IN_USE response. */
export function isEstacionInUseError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.data as { error?: unknown } | undefined)?.error === ESTACION_IN_USE
  );
}

/** Hook operations the parada/estación save flow depends on. */
export interface ParadaEstacionGateway {
  createParada(data: CreateParadaDto): Promise<Parada>;
  updateParada(id: number | string, data: UpdateParadaDto): Promise<Parada>;
  createEstacion(data: CreateEstacionDto): Promise<Estacion>;
  updateEstacion(id: number | string, data: UpdateEstacionDto): Promise<Estacion>;
  deleteEstacion(id: number | string, force?: boolean): Promise<void>;
  refreshParadas(): Promise<void>;
}

/**
 * Saves a parada and then reconciles its estación (1:1 extension):
 * - toggle on + existing estación -> update it
 * - toggle on + no estación       -> create it for this parada
 * - toggle off + existing estación -> hard delete (`force=true`); a 409
 *   ESTACION_IN_USE propagates so the form can keep the toggle on
 *
 * The parada is saved first, so retrying after an estación error only
 * repeats an idempotent parada update.
 */
export async function saveParadaWithEstacion(
  paradaId: number | string | null,
  values: ParadaFormValues,
  gateway: ParadaEstacionGateway,
): Promise<void> {
  const saved =
    paradaId === null
      ? await gateway.createParada(values.parada)
      : await gateway.updateParada(paradaId, values.parada);

  const { estacion, idEstacion } = values;
  if (estacion && idEstacion != null) {
    await gateway.updateEstacion(idEstacion, estacion);
  } else if (estacion) {
    // The API validates idParada as a number; parada ids arrive as strings.
    await gateway.createEstacion({ ...estacion, idParada: Number(saved?.idParada ?? paradaId) });
  } else if (idEstacion != null) {
    await gateway.deleteEstacion(idEstacion, true);
  } else {
    return;
  }

  // esEstacion/idEstacion are derived by the API: reload the paradas.
  await gateway.refreshParadas();
}
