import { CheckCircleIcon } from "@/components/shell/icons";
import type { OnboardingStep } from "./types";

const STEP_LABELS: readonly string[] = ["Tu cuenta", "Tu clínica", "Tu rol"];

// Discreet 3-step progress indicator for the /registro wizard. Never relies
// on color alone: a done step also shows a check icon, the active one is
// marked with aria-current.
export function ProgressSteps({ current }: { current: OnboardingStep }) {
  return (
    <ol className="flex items-center">
      {STEP_LABELS.map((label, index) => {
        const stepNumber = (index + 1) as OnboardingStep;
        const isDone = stepNumber < current;
        const isActive = stepNumber === current;

        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2" aria-current={isActive ? "step" : undefined}>
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
                  isDone
                    ? "border-primary bg-primary text-primary-foreground"
                    : isActive
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground"
                }`}
              >
                {isDone ? <CheckCircleIcon className="size-3.5" /> : stepNumber}
              </span>
              <span
                className={`hidden text-xs font-medium sm:inline ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
            {index < STEP_LABELS.length - 1 && (
              <span className={`mx-2 h-px flex-1 ${isDone ? "bg-primary" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
