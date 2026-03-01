/**
 * Processing history hook — localStorage-backed.
 *
 * Stores up to 50 recent export records. Each record captures the
 * source file name, bank profile, timestamp, per-file summaries
 * (payment type, currency, txn count, amount, schema status), and
 * overall totals.
 */
import { useState, useCallback, useEffect } from "react";

// ── Data model ──

export interface HistoryFileSummary {
  fileName: string;
  paymentType: string;
  currency: string;
  transactionCount: number;
  totalAmount: number;
  schemaValid: boolean;
}

export interface HistoryEntry {
  /** Unique id (timestamp-based) */
  id: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Original Excel file name */
  sourceFile: string;
  /** Bank profile display name */
  profileName: string;
  /** Sheets that were processed */
  sheets: string[];
  /** Per-generated-file summaries */
  files: HistoryFileSummary[];
  /** Aggregate totals */
  totalTransactions: number;
  totalAmount: number;
  /** Whether all files passed schema validation */
  allSchemaValid: boolean;
}

// ── Constants ──

const STORAGE_KEY = "sepa-xml-history";
const MAX_ENTRIES = 50;

// ── Helpers ──

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ── Hook ──

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  // Load on mount
  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  const addEntry = useCallback(
    (entry: Omit<HistoryEntry, "id" | "timestamp">) => {
      const newEntry: HistoryEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
      };
      setEntries((prev) => {
        const updated = [newEntry, ...prev].slice(0, MAX_ENTRIES);
        saveHistory(updated);
        return updated;
      });
    },
    [],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setEntries([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { entries, addEntry, removeEntry, clearHistory };
}
