/**
 * Design: Swiss Banking — Precision Minimalism
 * Results step: shows generated files with XSD schema validation, XML preview, and download.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { GeneratedFile } from "@/lib/sepa/models";
import {
  Download,
  FileText,
  RotateCcw,
  CheckCircle,
  Archive,
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  XCircle,
} from "lucide-react";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { toast } from "sonner";

interface ResultsStepProps {
  generatedFiles: GeneratedFile[];
  onReset: () => void;
}

export function ResultsStep({ generatedFiles, onReset }: ResultsStepProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [validationExpanded, setValidationExpanded] = useState<number | null>(null);

  const handleDownloadSingle = (file: GeneratedFile) => {
    const blob = new Blob([file.xmlContent], { type: "application/xml;charset=utf-8" });
    saveAs(blob, file.fileName);
    toast.success(`Downloaded ${file.fileName}`);
  };

  const handleDownloadAll = async () => {
    if (generatedFiles.length === 1) {
      handleDownloadSingle(generatedFiles[0]);
      return;
    }

    const zip = new JSZip();
    for (const file of generatedFiles) {
      zip.file(file.fileName, file.xmlContent);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `SEPA_Export_${formatTimestampShort()}.zip`);
    toast.success(`Downloaded ${generatedFiles.length} files as ZIP`);
  };

  const handleCopyXml = async (file: GeneratedFile, index: number) => {
    try {
      await navigator.clipboard.writeText(file.xmlContent);
      setCopiedIndex(index);
      toast.success("XML copied to clipboard");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const togglePreview = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const toggleValidation = (index: number) => {
    setValidationExpanded(validationExpanded === index ? null : index);
  };

  const totalTransactions = generatedFiles.reduce((sum, f) => sum + f.transactionCount, 0);
  const totalAmount = generatedFiles.reduce((sum, f) => sum + f.totalAmount, 0);

  // Overall validation status
  const allValid = generatedFiles.every((f) => f.schemaValidation?.valid !== false);
  const hasWarnings = generatedFiles.some(
    (f) => f.schemaValidation?.issues.some((i) => i.severity === "warning")
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Export Complete</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your XML files have been generated and validated against XSD schemas.
        </p>
      </div>

      {/* Success / Warning banner */}
      {allValid ? (
        <div className="flex items-center gap-4 p-5 bg-[oklch(0.55_0.15_150/0.06)] border border-[oklch(0.55_0.15_150/0.2)] rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-[oklch(0.55_0.15_150/0.12)] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-[oklch(0.40_0.15_150)]" />
          </div>
          <div>
            <p className="text-base font-semibold text-[oklch(0.30_0.15_150)]">
              {generatedFiles.length} file{generatedFiles.length !== 1 ? "s" : ""} generated
              {hasWarnings ? " with warnings" : " — schema valid"}
            </p>
            <p className="text-sm text-[oklch(0.45_0.15_150)]">
              {totalTransactions} transactions totaling{" "}
              <span className="font-data font-medium">
                {totalAmount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 p-5 bg-[oklch(0.60_0.20_30/0.06)] border border-[oklch(0.60_0.20_30/0.2)] rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-[oklch(0.60_0.20_30/0.12)] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-[oklch(0.50_0.20_30)]" />
          </div>
          <div>
            <p className="text-base font-semibold text-[oklch(0.35_0.15_30)]">
              {generatedFiles.length} file{generatedFiles.length !== 1 ? "s" : ""} generated — validation issues found
            </p>
            <p className="text-sm text-[oklch(0.50_0.15_30)]">
              Some files have schema validation errors. Review the details below before downloading.
            </p>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="space-y-3">
        {generatedFiles.map((file, i) => {
          const sv = file.schemaValidation;
          const errors = sv?.issues.filter((x) => x.severity === "error") || [];
          const warnings = sv?.issues.filter((x) => x.severity === "warning") || [];
          const infos = sv?.issues.filter((x) => x.severity === "info") || [];
          const isValid = sv?.valid !== false;

          return (
            <div key={i} className="border border-border rounded-lg overflow-hidden">
              {/* File header */}
              <div className="flex items-center gap-3 p-4 bg-card hover:bg-accent/30 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground font-data truncate">
                    {file.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {file.paymentType} {file.currency} — {file.transactionCount} txn
                    {file.transactionCount !== 1 ? "s" : ""} —{" "}
                    <span className="font-data">
                      {file.totalAmount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      {file.currency}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePreview(i)}
                    className="h-8 w-8 p-0"
                    title={expandedIndex === i ? "Hide XML" : "Preview XML"}
                  >
                    {expandedIndex === i ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyXml(file, i)}
                    className="h-8 w-8 p-0"
                    title="Copy XML"
                  >
                    {copiedIndex === i ? (
                      <Check className="w-4 h-4 text-[oklch(0.55_0.15_150)]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadSingle(file)}
                    className="h-8 w-8 p-0"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Schema validation badge row */}
              <div className="border-t border-border/50 px-4 py-2.5 bg-card/50 flex items-center justify-between">
                <button
                  onClick={() => toggleValidation(i)}
                  className="flex items-center gap-2 text-xs group"
                >
                  {isValid ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-[oklch(0.50_0.15_150)]" />
                  ) : (
                    <ShieldX className="w-3.5 h-3.5 text-destructive" />
                  )}
                  <span
                    className={`font-medium ${
                      isValid ? "text-[oklch(0.40_0.15_150)]" : "text-destructive"
                    }`}
                  >
                    {isValid ? "Schema Valid" : "Schema Errors"}
                  </span>
                  {errors.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/10 text-destructive">
                      <XCircle className="w-2.5 h-2.5" />
                      {errors.length}
                    </span>
                  )}
                  {warnings.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[oklch(0.75_0.15_80/0.15)] text-[oklch(0.45_0.15_80)]">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {warnings.length}
                    </span>
                  )}
                  {infos.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/8 text-primary">
                      <Info className="w-2.5 h-2.5" />
                      {infos.length}
                    </span>
                  )}
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                    {validationExpanded === i ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </span>
                </button>
              </div>

              {/* Validation details (collapsible) */}
              {validationExpanded === i && sv && (
                <div className="border-t border-border/50 bg-muted/30 px-4 py-3">
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {sv.issues.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No validation issues.</p>
                    )}
                    {sv.issues.map((issue, j) => (
                      <div
                        key={j}
                        className={`flex items-start gap-2 text-xs p-2 rounded-md ${
                          issue.severity === "error"
                            ? "bg-destructive/5 text-destructive"
                            : issue.severity === "warning"
                              ? "bg-[oklch(0.75_0.15_80/0.1)] text-[oklch(0.40_0.15_80)]"
                              : "bg-primary/5 text-primary"
                        }`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {issue.severity === "error" ? (
                            <XCircle className="w-3.5 h-3.5" />
                          ) : issue.severity === "warning" ? (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-data text-[10px] opacity-60 mr-1.5">{issue.path}</span>
                          <span>{issue.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* XML preview (collapsible) */}
              {expandedIndex === i && (
                <div className="border-t border-border bg-[oklch(0.98_0.002_250)] p-4">
                  <div className="max-h-80 overflow-auto rounded-md bg-[oklch(0.15_0.01_250)] p-4">
                    <pre className="text-xs font-data text-[oklch(0.85_0.02_150)] whitespace-pre overflow-x-auto leading-relaxed">
                      {file.xmlContent}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onReset} className="flex-1">
          <RotateCcw className="w-4 h-4 mr-2" />
          New Export
        </Button>
        <Button onClick={handleDownloadAll} className="flex-1" size="lg">
          {generatedFiles.length > 1 ? (
            <>
              <Archive className="w-4 h-4 mr-2" />
              Download All (.zip)
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Download XML
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function formatTimestampShort(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}
