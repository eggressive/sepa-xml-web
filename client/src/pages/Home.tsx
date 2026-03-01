/**
 * SEPA XML Generator — Home Page
 *
 * Design: "Swiss Banking" — Precision Minimalism
 * Charcoal on warm white, deep teal accent.
 * DM Sans headings, JetBrains Mono for data fields.
 * Step-by-step workflow with left sidebar indicator.
 */

import { StepIndicator } from "@/components/StepIndicator";
import { UploadStep } from "@/components/steps/UploadStep";
import { ConfigureStep } from "@/components/steps/ConfigureStep";
import { PreviewStep } from "@/components/steps/PreviewStep";
import { ResultsStep } from "@/components/steps/ResultsStep";
import { HistoryPanel } from "@/components/HistoryPanel";
import { useSepaProcessor } from "@/hooks/useSepaProcessor";
import { useHistory } from "@/hooks/useHistory";
import { FileCode2, Shield, Lock } from "lucide-react";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030829368/9KkBeQZaXtNkT9wL6yWokQ/hero-pattern-4RZWWXnJFiVkkCPXUPsLMf.webp";

export default function Home() {
  const {
    state,
    profiles,
    reset,
    setFile,
    setProfile,
    setSelectedSheets,
    processFile,
    generateFiles,
    goToStep,
  } = useSepaProcessor();

  const { entries, addEntry, removeEntry, clearHistory } = useHistory();

  /**
   * Wraps generateFiles so that a history entry is recorded after
   * successful XML generation.
   */
  const handleGenerate = () => {
    generateFiles();

    // After generation, state.generatedFiles will be populated on next render.
    // We use a microtask to read the updated state from the DOM/hook.
    // Instead, we record history from the ResultsStep via a callback.
  };

  /**
   * Called by ResultsStep once files are rendered, so we can record
   * the export in history.
   */
  const recordHistory = () => {
    if (state.generatedFiles.length === 0) return;

    const totalTxns = state.generatedFiles.reduce((s, f) => s + f.transactionCount, 0);
    const totalAmt = state.generatedFiles.reduce((s, f) => s + f.totalAmount, 0);
    const allValid = state.generatedFiles.every((f) => f.schemaValidation?.valid !== false);

    addEntry({
      sourceFile: state.file?.name || "unknown",
      profileName: state.selectedProfile?.profileName || "unknown",
      sheets: state.selectedSheets,
      files: state.generatedFiles.map((f) => ({
        fileName: f.fileName,
        paymentType: f.paymentType,
        currency: f.currency,
        transactionCount: f.transactionCount,
        totalAmount: f.totalAmount,
        schemaValid: f.schemaValidation?.valid !== false,
      })),
      totalTransactions: totalTxns,
      totalAmount: totalAmt,
      allSchemaValid: allValid,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FileCode2 className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground leading-none">
                SEPA XML Generator
              </h1>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
                ISO 20022 Payment File Generator
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="w-3 h-3" />
              <span>Offline-capable</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5" />
              <span>Client-side processing</span>
            </div>
          </div>
        </div>
      </header>

      {/* Subtle hero pattern behind the main content area */}
      <div
        className="absolute inset-x-0 top-14 h-48 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: `url(${HERO_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Main content */}
      <main className="flex-1 relative">
        <div className="container py-8">
          <div className="flex gap-8 max-w-4xl mx-auto">
            {/* Left sidebar — Step indicator + info cards + history */}
            <aside className="hidden md:block w-52 shrink-0">
              <div className="sticky top-24 space-y-3">
                <StepIndicator
                  currentStep={state.step}
                  onStepClick={goToStep}
                />

                {/* Privacy note */}
                <div className="p-4 bg-muted/40 rounded-lg border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                      Privacy
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    All processing happens locally in your browser. No data is uploaded to any server.
                  </p>
                </div>

                {/* Supported formats */}
                <div className="p-4 bg-muted/40 rounded-lg border border-border/50">
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                    Supported Formats
                  </span>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-data text-[10px] bg-primary/8 text-primary px-1.5 py-0.5 rounded">
                        pain.001.001.03
                      </span>
                      <span>ABN AMRO</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-data text-[10px] bg-primary/8 text-primary px-1.5 py-0.5 rounded">
                        pain.001.001.09
                      </span>
                      <span>RBS/NatWest</span>
                    </div>
                  </div>
                </div>

                {/* History panel */}
                <HistoryPanel
                  entries={entries}
                  onRemove={removeEntry}
                  onClear={clearHistory}
                />
              </div>
            </aside>

            {/* Right content — Active step */}
            <div className="flex-1 min-w-0 max-w-xl">
              {/* Mobile step indicator */}
              <div className="md:hidden mb-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  {(["upload", "configure", "preview", "results"] as const).map((s, i) => {
                    const stepNames = ["Upload", "Configure", "Preview", "Results"];
                    const currentIdx = (["upload", "configure", "preview", "results"] as const).indexOf(state.step);
                    const isActive = i === currentIdx;
                    const isCompleted = i < currentIdx;
                    return (
                      <div key={s} className="flex items-center gap-2">
                        {i > 0 && <div className="w-4 h-px bg-border" />}
                        <span
                          className={`
                            px-2 py-1 rounded text-xs font-medium
                            ${isActive ? "bg-primary text-primary-foreground" : ""}
                            ${isCompleted ? "text-[oklch(0.45_0.15_150)]" : ""}
                          `}
                        >
                          {stepNames[i]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {state.step === "upload" && (
                <UploadStep
                  file={state.file}
                  onFileSelect={setFile}
                  error={state.error}
                />
              )}

              {state.step === "configure" && (
                <ConfigureStep
                  file={state.file}
                  profiles={profiles}
                  selectedProfile={state.selectedProfile}
                  availableSheets={state.availableSheets}
                  selectedSheets={state.selectedSheets}
                  onProfileChange={setProfile}
                  onSheetsChange={setSelectedSheets}
                  onProcess={processFile}
                  error={state.error}
                />
              )}

              {state.step === "preview" && (
                <PreviewStep
                  routedPayments={state.routedPayments}
                  validation={state.validation}
                  onGenerate={generateFiles}
                  onBack={() => goToStep("configure")}
                  error={state.error}
                />
              )}

              {state.step === "results" && (
                <ResultsStep
                  generatedFiles={state.generatedFiles}
                  onReset={reset}
                  onRecordHistory={recordHistory}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Mobile history (shown below main content on small screens) */}
      <div className="md:hidden px-4 pb-4">
        <HistoryPanel
          entries={entries}
          onRemove={removeEntry}
          onClear={clearHistory}
        />
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-4 mt-auto">
        <div className="container flex items-center justify-between text-xs text-muted-foreground">
          <span>SEPA XML Generator v1.0</span>
          <span className="font-data">pain.001.001.03 / pain.001.001.09</span>
        </div>
      </footer>
    </div>
  );
}
