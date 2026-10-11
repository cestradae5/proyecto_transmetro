import { useId, type ReactNode } from 'react';

// Shared building blocks of the "Nueva infraestructura" wizard.

export const INPUT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-500';
export const LABEL_CLASS = 'block text-sm font-medium text-slate-700 mb-1';
export const FIELD_ERROR_CLASS = 'text-red-600 text-xs mt-1';
export const PRIMARY_BUTTON_CLASS =
  'px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed';
export const SECONDARY_BUTTON_CLASS =
  'px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed';
export const DANGER_BUTTON_CLASS =
  'px-3 py-1 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed';
export const CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white p-5 sm:p-6';

/** Translated message of a rejected request, or `fallback`. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && typeof error.message === 'string' && error.message
    ? error.message
    : fallback;
}

export function ErrorAlert({ message, children }: { message: string | null; children?: ReactNode }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex flex-wrap items-center justify-between gap-3"
    >
      <span>{message}</span>
      {children}
    </div>
  );
}

export type ChoiceMode = 'existing' | 'new';

interface ModeToggleProps {
  legend: string;
  value: ChoiceMode;
  existingLabel: string;
  newLabel: string;
  disabled?: boolean;
  onChange: (mode: ChoiceMode) => void;
}

/** "Elegir existente" / "Crear nuevo" radio pair, styled as a segmented control. */
export function ModeToggle({ legend, value, existingLabel, newLabel, disabled, onChange }: ModeToggleProps) {
  const name = useId();
  const options: { mode: ChoiceMode; label: string }[] = [
    { mode: 'existing', label: existingLabel },
    { mode: 'new', label: newLabel },
  ];
  return (
    <fieldset className="mb-4" disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {options.map((option) => (
          <label
            key={option.mode}
            className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-primary ${
              value === option.mode ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === option.mode}
              onChange={() => onChange(option.mode)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
