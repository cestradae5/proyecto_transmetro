import { useId, useState } from 'react';
import type { Parada } from '../../types/infrastructure.types';
import type { UseLineaParadasResult } from '../../hooks/use-linea-paradas';
import type { ParadaEstacionGateway } from '../../hooks/save-parada-estacion';
import { ParadaAddPanel } from './parada-add-panel';
import { CARD_CLASS, DANGER_BUTTON_CLASS, ErrorAlert, SECONDARY_BUTTON_CLASS, errorMessage } from './wizard-ui';

interface ParadasSectionProps {
  lineaParadas: UseLineaParadasResult;
  /** All paradas: used for the "Estación" badge and the "Elegir existente" list. */
  paradas: Parada[];
  paradaGateway: ParadaEstacionGateway;
}

const ICON_BUTTON_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed';

export function ParadasSection({ lineaParadas, paradas, paradaGateway }: ParadasSectionProps) {
  const uid = useId();
  const { lineaParadas: rows, loading, error: loadError, refresh, addParada, updateParada, removeParada, reorderParadas } =
    lineaParadas;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ids may arrive as numbers or strings: compare as strings.
  const inLinea = new Set(rows.map((r) => String(r.idParada)));
  const available = paradas.filter((p) => !inLinea.has(String(p.idParada)));
  const isEstacion = (idParada: string) => paradas.find((p) => String(p.idParada) === String(idParada))?.esEstacion ?? false;
  const nextOrden = rows.reduce((max, r) => Math.max(max, r.orden), 0) + 1;

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err: unknown) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, delta: -1 | 1) => {
    const ids = rows.map((r) => String(r.idLineaParada));
    ids.splice(index + delta, 0, ...ids.splice(index, 1));
    return run(() => reorderParadas(ids), 'Error al cambiar el orden');
  };

  const remove = (idLineaParada: string, nombre: string) => {
    if (!confirm(`¿Quitar la parada ${nombre} de la línea?`)) return;
    return run(() => removeParada(idLineaParada), 'Error al quitar la parada');
  };

  const titleId = `${uid}-title`;

  return (
    <section className={CARD_CLASS} aria-labelledby={titleId}>
      <h3 id={titleId} className="text-lg font-semibold text-slate-900">Paradas</h3>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Recorrido de la línea en orden. Use las flechas para reordenar y edite los minutos hasta la siguiente parada.
      </p>

      {loadError ? (
        <ErrorAlert message={loadError}>
          <button type="button" onClick={() => refresh()} className={SECONDARY_BUTTON_CLASS}>Reintentar</button>
        </ErrorAlert>
      ) : loading && rows.length === 0 ? (
        <p className="text-sm text-slate-500">Cargando paradas...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Esta línea aún no tiene paradas. Una línea necesita al menos dos paradas para definir su recorrido: agréguelas abajo.
        </p>
      ) : (
        <ol aria-label="Paradas de la línea" className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((row, index) => (
            <ParadaRow
              key={row.idLineaParada}
              orden={row.orden}
              nombre={row.parada?.nombreParada ?? `Parada ${row.idParada}`}
              esEstacion={isEstacion(row.idParada)}
              minutos={row.minutosHastaSiguiente}
              disabled={busy}
              isFirst={index === 0}
              isLast={index === rows.length - 1}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onRemove={() => remove(row.idLineaParada, row.parada?.nombreParada ?? row.idParada)}
              onSaveMinutos={(value) =>
                run(() => updateParada(row.idLineaParada, { minutosHastaSiguiente: value }), 'Error al guardar los minutos')
              }
            />
          ))}
        </ol>
      )}

      <div className="mt-3">
        <ErrorAlert message={error} />
      </div>

      <div className="mt-4">
        <ParadaAddPanel
          availableParadas={available}
          nextOrden={nextOrden}
          addToLinea={addParada}
          paradaGateway={paradaGateway}
        />
      </div>
    </section>
  );
}

interface ParadaRowProps {
  orden: number;
  nombre: string;
  esEstacion: boolean;
  minutos: number;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onSaveMinutos: (value: number) => Promise<void>;
}

function ParadaRow({ orden, nombre, esEstacion, minutos, disabled, isFirst, isLast, onMoveUp, onMoveDown, onRemove, onSaveMinutos }: ParadaRowProps) {
  const uid = useId();
  const [value, setValue] = useState(String(minutos));
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0;
  const changed = valid && parsed !== minutos;
  const minutosId = `${uid}-minutos`;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {orden}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {nombre}
          {esEstacion && (
            <span className="ml-2 rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Estación</span>
          )}
        </p>
      </div>
      <form
        noValidate
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) void onSaveMinutos(parsed);
        }}
      >
        <label htmlFor={minutosId} className="text-xs text-slate-500">Minutos hasta la siguiente</label>
        <input
          id={minutosId}
          type="number"
          min="0"
          step="1"
          aria-invalid={!valid}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button type="submit" disabled={disabled || !changed} aria-label={`Guardar minutos de ${nombre}`} className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
          Guardar
        </button>
      </form>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onMoveUp} disabled={disabled || isFirst} aria-label={`Subir ${nombre}`} className={ICON_BUTTON_CLASS}>
          <span aria-hidden="true">↑</span>
        </button>
        <button type="button" onClick={onMoveDown} disabled={disabled || isLast} aria-label={`Bajar ${nombre}`} className={ICON_BUTTON_CLASS}>
          <span aria-hidden="true">↓</span>
        </button>
        <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Quitar ${nombre}`} className={DANGER_BUTTON_CLASS}>
          Quitar
        </button>
      </div>
    </li>
  );
}
