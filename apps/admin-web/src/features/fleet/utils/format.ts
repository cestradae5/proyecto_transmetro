/** Shared by the operator and pilot location views: same report timestamp, same format. */
export function formatReportDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-GT');
}
