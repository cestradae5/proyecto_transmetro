import { useEffect, useId, useRef, useState } from 'react';
import type { Linea, Municipalidad } from '../../types/infrastructure.types';
import { useMunicipalidades } from '../../hooks/use-municipalidades';
import { useLineas } from '../../hooks/use-lineas';
import { useParqueos } from '../../hooks/use-parqueos';
import { useParadas } from '../../hooks/use-paradas';
import { useEstaciones } from '../../hooks/use-estaciones';
import { linkMunicipalidadToLinea } from '../../hooks/use-linea-municipalidades';
import type { ParadaEstacionGateway } from '../../hooks/save-parada-estacion';
import { WizardStepper, type WizardStepInfo, type WizardStepNumber } from './wizard-stepper';
import { StepMunicipalidad } from './step-municipalidad';
import { StepLinea } from './step-linea';
import { StepParadasParqueo } from './step-paradas-parqueo';
import { PRIMARY_BUTTON_CLASS } from './wizard-ui';

interface InfrastructureWizardProps {
  /** `saved` is true when the wizard may have persisted data (the page should refresh). */
  onClose: (saved: boolean) => void;
  /**
   * Existing línea to manage: the wizard opens directly at step 3 ("Gestionar
   * paradas y parqueo") without the stepper, since steps 1-2 already exist.
   */
  initialLinea?: Linea;
  /** Municipalidad the línea was opened from (null for "Sin municipalidad"). */
  initialMunicipalidad?: Municipalidad | null;
}

const CLOSE_CONFIRM =
  '¿Cerrar el asistente? Los datos ya guardados (municipalidad, línea, parqueo y paradas) se conservarán.';

/**
 * "Nueva infraestructura": Municipalidad -> Línea -> Paradas y parqueo. Each
 * step persists to the API when completed and unlocks the next one; there is
 * no draft, so closing mid-way keeps what was already saved.
 */
export function InfrastructureWizard({ onClose, initialLinea, initialMunicipalidad = null }: InfrastructureWizardProps) {
  const manageMode = initialLinea !== undefined;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const { municipalidades, loading: municipalidadesLoading, createMunicipalidad } = useMunicipalidades();
  const { createLinea, updateLinea } = useLineas();
  const { parqueos, createParqueo } = useParqueos();
  const { paradas, refresh: refreshParadas, createParada, updateParada } = useParadas();
  const { createEstacion, updateEstacion, deleteEstacion } = useEstaciones();

  const [currentStep, setCurrentStep] = useState<WizardStepNumber>(manageMode ? 3 : 1);
  const [municipalidad, setMunicipalidad] = useState<Municipalidad | null>(initialMunicipalidad);
  const [linea, setLinea] = useState<Linea | null>(initialLinea ?? null);
  const [linked, setLinked] = useState(manageMode);
  const [finishedCount, setFinishedCount] = useState<number | null>(null);

  const requestClose = () => {
    // Managing an existing línea: every change is already saved.
    if (manageMode || finishedCount !== null) {
      onClose(true);
      return;
    }
    if (municipalidad === null) {
      onClose(false);
      return;
    }
    if (confirm(CLOSE_CONFIRM)) onClose(true);
  };

  // Escape follows the same path as the close button; the ref keeps the
  // listener on the latest state without re-subscribing.
  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });
  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const paradaGateway: ParadaEstacionGateway = {
    createParada,
    updateParada,
    createEstacion,
    updateEstacion,
    deleteEstacion,
    refreshParadas,
  };

  const assignParqueo = async (idParqueo: string | null) => {
    if (!linea) return;
    const updated = await updateLinea(linea.idLinea, { idParqueo });
    setLinea(updated ? { ...linea, ...updated, idParqueo: updated.idParqueo ?? null } : { ...linea, idParqueo });
  };

  const parqueoName = (current: Linea) => {
    if (current.idParqueo == null) return 'Sin parqueo';
    const id = String(current.idParqueo);
    return parqueos.find((p) => String(p.idParqueo) === id)?.nombreParqueo ?? `#${id}`;
  };

  const steps: WizardStepInfo[] = [
    {
      number: 1,
      title: 'Municipalidad',
      status: municipalidad ? 'done' : 'active',
      summary: municipalidad ? `${municipalidad.nombreMunicipalidad} (${municipalidad.departamento})` : undefined,
    },
    {
      number: 2,
      title: 'Línea',
      status: linea && linked ? 'done' : municipalidad ? 'active' : 'locked',
      summary: linea ? `${linea.numeroLinea} - ${linea.nombreLinea}` : undefined,
      lockedHint: 'Primero elija o cree la municipalidad',
    },
    {
      number: 3,
      title: 'Paradas y parqueo',
      status: finishedCount !== null ? 'done' : linked ? 'active' : 'locked',
      lockedHint: 'Primero cree la línea',
    },
  ];

  const renderStep = () => {
    if (finishedCount !== null && municipalidad && linea) {
      return (
        <section aria-label="Resumen" className="rounded-2xl border border-green-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-slate-900">Infraestructura registrada</h3>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Municipalidad</dt><dd className="font-medium text-slate-900">{municipalidad.nombreMunicipalidad}</dd></div>
            <div><dt className="text-slate-500">Línea</dt><dd className="font-medium text-slate-900">{`${linea.numeroLinea} - ${linea.nombreLinea}`}</dd></div>
            <div><dt className="text-slate-500">Paradas</dt><dd className="font-medium text-slate-900">{finishedCount}</dd></div>
            <div><dt className="text-slate-500">Parqueo</dt><dd className="font-medium text-slate-900">{parqueoName(linea)}</dd></div>
          </dl>
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={() => onClose(true)} className={PRIMARY_BUTTON_CLASS}>Cerrar</button>
          </div>
        </section>
      );
    }
    if (currentStep === 3 && linea && linked) {
      return (
        <StepParadasParqueo
          linea={linea}
          parqueos={parqueos}
          paradas={paradas}
          createParqueo={createParqueo}
          assignParqueo={assignParqueo}
          paradaGateway={paradaGateway}
          onFinish={manageMode ? () => onClose(true) : setFinishedCount}
        />
      );
    }
    if (currentStep >= 2 && municipalidad) {
      return (
        <StepLinea
          municipalidad={municipalidad}
          linea={linea}
          linked={linked}
          createLinea={createLinea}
          linkLinea={(lineaId) => linkMunicipalidadToLinea(lineaId, String(municipalidad.idMunicipalidad))}
          onLineaCreated={setLinea}
          onLinked={() => {
            setLinked(true);
            setCurrentStep(3);
          }}
        />
      );
    }
    return (
      <StepMunicipalidad
        municipalidades={municipalidades}
        loading={municipalidadesLoading}
        selected={municipalidad}
        readOnly={linea !== null}
        onCreate={createMunicipalidad}
        onConfirm={(chosen) => {
          setMunicipalidad(chosen);
          setCurrentStep(2);
        }}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-full max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl focus:outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-8">
          <div>
            <h2 id={titleId} className="font-display text-xl font-bold text-slate-900">
              {manageMode ? 'Gestionar paradas y parqueo' : 'Nueva infraestructura'}
            </h2>
            <p className="text-sm text-slate-500">
              {manageMode && linea
                ? `Línea ${linea.numeroLinea} - ${linea.nombreLinea} · ${municipalidad?.nombreMunicipalidad ?? 'Sin municipalidad'}. Cada cambio se guarda al momento.`
                : 'Cada paso se guarda al completarlo.'}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar asistente"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>
        {!manageMode && (
          <div className="border-b border-slate-100 px-5 py-4 sm:px-8">
            <WizardStepper steps={steps} currentStep={finishedCount !== null ? 3 : currentStep} onSelect={setCurrentStep} />
          </div>
        )}
        <div className="flex-1 overflow-y-auto bg-slate-50 px-5 py-6 sm:px-8">{renderStep()}</div>
      </div>
    </div>
  );
}
