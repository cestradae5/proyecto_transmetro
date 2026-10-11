import { useId } from 'react';

export type WizardStepNumber = 1 | 2 | 3;
export type WizardStepStatus = 'done' | 'active' | 'locked';

export interface WizardStepInfo {
  number: WizardStepNumber;
  title: string;
  status: WizardStepStatus;
  /** Shown under the title once the step is completed (e.g. the chosen name). */
  summary?: string;
  /** Shown while locked: what unlocks the step. */
  lockedHint?: string;
}

interface WizardStepperProps {
  steps: WizardStepInfo[];
  currentStep: WizardStepNumber;
  onSelect: (step: WizardStepNumber) => void;
}

const BADGE_CLASS: Record<WizardStepStatus, string> = {
  done: 'bg-green-100 text-green-700',
  active: 'bg-primary text-white',
  locked: 'bg-slate-100 text-slate-400',
};

export function WizardStepper({ steps, currentStep, onSelect }: WizardStepperProps) {
  const uid = useId();
  return (
    <nav aria-label="Pasos del asistente">
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {steps.map((step) => {
          const isCurrent = step.number === currentStep;
          const detail = step.status === 'locked' ? step.lockedHint : step.summary;
          const detailId = `${uid}-step-${step.number}`;
          return (
            <li key={step.number}>
              <button
                type="button"
                disabled={step.status === 'locked'}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Paso ${step.number}: ${step.title}`}
                aria-describedby={detail ? detailId : undefined}
                onClick={() => onSelect(step.number)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed ${
                  isCurrent
                    ? 'border-primary bg-primary/5'
                    : step.status === 'locked'
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${BADGE_CLASS[step.status]}`}
                >
                  {step.status === 'done' ? '✓' : step.number}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${step.status === 'locked' ? 'text-slate-400' : 'text-slate-900'}`}>
                    {step.title}
                  </span>
                  {detail && (
                    <span id={detailId} className="block truncate text-xs text-slate-500">
                      {detail}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
