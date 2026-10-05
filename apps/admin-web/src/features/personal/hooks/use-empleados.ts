import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../../../lib/api-client";
import type {
  Empleado,
  EmpleadoFilters,
  CreateEmpleadoPayload,
  UpdateEmpleadoPayload,
} from "../types/personal.types";
import { getPersonalErrorMessage, mapPersonalError } from "./personal-errors";

const EMPLEADOS_PATH = "/personal/empleados";

export interface UseEmpleadosResult {
  items: Empleado[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (payload: CreateEmpleadoPayload) => Promise<Empleado>;
  update: (id: string, payload: UpdateEmpleadoPayload) => Promise<Empleado>;
  delete: (id: string) => Promise<void>;
}

/** Builds the list URL, omitting empty filter values. */
function buildListPath(search?: string, status?: string, roleId?: string): string {
  const params = new URLSearchParams();
  const trimmedSearch = search?.trim();
  if (trimmedSearch) params.set("search", trimmedSearch);
  if (status) params.set("status", status);
  if (roleId) params.set("roleId", roleId);
  const query = params.toString();
  return query ? `${EMPLEADOS_PATH}?${query}` : EMPLEADOS_PATH;
}

export function useEmpleados(filters: EmpleadoFilters = {}): UseEmpleadosResult {
  const { search, status, roleId } = filters;
  const [items, setItems] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After the first successful load, refetches are silent so consumers keep
  // their table mounted.
  const hasLoaded = useRef(false);
  // Only the latest request may update state; older responses are ignored.
  const requestId = useRef(0);

  const fetchEmpleados = useCallback(async () => {
    const current = ++requestId.current;
    if (!hasLoaded.current) setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Empleado[]>(
        buildListPath(search, status, roleId),
      );
      if (current !== requestId.current) return;
      setItems(data);
      hasLoaded.current = true;
    } catch (err: unknown) {
      if (current !== requestId.current) return;
      setError(getPersonalErrorMessage(err));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [search, status, roleId]);

  // Mutations throw an Error with the translated message and refetch only on success.
  const runMutation = async <T>(request: () => Promise<T>): Promise<T> => {
    let result: T;
    try {
      result = await request();
    } catch (err: unknown) {
      return mapPersonalError(err);
    }
    await fetchEmpleados();
    return result;
  };

  const create = (payload: CreateEmpleadoPayload): Promise<Empleado> =>
    runMutation(() => apiClient.post<Empleado>(EMPLEADOS_PATH, payload));

  const update = (id: string, payload: UpdateEmpleadoPayload): Promise<Empleado> =>
    runMutation(() =>
      apiClient.patch<Empleado>(`${EMPLEADOS_PATH}/${id}`, payload),
    );

  const remove = async (id: string): Promise<void> => {
    await runMutation(() => apiClient.delete(`${EMPLEADOS_PATH}/${id}`));
  };

  useEffect(() => {
    fetchEmpleados();
  }, [fetchEmpleados]);

  return {
    items,
    loading,
    error,
    refresh: fetchEmpleados,
    create,
    update,
    delete: remove,
  };
}
