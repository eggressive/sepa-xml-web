/**
 * Design: Swiss Banking — Precision Minimalism
 * History panel: shows recent exports with file name, profile, date, and summary.
 * Displayed as a collapsible section in the sidebar.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { HistoryEntry } from "@/hooks/useHistory";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
  FileText,
  ShieldCheck,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface HistoryPanelProps {
  entries: HistoryEntry[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function HistoryPanel({ entries, onRemove, onClear }: HistoryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="p-4 bg-muted/40 rounded-lg border border-border/50">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
            Recent Exports
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed italic">
          No exports yet. Process an Excel file to see history here.
        </p>
      </div>
    );
  }

  const visibleEntries = isExpanded ? entries : entries.slice(0, 3);

  return (
    <div className="p-4 bg-muted/40 rounded-lg border border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
            Recent Exports
          </span>
          <span className="text-[10px] font-data text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            {entries.length}
          </span>
        </div>
        {entries.length > 0 && (
          <button
            onClick={() => {
              onClear();
              toast.success("History cleared");
            }}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            title="Clear all history"
          >
            Clear
          </button>
        )}
      </div>

      {/* Entry list */}
      <div className="space-y-2">
        {visibleEntries.map((entry) => (
          <HistoryEntryCard
            key={entry.id}
            entry={entry}
            isExpanded={expandedEntryId === entry.id}
            onToggle={() =>
              setExpandedEntryId(expandedEntryId === entry.id ? null : entry.id)
            }
            onRemove={() => onRemove(entry.id)}
          />
        ))}
      </div>

      {/* Show more / less */}
      {entries.length > 3 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors w-full justify-center"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show all ({entries.length})
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ── Individual entry card ──

function HistoryEntryCard({
  entry,
  isExpanded,
  onToggle,
  onRemove,
}: {
  entry: HistoryEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const date = new Date(entry.timestamp);
  const timeStr = formatRelativeTime(date);
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const clockStr = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="group rounded-md border border-border/40 bg-card/60 overflow-hidden transition-colors hover:border-border">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 flex items-start gap-2"
      >
        <div className="w-5 h-5 rounded bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
          <FileText className="w-3 h-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-foreground truncate leading-tight">
            {entry.sourceFile}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-data text-muted-foreground">
              {entry.profileName}
            </span>
            <span className="text-[10px] text-muted-foreground/40">·</span>
            <span className="text-[10px] text-muted-foreground" title={`${dateStr} ${clockStr}`}>
              {timeStr}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] font-data text-foreground/70">
              {entry.totalTransactions} txn{entry.totalTransactions !== 1 ? "s" : ""}
            </span>
            <span className="text-[10px] text-muted-foreground/40">·</span>
            <span className="text-[10px] font-data text-foreground/70">
              {entry.totalAmount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-[10px] text-muted-foreground/40">·</span>
            {entry.allSchemaValid ? (
              <ShieldCheck className="w-3 h-3 text-[oklch(0.50_0.15_150)]" />
            ) : (
              <ShieldAlert className="w-3 h-3 text-[oklch(0.60_0.20_30)]" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
            {isExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border/30 px-3 py-2 bg-muted/20">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground">
              {dateStr} at {clockStr}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
                toast.success("Entry removed");
              }}
              className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
              title="Remove from history"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>

          {entry.sheets.length > 0 && (
            <p className="text-[10px] text-muted-foreground mb-1.5">
              Sheets: {entry.sheets.join(", ")}
            </p>
          )}

          <div className="space-y-1">
            {entry.files.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[10px] font-data"
              >
                <span className="text-foreground/70 truncate flex-1">
                  {f.fileName}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {f.transactionCount} txn{f.transactionCount !== 1 ? "s" : ""}
                </span>
                <span className="text-muted-foreground/40 shrink-0">·</span>
                <span className="text-foreground/70 shrink-0">
                  {f.totalAmount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  {f.currency}
                </span>
                {f.schemaValid ? (
                  <ShieldCheck className="w-2.5 h-2.5 text-[oklch(0.50_0.15_150)] shrink-0" />
                ) : (
                  <ShieldAlert className="w-2.5 h-2.5 text-[oklch(0.60_0.20_30)] shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Relative time formatting ──

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
