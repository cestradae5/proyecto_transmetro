import { useEffect, useRef, useState } from "react";
import { apiClient, ApiError } from "../../../lib/api-client";

// odd/tasks/card-activity.md S3-S5: GET /cards and GET /cards/:n/activity
// (RECARGAS_REPORTES_CONSULTAR). qpaypro-checkout S11: POST
// /cards/:n/payments/:referencia/verify.

export interface CardSummary {
  numeroTarjeta: string;
  saldo: number;
  estadoTarjeta: string;
}

export interface CardPage {
  total: number;
  page: number;
  pageSize: number;
  items: CardSummary[];
}

export interface CardPass {
  idEvento: string;
  tipo: "ENTRADA" | "SALIDA";
  montoCobrado: number;
  parada: { idParada: string; nombreParada: string; esEstacion: boolean };
  fecha: string;
}

export interface CardPayment {
  idTransaccion: string;
  referencia: string;
  monto: number;
  estadoPago: string;
  origen: "SIMULADA" | "QPAYPRO";
  numeroComprobante: string | null;
  fecha: string;
}

export interface CardActivity {
  tarjeta: CardSummary;
  pasadas: CardPass[];
  recargas: CardPayment[];
}

/** qpaypro-checkout S6 body, answered by the verify request. */
export interface PaymentStatus {
  referencia: string;
  numeroTarjeta: string;
  monto: number;
  estadoPago: string;
  numeroComprobante: string | null;
  saldo: number;
}

interface Loaded<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function getCardsErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Su sesión expiró. Inicie sesión de nuevo.";
    if (err.status === 403) return "No tiene permiso para consultar las tarjetas.";
    if (err.status === 404) return err.message || "La tarjeta no existe.";
    return "No se pudo cargar la información de tarjetas.";
  }
  return "No se pudo conectar con el servidor. Intente de nuevo.";
}

export function getVerifyErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status !== 401 && err.status !== 403 && err.status !== 404) {
    return "No se pudo verificar el pago con QPayPro.";
  }
  return getCardsErrorMessage(err);
}

/** Asks the API to reconcile a QPayPro payment with QPayPro (S7). */
export function verifyPayment(numeroTarjeta: string, referencia: string): Promise<PaymentStatus> {
  return apiClient.post<PaymentStatus>(
    `/cards/${encodeURIComponent(numeroTarjeta)}/payments/${encodeURIComponent(referencia)}/verify`,
    {},
  );
}

/** Loads `path` whenever it changes; only the latest response updates state. */
function useGet<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: path !== null, error: null });
  const requestId = useRef(0);

  useEffect(() => {
    const current = ++requestId.current;
    if (path === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    apiClient
      .get<T>(path)
      .then((data) => {
        if (current === requestId.current) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (current === requestId.current) setState({ data: null, loading: false, error: getCardsErrorMessage(err) });
      });
  }, [path]);

  return state;
}

export function useCards(search: string, page: number): Loaded<CardPage> {
  const params = new URLSearchParams();
  const term = search.trim();
  if (term) params.set("search", term);
  params.set("page", String(page));
  return useGet<CardPage>(`/cards?${params.toString()}`);
}

export function useCardActivity(numeroTarjeta: string | null): Loaded<CardActivity> {
  return useGet<CardActivity>(numeroTarjeta === null ? null : `/cards/${encodeURIComponent(numeroTarjeta)}/activity`);
}
