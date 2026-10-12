import { useEffect, useRef, useState } from "react";
import { apiClient, ApiError } from "../../../lib/api-client";
import type { AuditLogFilters, AuditLogOptions, AuditLogPage } from "../types/audit-log.types";

const AUDIT_LOG_PATH = "/audit-log";
export const AUDIT_LOG_PAGE_SIZE = 20;

export interface UseAuditLogResult {
  data: AuditLogPage | null;
  loading: boolean;
  error: string | null;
}

export function getAuditLogErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Su sesión expiró. Inicie sesión de nuevo.";
    if (err.status === 403) return "No tiene permiso para consultar la bitácora.";
    if (err.status === 400) return "Los filtros no son válidos.";
    return "No se pudo cargar la bitácora.";
  }
  return "No se pudo conectar con el servidor. Intente de nuevo.";
}

/** Builds the list URL, omitting empty filter values. */
function buildListPath(filters: AuditLogFilters, page: number): string {
  const params = new URLSearchParams();
  const entries: Array<[keyof AuditLogFilters, string | undefined]> = [
    ["from", filters.from],
    ["to", filters.to],
    ["user", filters.user?.trim()],
    ["module", filters.module],
    ["action", filters.action],
    ["result", filters.result],
  ];
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  params.set("pageSize", String(AUDIT_LOG_PAGE_SIZE));
  return `${AUDIT_LOG_PATH}?${params.toString()}`;
}

export function useAuditLog(filters: AuditLogFilters, page: number): UseAuditLogResult {
  const path = buildListPath(filters, page);
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may update state; older responses are ignored.
  const requestId = useRef(0);

  useEffect(() => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    apiClient
      .get<AuditLogPage>(path)
      .then((result) => {
        if (current === requestId.current) setData(result);
      })
      .catch((err: unknown) => {
        if (current !== requestId.current) return;
        setData(null);
        setError(getAuditLogErrorMessage(err));
      })
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });
  }, [path]);

  return { data, loading, error };
}

/** Filter dropdown values. A failure only empties the dropdowns. */
export function useAuditLogOptions(): AuditLogOptions {
  const [options, setOptions] = useState<AuditLogOptions>({ modules: [], actions: [] });

  useEffect(() => {
    let active = true;
    apiClient
      .get<AuditLogOptions>(`${AUDIT_LOG_PATH}/options`)
      .then((result) => {
        if (active) setOptions(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return options;
}
