import { useState } from 'react';
import { EstadoAcceso, type Acceso, type CreateAccesoDto, type Parada } from '../../types/infrastructure.types';
import { useAccesos } from '../../hooks/use-accesos';
import { AccesoForm } from './acceso-form';

interface AccesosDialogProps {
  parada: Parada;
  onClose: () => void;
}

// null: no form open; 'new': create form; Acceso: editing that acceso.
type FormMode = null | 'new' | Acceso;

const formatCoord = (value: number | string) => Number(value).toFixed(6);

export function AccesosDialog({ parada, onClose }: AccesosDialogProps) {
  const { accesos, loading, error: loadError, refresh, createAcceso, updateAcceso, deleteAcceso } = useAccesos(
    String(parada.idParada)
  );
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: CreateAccesoDto) => {
    if (formMode === 'new') {
      await createAcceso(data);
    } else if (formMode) {
      await updateAcceso(formMode.idAcceso, data);
    }
    setFormMode(null);
  };

  // Delete is a soft delete on the API (estado -> DESHABILITADO), hence "Desactivar".
  const handleDeactivate = async (acceso: Acceso) => {
    if (!confirm(`¿Está seguro de desactivar el acceso ${acceso.nombreAcceso}?`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteAcceso(acceso.idAcceso);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Error al desactivar el acceso');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div role="dialog" aria-label="Accesos de la parada" className="bg-white rounded-2xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Accesos de la parada</h2>
          <p className="text-sm text-slate-500 mb-4">Parada {parada.nombreParada}</p>

          {loadError ? (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
              <span>{loadError}</span>
              <button type="button" onClick={() => refresh()} className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100">
                Reintentar
              </button>
            </div>
          ) : loading && accesos.length === 0 ? (
            <p className="text-sm text-slate-500 mb-4">Cargando...</p>
          ) : accesos.length === 0 ? (
            <p className="text-sm text-slate-500 mb-4">La parada no tiene accesos registrados.</p>
          ) : (
            <div className="overflow-x-auto mb-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-700">Nombre</th>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-700">Tipo</th>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-700">Estado</th>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-700">Coordenadas</th>
                    <th className="px-3 py-2 text-left text-sm font-semibold text-slate-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {accesos.map((acceso) => {
                    const habilitado = acceso.estadoAcceso === EstadoAcceso.HABILITADO;
                    return (
                      <tr key={acceso.idAcceso} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-sm text-slate-900">{acceso.nombreAcceso}</td>
                        <td className="px-3 py-2 text-sm text-slate-600">{acceso.tipoAcceso}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${habilitado ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {acceso.estadoAcceso}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-600">{`${formatCoord(acceso.latitud)}, ${formatCoord(acceso.longitud)}`}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => setFormMode(acceso)}
                            className="px-2 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium mr-1 disabled:opacity-50"
                          >
                            Editar
                          </button>
                          {habilitado && (
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleDeactivate(acceso)}
                              className="px-2 py-1 text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                            >
                              Desactivar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {formMode ? (
            <div className="border border-slate-200 rounded-xl p-4">
              <h3 className="text-base font-semibold text-slate-900 mb-3">
                {formMode === 'new' ? 'Nuevo acceso' : 'Editar acceso'}
              </h3>
              <AccesoForm
                // Remount when switching between accesos so the fields reset.
                key={formMode === 'new' ? 'new' : formMode.idAcceso}
                acceso={formMode === 'new' ? undefined : formMode}
                defaultCoordinates={{ latitud: parada.latitud, longitud: parada.longitud }}
                onSubmit={handleSubmit}
                onCancel={() => setFormMode(null)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFormMode('new')}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
            >
              Nuevo acceso
            </button>
          )}

          {error && (
            <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
