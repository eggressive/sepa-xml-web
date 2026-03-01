// ── Data Models ported from C# SepaXmlGenerator.Models ──

export enum ValidationSeverity {
  Info = "Info",
  Warning = "Warning",
  Error = "Error",
}

export interface ValidationMessage {
  severity: ValidationSeverity;
  sheet: string;
  row: number;
  field: string;
  message: string;
}

export class ValidationResult {
  messages: ValidationMessage[] = [];

  get hasErrors(): boolean {
    return this.messages.some((m) => m.severity === ValidationSeverity.Error);
  }

  get errorCount(): number {
    return this.messages.filter((m) => m.severity === ValidationSeverity.Error).length;
  }

  get warningCount(): number {
    return this.messages.filter((m) => m.severity === ValidationSeverity.Warning).length;
  }

  addError(sheet: string, row: number, field: string, message: string): void {
    this.messages.push({ severity: ValidationSeverity.Error, sheet, row, field, message });
  }

  addWarning(sheet: string, row: number, field: string, message: string): void {
    this.messages.push({ severity: ValidationSeverity.Warning, sheet, row, field, message });
  }

  addInfo(sheet: string, row: number, field: string, message: string): void {
    this.messages.push({ severity: ValidationSeverity.Info, sheet, row, field, message });
  }

  formatMessage(msg: ValidationMessage): string {
    const location = msg.row > 0 ? `[${msg.sheet} Row ${msg.row}]` : `[${msg.sheet}]`;
    const prefix =
      msg.severity === ValidationSeverity.Error
        ? "ERROR"
        : msg.severity === ValidationSeverity.Warning
          ? "WARN"
          : "INFO";
    return `${prefix} ${location} ${msg.field}: ${msg.message}`;
  }
}

export interface PaymentTransaction {
  week?: string;
  paymentType: string;
  fundName: string;
  debtorIban: string;
  valueDate: Date;
  currencyCode: string;
  amount: number;
  creditorBic: string;
  creditorAccountNumber: string;
  creditorIban: string;
  creditorName: string;
  description: string;
  sheetName: string;
  rowNumber: number;
}

export interface PaymentBatch {
  batchId: string;
  debtorIban: string;
  debtorName: string;
  executionDate: Date;
  transactions: PaymentTransaction[];
  totalAmount: number;
  transactionCount: number;
}

export interface ColumnMapping {
  fundName?: string;
  debtorIban?: string;
  valueDate?: string;
  currency?: string;
  amount?: string;
  creditorBic?: string;
  accountNumber?: string;
  creditorIban?: string;
  creditorName?: string;
  description?: string;
  paymentType?: string;
}

export interface RoutingRule {
  type: string;
  serviceLevel?: string;
  chargeBearer?: string;
  priority?: string;
  batchBooking?: boolean;
}

export interface BankProfile {
  profileName: string;
  bank: string;
  painVersion: string;
  defaultDebtorBic: string;
  initiatingPartyName: string;
  senderId?: string;
  sheetName?: string;
  sheetSelection?: string;
  dataStartRow: number;
  columnMapping: ColumnMapping;
  defaults?: Record<string, string>;
  routing: Record<string, RoutingRule>;
  useIndividualProcessing: boolean;
  isMultiSheet: boolean;
}

export interface RoutedPayments {
  paymentType: string;
  currencyCode: string;
  rule: RoutingRule;
  transactions: PaymentTransaction[];
  filePrefix: string;
}

export interface GeneratedFile {
  fileName: string;
  xmlContent: string;
  paymentType: string;
  currency: string;
  transactionCount: number;
  totalAmount: number;
  schemaValidation?: {
    valid: boolean;
    issues: { severity: "error" | "warning" | "info"; path: string; message: string }[];
  };
}

// ── Helper functions ──

export function createPaymentBatch(
  batchId: string,
  debtorIban: string,
  debtorName: string,
  executionDate: Date,
  transactions: PaymentTransaction[]
): PaymentBatch {
  return {
    batchId,
    debtorIban,
    debtorName,
    executionDate,
    transactions,
    totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
    transactionCount: transactions.length,
  };
}

export function createIndividualBatches(transactions: PaymentTransaction[]): PaymentBatch[] {
  const timestamp = formatDateCompact(new Date());
  return transactions.map((trans, i) =>
    createPaymentBatch(
      `PMT-${timestamp}-${String(i + 1).padStart(3, "0")}`,
      trans.debtorIban,
      trans.fundName,
      trans.valueDate,
      [trans]
    )
  );
}

export function groupByDebtorAndDate(transactions: PaymentTransaction[]): PaymentBatch[] {
  const groups = new Map<string, PaymentTransaction[]>();
  for (const t of transactions) {
    const key = `${t.debtorIban}|${formatDate(t.valueDate)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  let index = 0;
  const batches: PaymentBatch[] = [];
  for (const [, group] of Array.from(groups)) {
    index++;
    const first = group[0];
    const ibanSuffix = first.debtorIban.length >= 4 ? first.debtorIban.slice(-4) : first.debtorIban;
    batches.push(
      createPaymentBatch(
        `BATCH${formatDateCompact(first.valueDate)}-${ibanSuffix}-${index}`,
        first.debtorIban,
        first.fundName,
        first.valueDate,
        group
      )
    );
  }
  return batches;
}

export function getFilePrefix(paymentType: string, currencyCode: string): string {
  switch (paymentType) {
    case "SEPA":
      return `SEPA_${currencyCode}`;
    case "NonSEPA":
      return `NonSEPA_${currencyCode}`;
    case "CHAPS":
      return `RBS_CHAPS_${currencyCode}`;
    case "FP":
      return `RBS_FP_${currencyCode}`;
    case "INTL":
      return `RBS_INTL_${currencyCode}`;
    default:
      return `${paymentType}_${currencyCode}`;
  }
}

export function columnLetterToIndex(column: string): number {
  let index = 0;
  for (const c of column.toUpperCase()) {
    index = index * 26 + (c.charCodeAt(0) - "A".charCodeAt(0) + 1);
  }
  return index;
}

// ── Date formatting helpers ──

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateCompact(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function formatDateTime(date: Date): string {
  return `${formatDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

export function formatTimestamp(date: Date): string {
  return `${formatDateCompact(date)}_${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
}

export function formatAmount(amount: number): string {
  return amount.toFixed(2);
}
