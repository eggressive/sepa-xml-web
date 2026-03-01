/**
 * FeedbackDialog — Client-side issue reporting
 *
 * Design: "Swiss Banking" — Precision Minimalism
 * Clean form with auto-collected diagnostics.
 * Generates a downloadable JSON report the user can
 * send via email or Teams.
 */

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Copy,
  Check,
  ImagePlus,
  X,
  AlertCircle,
  Info,
} from "lucide-react";
import { toast } from "sonner";

interface DiagnosticsData {
  currentStep: string;
  selectedProfile: string | null;
  selectedSheets: string[];
  fileName: string | null;
  transactionCounts: { type: string; currency: string; count: number }[];
  validationErrors: number;
  validationWarnings: number;
  generatedFiles: { name: string; schemaValid: boolean }[];
  lastError: string | null;
}

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagnostics: DiagnosticsData;
}

type Category = "bug" | "feature" | "question" | "other";

const CATEGORY_LABELS: Record<Category, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  question: "Question",
  other: "Other",
};

export function FeedbackDialog({
  open,
  onOpenChange,
  diagnostics,
}: FeedbackDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("bug");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setCategory("bug");
    setScreenshot(null);
    setScreenshotPreview(null);
    setCopied(false);
    setSubmitted(false);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) resetForm();
      onOpenChange(open);
    },
    [onOpenChange, resetForm]
  );

  const handleScreenshotSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error("Screenshot must be under 5 MB.");
        return;
      }

      setScreenshot(file);
      const reader = new FileReader();
      reader.onload = () => setScreenshotPreview(reader.result as string);
      reader.readAsDataURL(file);
    },
    []
  );

  const removeScreenshot = useCallback(() => {
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const collectEnvironment = useCallback(() => {
    return {
      browser: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }, []);

  const buildReport = useCallback(() => {
    return {
      version: "1.0",
      reportType: "feedback",
      category: CATEGORY_LABELS[category],
      title,
      description,
      hasScreenshot: !!screenshot,
      environment: collectEnvironment(),
      diagnostics: {
        currentStep: diagnostics.currentStep,
        selectedProfile: diagnostics.selectedProfile,
        selectedSheets: diagnostics.selectedSheets,
        fileName: diagnostics.fileName,
        transactionCounts: diagnostics.transactionCounts,
        validationErrors: diagnostics.validationErrors,
        validationWarnings: diagnostics.validationWarnings,
        generatedFiles: diagnostics.generatedFiles,
        lastError: diagnostics.lastError,
      },
    };
  }, [
    category,
    title,
    description,
    screenshot,
    diagnostics,
    collectEnvironment,
  ]);

  const handleDownload = useCallback(() => {
    const report = buildReport();
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    a.href = url;
    a.download = `sepa-feedback-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // If there's a screenshot, download it alongside
    if (screenshot) {
      const screenshotUrl = URL.createObjectURL(screenshot);
      const sa = document.createElement("a");
      sa.href = screenshotUrl;
      sa.download = `sepa-feedback-${ts}-screenshot.${screenshot.name.split(".").pop()}`;
      document.body.appendChild(sa);
      sa.click();
      document.body.removeChild(sa);
      URL.revokeObjectURL(screenshotUrl);
    }

    setSubmitted(true);
    toast.success("Feedback report downloaded. Please send it to the development team.");
  }, [buildReport, screenshot]);

  const handleCopyToClipboard = useCallback(async () => {
    const report = buildReport();
    const text = formatReportAsText(report);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Report copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy. Try downloading instead.");
    }
  }, [buildReport]);

  const isValid = title.trim().length > 0 && description.trim().length > 0;

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-[oklch(0.55_0.18_150)]" />
              Report Downloaded
            </DialogTitle>
            <DialogDescription>
              Thank you for your feedback. Please send the downloaded file(s) to the
              development team via email or Teams.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-muted/50 rounded-lg border border-border/50 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-sm">What to send:</p>
            <p>1. The <span className="font-data">sepa-feedback-*.json</span> file</p>
            {screenshot && (
              <p>2. The <span className="font-data">sepa-feedback-*-screenshot.*</span> file</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            Describe the problem and we'll generate a diagnostic report you can
            share with the development team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="feedback-category" className="text-xs font-medium">
              Category
            </Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as Category)}
            >
              <SelectTrigger id="feedback-category" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="question">Question</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="feedback-title" className="text-xs font-medium">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="feedback-title"
              placeholder="Brief summary of the issue"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9"
              maxLength={120}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="feedback-desc" className="text-xs font-medium">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="feedback-desc"
              placeholder="What happened? What did you expect? Steps to reproduce..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-y text-sm"
            />
          </div>

          {/* Screenshot */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Screenshot <span className="text-muted-foreground">(optional)</span>
            </Label>
            {screenshotPreview ? (
              <div className="relative inline-block">
                <img
                  src={screenshotPreview}
                  alt="Screenshot preview"
                  className="max-h-32 rounded-md border border-border"
                />
                <button
                  onClick={removeScreenshot}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border border-dashed border-border rounded-md hover:border-primary/40 hover:text-foreground transition-colors"
              >
                <ImagePlus className="w-4 h-4" />
                Attach screenshot
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleScreenshotSelect}
              className="hidden"
            />
          </div>

          {/* Auto-collected diagnostics (read-only) */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Info className="w-3 h-3 text-muted-foreground" />
              <Label className="text-xs font-medium text-muted-foreground">
                Auto-collected diagnostics
              </Label>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-[11px] text-muted-foreground space-y-1 font-data">
              <div className="flex justify-between">
                <span>Current step</span>
                <span className="text-foreground">{diagnostics.currentStep}</span>
              </div>
              {diagnostics.selectedProfile && (
                <div className="flex justify-between">
                  <span>Profile</span>
                  <span className="text-foreground">{diagnostics.selectedProfile}</span>
                </div>
              )}
              {diagnostics.fileName && (
                <div className="flex justify-between">
                  <span>File</span>
                  <span className="text-foreground truncate ml-4 max-w-[200px]">
                    {diagnostics.fileName}
                  </span>
                </div>
              )}
              {diagnostics.selectedSheets.length > 0 && (
                <div className="flex justify-between">
                  <span>Sheets</span>
                  <span className="text-foreground">{diagnostics.selectedSheets.length} selected</span>
                </div>
              )}
              {diagnostics.transactionCounts.length > 0 && (
                <div className="flex justify-between">
                  <span>Transactions</span>
                  <div className="flex gap-1">
                    {diagnostics.transactionCounts.map((g, i) => (
                      <Badge key={i} variant="secondary" className="text-[9px] px-1 py-0">
                        {g.type} {g.currency}: {g.count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {(diagnostics.validationErrors > 0 || diagnostics.validationWarnings > 0) && (
                <div className="flex justify-between">
                  <span>Validation</span>
                  <span className="text-foreground">
                    {diagnostics.validationErrors} errors, {diagnostics.validationWarnings} warnings
                  </span>
                </div>
              )}
              {diagnostics.generatedFiles.length > 0 && (
                <div className="flex justify-between">
                  <span>Generated files</span>
                  <span className="text-foreground">{diagnostics.generatedFiles.length} files</span>
                </div>
              )}
              {diagnostics.lastError && (
                <div className="flex items-start gap-1.5 mt-1 pt-1 border-t border-border/50">
                  <AlertCircle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                  <span className="text-destructive break-all">{diagnostics.lastError}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              This information helps diagnose the issue. It is included in the downloaded report.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyToClipboard}
            disabled={!isValid}
            className="gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy report"}
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!isValid}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Format the report object as human-readable text for clipboard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatReportAsText(report: any): string {
  const r = report as Record<string, unknown>;
  const env = r.environment as Record<string, string>;
  const diag = r.diagnostics as Record<string, unknown>;

  const lines: string[] = [
    `SEPA XML Generator — Feedback Report`,
    `${"=".repeat(42)}`,
    ``,
    `Category:    ${r.category}`,
    `Title:       ${r.title}`,
    `Screenshot:  ${r.hasScreenshot ? "Yes (attached separately)" : "No"}`,
    ``,
    `Description:`,
    `${r.description}`,
    ``,
    `Environment`,
    `${"-".repeat(42)}`,
    `Timestamp:   ${env.timestamp}`,
    `Browser:     ${env.browser}`,
    `Platform:    ${env.platform}`,
    `Screen:      ${env.screenSize}`,
    `Viewport:    ${env.viewportSize}`,
    `Timezone:    ${env.timezone}`,
    ``,
    `Diagnostics`,
    `${"-".repeat(42)}`,
    `Step:        ${diag.currentStep}`,
    `Profile:     ${diag.selectedProfile || "none"}`,
    `File:        ${diag.fileName || "none"}`,
    `Sheets:      ${(diag.selectedSheets as string[]).join(", ") || "none"}`,
  ];

  const txnCounts = diag.transactionCounts as { type: string; currency: string; count: number }[];
  if (txnCounts.length > 0) {
    lines.push(`Transactions: ${txnCounts.map((g) => `${g.type} ${g.currency}: ${g.count}`).join(", ")}`);
  }

  lines.push(`Validation:  ${diag.validationErrors} errors, ${diag.validationWarnings} warnings`);

  const files = diag.generatedFiles as { name: string; schemaValid: boolean }[];
  if (files.length > 0) {
    lines.push(`Generated:   ${files.map((f) => `${f.name} (${f.schemaValid ? "valid" : "invalid"})`).join(", ")}`);
  }

  if (diag.lastError) {
    lines.push(`Last error:  ${diag.lastError}`);
  }

  return lines.join("\n");
}
