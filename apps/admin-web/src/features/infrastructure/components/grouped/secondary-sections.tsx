import { useState } from 'react';
import type {
  Afectacion,
  Estacion,
  Linea,
  Parada,
  ParadaFormValues,
  Parqueo,
  UpdateParqueoDto,
} from '../../types/infrastructure.types';
import { ParqueosTable } from '../parqueos/parqueos-table';
import { ParadasTable } from '../paradas/paradas-table';
import { AfectacionesTable } from '../afectaciones/afectaciones-table';
import { SECONDARY_BUTTON_CLASS } from '../wizard/wizard-ui';

type Section = 'parqueos' | 'paradas' | 'afectaciones';

interface SecondarySectionsProps {
  parqueos: Parqueo[];
  paradas: Parada[];
  estaciones: Estacion[];
  lineas: Linea[];
  afectaciones: Afectacion[];
  onUpdateParqueo: (id: number, data: UpdateParqueoDto) => Promise<unknown>;
  onDeleteParqueo: (id: number) => Promise<unknown>;
  onSaveParada: (paradaId: number | string, values: ParadaFormValues) => Promise<void>;
  onDeleteParada: (id: number | string) => Promise<unknown>;
  onNewAfectacion: () => void;
}

/**
 * Records that do not hang from a single línea: parqueos (shared by líneas),
 * every parada (including those in no línea, and their delete) and the
 * read-only history of afectaciones.
 */
export function SecondarySections(props: SecondarySectionsProps) {
  const [section, setSection] = useState<Section>('parqueos');
  const sections: { id: Section; label: string; count: number }[] = [
    { id: 'parqueos', label: 'Parqueos', count: props.parqueos.length },
    { id: 'paradas', label: 'Todas las paradas', count: props.paradas.length },
    { id: 'afectaciones', label: 'Afectaciones', count: props.afectaciones.length },
  ];

  return (
    <section aria-labelledby="infra-secondary-title" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="infra-secondary-title" className="font-display text-lg font-semibold text-slate-900">
          Otros registros
        </h2>
        {section === 'afectaciones' && (
          <button type="button" onClick={props.onNewAfectacion} className={SECONDARY_BUTTON_CLASS}>
            Nueva afectación
          </button>
        )}
      </div>
      <div role="group" aria-label="Sección" className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={section === s.id}
            onClick={() => setSection(s.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
              section === s.id ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {`${s.label} (${s.count})`}
          </button>
        ))}
      </div>

      {section === 'parqueos' && (
        <>
          <p className="mb-3 text-sm text-slate-500">
            Los parqueos se crean y asignan desde «Nueva infraestructura» o «Gestionar paradas y parqueo» de cada línea.
          </p>
          <ParqueosTable parqueos={props.parqueos} onUpdate={props.onUpdateParqueo} onDelete={props.onDeleteParqueo} />
        </>
      )}
      {section === 'paradas' && (
        <ParadasTable
          paradas={props.paradas}
          estaciones={props.estaciones}
          lineas={props.lineas}
          onSave={props.onSaveParada}
          onDelete={props.onDeleteParada}
        />
      )}
      {section === 'afectaciones' && (
        <AfectacionesTable
          afectaciones={props.afectaciones}
          lineas={props.lineas}
          paradas={props.paradas}
          estaciones={props.estaciones}
        />
      )}
    </section>
  );
}
