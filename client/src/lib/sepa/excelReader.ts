import * as XLSX from "xlsx";
import type { BankProfile, PaymentTransaction } from "./models";
import { ValidationResult, columnLetterToIndex } from "./models";
import { getDefault } from "./profiles";
import { cleanAccountNumber, cleanBic, cleanIban, cleanText } from "./sanitizer";
import { cleanExcelFile } from "./excelCleaner";

/**
 * Prepare an Excel file buffer for parsing.
 * Always cleans .xlsx files through JSZip to remove Microsoft 365
 * custom XML parts that cause browser DOMParser errors.
 *
 * This "always-clean" strategy is more reliable than try-catch fallback
 * because the xlsx library can throw various error types (TypeError,
 * Error, etc.) depending on which namespace triggers the failure,
 * and some errors crash React before they can be caught.
 */
async function prepareExcelData(data: ArrayBuffer): Promise<ArrayBuffer> {
  // Check if this is a ZIP-based format (.xlsx, .xlsm) by looking at the magic bytes
  const header = new Uint8Array(data, 0, 4);
  const isZip =
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04;

  if (isZip) {
    console.log("[SEPA] Cleaning Excel file to remove Microsoft 365 custom XML parts...");
    try {
      return await cleanExcelFile(data);
    } catch (cleanErr) {
      console.warn("[SEPA] File cleaning failed, proceeding with original:", cleanErr);
      return data;
    }
  }

  // Non-ZIP formats (.xls binary) don't have the namespace issue
  return data;
}

/**
 * Get available sheet names from an Excel file buffer.
 * Always pre-cleans .xlsx files to avoid namespace errors.
 */
export async function getSheetNames(data: ArrayBuffer): Promise<string[]> {
  const cleaned = await prepareExcelData(data);
  const workbook = XLSX.read(cleaned, { type: "array", cellDates: true });
  return workbook.SheetNames;
}

/**
 * Read transactions from the specified sheets of an Excel file.
 * Always pre-cleans .xlsx files to avoid namespace errors.
 */
export async function readTransactions(
  data: ArrayBuffer,
  profile: BankProfile,
  sheetNames: string[]
): Promise<{ transactions: PaymentTransaction[]; validation: ValidationResult }> {
  const cleaned = await prepareExcelData(data);
  const workbook = XLSX.read(cleaned, { type: "array", cellDates: true, cellText: true });

  const transactions: PaymentTransaction[] = [];
  const validation = new ValidationResult();

  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      validation.addError(sheetName, 0, "Sheet", `Sheet '${sheetName}' not found`);
      continue;
    }

    const sheetTransactions = readSheet(worksheet, sheetName, profile, validation);
    transactions.push(...sheetTransactions);
  }

  return { transactions, validation };
}

function readSheet(
  ws: XLSX.WorkSheet,
  sheetName: string,
  profile: BankProfile,
  validation: ValidationResult
): PaymentTransaction[] {
  const transactions: PaymentTransaction[] = [];
  const mapping = profile.columnMapping;
  const startRow = profile.dataStartRow;

  // Find last row with data
  const lastRow = findLastRow(ws, mapping, startRow);

  if (lastRow < startRow) {
    validation.addWarning(sheetName, 0, "Sheet", "No data rows found");
    return transactions;
  }

  for (let row = startRow; row <= lastRow; row++) {
    const trans = readRow(ws, row, sheetName, profile, validation);
    if (trans) transactions.push(trans);
  }

  return transactions;
}

function getCellValue(ws: XLSX.WorkSheet, row: number, col: number): unknown {
  const cellRef = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  const cell = ws[cellRef];
  return cell ? cell.v : undefined;
}

function getCellText(ws: XLSX.WorkSheet, row: number, col: number): string {
  const cellRef = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  const cell = ws[cellRef];
  if (!cell) return "";
  // Prefer formatted text, fall back to value
  if (cell.w !== undefined) return String(cell.w).trim();
  if (cell.v !== undefined) return String(cell.v).trim();
  return "";
}

function readCellText(ws: XLSX.WorkSheet, row: number, columnLetter?: string): string {
  if (!columnLetter) return "";
  const col = columnLetterToIndex(columnLetter);
  return getCellText(ws, row, col);
}

function readFieldWithDefault(
  ws: XLSX.WorkSheet,
  row: number,
  columnLetter: string | undefined,
  defaultKey: string,
  profile: BankProfile
): string {
  if (columnLetter) {
    const col = columnLetterToIndex(columnLetter);
    const text = getCellText(ws, row, col);
    if (text) return text;
  }
  return getDefault(profile, defaultKey) ?? "";
}

function readRow(
  ws: XLSX.WorkSheet,
  row: number,
  sheetName: string,
  profile: BankProfile,
  validation: ValidationResult
): PaymentTransaction | null {
  const mapping = profile.columnMapping;

  const trans: PaymentTransaction = {
    paymentType: readCellText(ws, row, mapping.paymentType),
    fundName: readFieldWithDefault(ws, row, mapping.fundName, "fundName", profile),
    debtorIban: "",
    valueDate: new Date(),
    currencyCode: "",
    amount: 0,
    creditorBic: "",
    creditorAccountNumber: "",
    creditorIban: "",
    creditorName: "",
    description: "",
    sheetName,
    rowNumber: row,
  };

  // DebtorIBAN: column or default
  const rawDebtorIban = readFieldWithDefault(ws, row, mapping.debtorIban, "debtorIban", profile);
  trans.debtorIban = cleanIban(rawDebtorIban);

  // ValueDate: column or default
  const valueDateDefault = getDefault(profile, "valueDate");
  if (valueDateDefault === "TODAY") {
    trans.valueDate = new Date();
    // Zero out time
    trans.valueDate.setHours(0, 0, 0, 0);
  } else if (mapping.valueDate) {
    const col = columnLetterToIndex(mapping.valueDate);
    const cellValue = getCellValue(ws, row, col);
    if (cellValue instanceof Date) {
      trans.valueDate = cellValue;
    } else if (typeof cellValue === "number") {
      // Excel serial date number
      trans.valueDate = excelSerialToDate(cellValue);
    } else if (typeof cellValue === "string") {
      const parsed = parseDate(cellValue);
      if (parsed && !isNaN(parsed.getTime())) {
        trans.valueDate = parsed;
      } else {
        validation.addError(sheetName, row, "ValueDate", `Invalid value date: ${cellValue}`);
        return null;
      }
    } else {
      validation.addError(sheetName, row, "ValueDate", "Invalid value date");
      return null;
    }
  } else if (valueDateDefault) {
    const parsed = new Date(valueDateDefault);
    if (!isNaN(parsed.getTime())) {
      trans.valueDate = parsed;
    } else {
      validation.addError(sheetName, row, "ValueDate", "No value date configured");
      return null;
    }
  } else {
    validation.addError(sheetName, row, "ValueDate", "No value date configured");
    return null;
  }

  // Currency: column or default
  const currency = readFieldWithDefault(ws, row, mapping.currency, "currency", profile);
  trans.currencyCode = currency.toUpperCase().trim();

  // Amount
  if (mapping.amount) {
    const col = columnLetterToIndex(mapping.amount);
    const cellValue = getCellValue(ws, row, col);
    if (typeof cellValue === "number") {
      trans.amount = cellValue;
    } else if (typeof cellValue === "string") {
      const parsedAmt = parseAmount(cellValue);
      if (parsedAmt !== null && !isNaN(parsedAmt)) {
        trans.amount = parsedAmt;
      } else {
        validation.addError(sheetName, row, "Amount", `Invalid amount: ${cellValue}`);
        return null;
      }
    } else if (cellValue === undefined || cellValue === null) {
      // Check if this is a fully empty row
      const hasName = !!readCellText(ws, row, mapping.creditorName);
      const hasIban = !!readCellText(ws, row, mapping.creditorIban);
      if (hasName || hasIban) {
        validation.addError(sheetName, row, "Amount", "Missing amount");
        return null;
      }
      return null; // Fully empty row
    } else {
      validation.addError(sheetName, row, "Amount", "Invalid amount");
      return null;
    }
  }

  // Validate positive amount
  if (trans.amount <= 0) {
    // Check if this is just an empty row (amount = 0 with no other data)
    const hasName = !!readCellText(ws, row, mapping.creditorName);
    const hasIban = !!readCellText(ws, row, mapping.creditorIban);
    if (!hasName && !hasIban) return null; // Skip empty row silently

    validation.addError(sheetName, row, "Amount", `Amount must be positive (got ${trans.amount})`);
    return null;
  }

  // CreditorBIC
  const rawBic = readCellText(ws, row, mapping.creditorBic);
  trans.creditorBic = cleanBic(rawBic);

  // CreditorAccountNumber
  const rawAcct = readCellText(ws, row, mapping.accountNumber);
  trans.creditorAccountNumber = cleanAccountNumber(rawAcct);

  // CreditorIBAN
  const rawCreditorIban = readCellText(ws, row, mapping.creditorIban);
  trans.creditorIban = cleanIban(rawCreditorIban);

  // CreditorName
  const rawName = readCellText(ws, row, mapping.creditorName);
  trans.creditorName = cleanText(rawName, 70);

  // Description
  const rawDesc = readCellText(ws, row, mapping.description);
  trans.description = cleanText(rawDesc, 140);

  // Skip rows where key fields are empty
  if (!trans.creditorName && !trans.creditorIban) return null;

  return trans;
}

function findLastRow(
  ws: XLSX.WorkSheet,
  mapping: { amount?: string; creditorName?: string; creditorIban?: string },
  startRow: number
): number {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxSheetRow = range.e.r + 1; // 1-based

  const columnsToCheck = [
    mapping.amount,
    mapping.creditorName,
    mapping.creditorIban,
  ]
    .filter((c): c is string => !!c)
    .map((c) => columnLetterToIndex(c));

  if (columnsToCheck.length === 0) return 0;

  let maxRow = 0;
  for (const col of columnsToCheck) {
    for (let row = maxSheetRow; row >= startRow; row--) {
      const val = getCellValue(ws, row, col);
      if (val !== undefined && val !== null) {
        maxRow = Math.max(maxRow, row);
        break;
      }
    }
  }

  return maxRow;
}

/**
 * Parse an amount string, handling various European and international formats:
 * - Space as thousands separator: "250 000.00" → 250000.00
 * - Dot as thousands separator with comma decimal: "250.000,00" → 250000.00
 * - Comma as decimal separator: "1234,56" → 1234.56
 * - Plain number: "1234.56" → 1234.56
 * - Negative amounts with parentheses: "(1234.56)" → -1234.56
 */
function parseAmount(value: string): number | null {
  let s = value.trim();
  if (!s) return null;

  // Handle parentheses for negative amounts
  const isNeg = s.startsWith("(") && s.endsWith(")");
  if (isNeg) s = s.slice(1, -1).trim();

  // Remove currency symbols and whitespace-like chars
  s = s.replace(/[€$£¥]/g, "").trim();

  // Detect format by looking at the last separator
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > lastDot) {
    // Comma is the decimal separator (European: "1.234,56" or "1234,56")
    // Remove dots (thousands), replace comma with dot
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Dot is the decimal separator ("1,234.56" or "250 000.00")
    // Remove commas and spaces (thousands)
    s = s.replace(/,/g, "").replace(/\s/g, "");
  } else {
    // No separator or same position — just remove spaces
    s = s.replace(/\s/g, "");
  }

  const result = parseFloat(s);
  if (isNaN(result)) return null;
  return isNeg ? -result : result;
}

/**
 * Parse a date string, handling DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, and other common formats.
 * Prioritizes European DD-MM-YYYY format when ambiguous.
 */
function parseDate(value: string): Date | null {
  const s = value.trim();
  if (!s) return null;

  // Try DD-MM-YYYY or DD/MM/YYYY (European format)
  const euMatch = s.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{4})$/);
  if (euMatch) {
    const day = parseInt(euMatch[1], 10);
    const month = parseInt(euMatch[2], 10);
    const year = parseInt(euMatch[3], 10);
    // If first number > 12, it must be a day (DD-MM-YYYY)
    // If second number > 12, first must be month (MM-DD-YYYY)
    // Otherwise, assume DD-MM-YYYY (European default)
    if (day > 12 || (day <= 12 && month <= 12)) {
      // Assume DD-MM-YYYY (European)
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(year, month - 1, day);
      }
    }
    if (month > 12 && day <= 12) {
      // Must be MM-DD-YYYY (US) since month > 12
      // Actually this means the "month" position has > 12, so swap
      return new Date(year, day - 1, month);
    }
    // Default: DD-MM-YYYY
    if (month >= 1 && month <= 12) {
      return new Date(year, month - 1, day);
    }
  }

  // Try YYYY-MM-DD (ISO format)
  const isoMatch = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  // Fallback: try native Date parsing
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}

/**
 * Convert Excel serial date number to JavaScript Date.
 * Excel serial dates count days since 1900-01-01 (with the Lotus 1-2-3 bug).
 */
function excelSerialToDate(serial: number): Date {
  // Excel incorrectly treats 1900 as a leap year (Lotus 1-2-3 bug)
  // Dates after Feb 28, 1900 need adjustment
  const utcDays = Math.floor(serial) - 25569; // 25569 = days from 1900-01-01 to 1970-01-01
  const date = new Date(utcDays * 86400000);
  return date;
}
