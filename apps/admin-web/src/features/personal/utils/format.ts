export const EMPTY_PLACEHOLDER = "—";

/** Returns the trimmed value, or a placeholder when it is null/empty. */
export function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY_PLACEHOLDER;
}

/**
 * Formats a `YYYY-MM-DD` date as `DD/MM/YYYY` by splitting the string, so the
 * value is never parsed as a Date and cannot shift with the local timezone.
 * Unrecognized input is returned as-is.
 */
export function formatHireDate(value: string | null | undefined): string {
  if (!value) return EMPTY_PLACEHOLDER;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
