import { useId, useState, type ReactNode } from 'react';
import { ErrorAlert, SECONDARY_BUTTON_CLASS } from '../wizard/wizard-ui';

// Shared pieces of the grouped view (municipalidad > línea > parada).

export const LINK_BUTTON_CLASS =
  'rounded-lg px-2.5 py-1 text-sm font-medium text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary';
export const DANGER_LINK_BUTTON_CLASS =
  'rounded-lg px-2.5 py-1 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300';

export function StatusBadge({ estado, positive }: { estado: string; positive: boolean }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
        positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {estado}
    </span>
  );
}

export function RetryAlert({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <ErrorAlert message={message}>
      <button type="button" onClick={onRetry} className={SECONDARY_BUTTON_CLASS}>
        Reintentar
      </button>
    </ErrorAlert>
  );
}

interface GroupCardProps {
  title: string;
  /** Departamento, estado badge, línea count... shown next to the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  hint?: ReactNode;
  defaultExpanded: boolean;
  /** Keeps the card open regardless of the toggle (e.g. while searching). */
  forceExpanded?: boolean;
  children: ReactNode;
}

/** Collapsible card of one group (a municipalidad or "Sin municipalidad"). */
export function GroupCard({ title, meta, actions, hint, defaultExpanded, forceExpanded = false, children }: GroupCardProps) {
  const uid = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const open = forceExpanded || expanded;
  const contentId = `${uid}-content`;

  return (
    <section aria-label={title} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          onClick={() => setExpanded(!open)}
          className="flex min-w-0 items-center gap-3 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <span className="material-symbols-outlined text-slate-500" aria-hidden="true">
            {open ? 'expand_less' : 'expand_more'}
          </span>
          <span className="truncate font-display text-lg font-semibold text-slate-900">{title}</span>
        </button>
        <div className="flex flex-1 flex-wrap items-center gap-2 text-sm text-slate-500">{meta}</div>
        {actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
      </header>
      {open && (
        <div id={contentId} className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-6">
          {hint && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{hint}</p>}
          {children}
        </div>
      )}
    </section>
  );
}
