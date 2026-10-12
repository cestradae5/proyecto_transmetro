import { useCallback, useState } from "react";
import { apiClient, ApiError } from "../../../lib/api-client";

export function getReportErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Su sesión expiró. Inicie sesión de nuevo.";
    if (err.status === 403) return "No tiene permiso para generar este reporte.";
    if (err.status === 400) return "Los parámetros del reporte no son válidos.";
    return "No se pudo generar el reporte. Intente de nuevo.";
  }
  return "No se pudo conectar con el servidor. Intente de nuevo.";
}

/** Hands a downloaded Blob to the browser as a file. */
function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export interface UseReportDownloadResult {
  /** Key of the report being generated, if any. */
  downloading: string | null;
  error: string | null;
  download: (key: string, path: string, fallbackFileName: string) => Promise<void>;
}

export function useReportDownload(): UseReportDownloadResult {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async (key: string, path: string, fallbackFileName: string) => {
    setDownloading(key);
    setError(null);
    try {
      const file = await apiClient.download(path, fallbackFileName);
      saveFile(file.blob, file.fileName);
    } catch (err) {
      setError(getReportErrorMessage(err));
    } finally {
      setDownloading(null);
    }
  }, []);

  return { downloading, error, download };
}
