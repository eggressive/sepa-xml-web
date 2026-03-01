import { Button } from "@/components/ui/button";
import type { RoutedPayments } from "@/lib/sepa/models";
import { ValidationResult, ValidationSeverity } from "@/lib/sepa/models";
import { ArrowRight, ArrowLeft, AlertTriangle, XCircle, Info, CheckCircle } from "lucide-react";

interface PreviewStepProps {
  routedPayments: RoutedPayments[];
  validation: ValidationResult;
  onGenerate: () => void;
  onBack: () => void;
  error: string | null;
}

export function PreviewStep({
  routedPayments,
  validation,
  onGenerate,
  onBack,
  error,
}: PreviewStepProps) {
  const totalTransactions = routedPayments.reduce((sum, r) => sum + r.transactions.length, 0);
  const hasPayments = totalTransactions > 0;

  const errors = validation.messages.filter((m) => m.severity === ValidationSeverity.Error);
  const warnings = validation.messages.filter((m) => m.severity === ValidationSeverity.Warning);
  const infos = validation.messages.filter((m) => m.severity === ValidationSeverity.Info);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Export Preview</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review the payment summary and validation results before generating XML files.
        </p>
      </div>

      {/* Payment Summary */}
      <div className="p-5 bg-card border border-border rounded-xl space-y-4">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Payment Summary
        </h3>

        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">{totalTransactions}</span>
          <span className="text-sm text-muted-foreground">
            transaction{totalTransactions !== 1 ? "s" : ""} to process
          </span>
        </div>

        {routedPayments.length > 0 && (
          <div className="space-y-2">
            {routedPayments.map((group, i) => {
              const total = group.transactions.reduce((sum, t) => sum + t.amount, 0);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 px-3 bg-muted/40 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {group.paymentType}
                    </span>
                    <span className="text-sm text-foreground">
                      {group.transactions.length} transaction{group.transactions.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="font-data text-sm font-medium text-foreground">
                    {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    {group.currencyCode}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Processing mode: Individual (one payment instruction per transaction)
        </p>
      </div>

      {/* Validation Messages */}
      {validation.messages.length > 0 && (
        <div className="p-5 bg-card border border-border rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Validation Messages
            </h3>
            <div className="flex items-center gap-3 text-xs">
              {errors.length > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="w-3.5 h-3.5" /> {errors.length} error{errors.length !== 1 ? "s" : ""}
                </span>
              )}
              {warnings.length > 0 && (
                <span className="flex items-center gap-1 text-[oklch(0.65_0.15_70)]">
                  <AlertTriangle className="w-3.5 h-3.5" /> {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
                </span>
              )}
              {infos.length > 0 && (
                <span className="flex items-center gap-1 text-[oklch(0.55_0.10_240)]">
                  <Info className="w-3.5 h-3.5" /> {infos.length} info
                </span>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1">
            {validation.messages.slice(0, 50).map((msg, i) => (
              <div
                key={i}
                className={`
                  flex items-start gap-2 py-1.5 px-2 rounded text-xs
                  ${msg.severity === ValidationSeverity.Error ? "bg-destructive/5 text-destructive" : ""}
                  ${msg.severity === ValidationSeverity.Warning ? "bg-[oklch(0.70_0.15_70/0.08)] text-[oklch(0.50_0.15_70)]" : ""}
                  ${msg.severity === ValidationSeverity.Info ? "bg-[oklch(0.55_0.10_240/0.06)] text-[oklch(0.45_0.10_240)]" : ""}
                `}
              >
                {msg.severity === ValidationSeverity.Error && <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                {msg.severity === ValidationSeverity.Warning && <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                {msg.severity === ValidationSeverity.Info && <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                <span className="font-data">
                  {msg.row > 0 ? `[${msg.sheet} R${msg.row}]` : msg.sheet ? `[${msg.sheet}]` : ""}{" "}
                  <span className="font-medium">{msg.field}:</span> {msg.message}
                </span>
              </div>
            ))}
            {validation.messages.length > 50 && (
              <p className="text-xs text-muted-foreground px-2 py-1">
                ...and {validation.messages.length - 50} more messages
              </p>
            )}
          </div>

          {errors.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-[oklch(0.70_0.15_70/0.08)] rounded-lg">
              <AlertTriangle className="w-4 h-4 text-[oklch(0.55_0.15_70)]" />
              <p className="text-xs text-[oklch(0.45_0.15_70)]">
                {errors.length} error(s) found. Transactions with errors have been excluded.
              </p>
            </div>
          )}
        </div>
      )}

      {/* No errors, all good */}
      {validation.messages.length === 0 && hasPayments && (
        <div className="flex items-center gap-3 p-4 bg-[oklch(0.55_0.15_150/0.06)] border border-[oklch(0.55_0.15_150/0.2)] rounded-lg">
          <CheckCircle className="w-5 h-5 text-[oklch(0.45_0.15_150)]" />
          <p className="text-sm text-[oklch(0.35_0.15_150)]">All transactions passed validation.</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={onGenerate}
          disabled={!hasPayments}
          className="flex-1"
          size="lg"
        >
          Generate XML
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
