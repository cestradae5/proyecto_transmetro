import type { CreateParqueoDto, Linea, Parada, Parqueo } from '../../types/infrastructure.types';
import { useLineaParadas } from '../../hooks/use-linea-paradas';
import type { ParadaEstacionGateway } from '../../hooks/save-parada-estacion';
import { ParqueoSection } from './parqueo-section';
import { ParadasSection } from './paradas-section';
import { PRIMARY_BUTTON_CLASS } from './wizard-ui';

interface StepParadasParqueoProps {
  linea: Linea;
  parqueos: Parqueo[];
  paradas: Parada[];
  createParqueo: (data: CreateParqueoDto) => Promise<Parqueo>;
  assignParqueo: (idParqueo: string | null) => Promise<void>;
  paradaGateway: ParadaEstacionGateway;
  onFinish: (paradasCount: number) => void;
}

export function StepParadasParqueo({ linea, parqueos, paradas, createParqueo, assignParqueo, paradaGateway, onFinish }: StepParadasParqueoProps) {
  const lineaParadas = useLineaParadas(String(linea.idLinea));

  return (
    <div className="space-y-5">
      <ParqueoSection linea={linea} parqueos={parqueos} createParqueo={createParqueo} assignParqueo={assignParqueo} />
      <ParadasSection lineaParadas={lineaParadas} paradas={paradas} paradaGateway={paradaGateway} />
      <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={() => onFinish(lineaParadas.lineaParadas.length)} className={PRIMARY_BUTTON_CLASS}>
          Finalizar
        </button>
        <p className="text-xs text-slate-500">Todo lo agregado ya está guardado.</p>
      </div>
    </div>
  );
}
