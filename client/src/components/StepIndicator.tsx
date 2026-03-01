import type { ProcessingStep } from "@/hooks/useSepaProcessor";
import { Upload, Settings, Eye, Download, Check } from "lucide-react";

const STEPS: { id: ProcessingStep; label: string; icon: typeof Upload }[] = [
  { id: "upload", label: "Upload File", icon: Upload },
  { id: "configure", label: "Configure", icon: Settings },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "results", label: "Results", icon: Download },
];

const stepOrder: ProcessingStep[] = ["upload", "configure", "preview", "results"];

interface StepIndicatorProps {
  currentStep: ProcessingStep;
  onStepClick?: (step: ProcessingStep) => void;
}

export function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  const currentIndex = stepOrder.indexOf(currentStep);

  return (
    <nav className="flex flex-col gap-1">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;
        const isPending = index > currentIndex;
        const Icon = isCompleted ? Check : step.icon;
        const canClick = isCompleted && onStepClick;

        return (
          <button
            key={step.id}
            onClick={() => canClick && onStepClick(step.id)}
            disabled={!canClick}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200
              ${isActive ? "bg-primary text-primary-foreground shadow-sm" : ""}
              ${isCompleted ? "bg-[oklch(0.55_0.15_150/0.1)] text-[oklch(0.40_0.15_150)] hover:bg-[oklch(0.55_0.15_150/0.15)]" : ""}
              ${isPending ? "text-muted-foreground" : ""}
              ${canClick ? "cursor-pointer" : "cursor-default"}
            `}
          >
            <span
              className={`
                flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 transition-all duration-200
                ${isActive ? "bg-primary-foreground/20 text-primary-foreground" : ""}
                ${isCompleted ? "bg-[oklch(0.55_0.15_150)] text-white" : ""}
                ${isPending ? "bg-muted text-muted-foreground" : ""}
              `}
            >
              <Icon className="w-4 h-4" />
            </span>
            <span className="text-sm font-medium">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
