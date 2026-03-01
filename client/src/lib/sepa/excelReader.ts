import * as XLSX from "xlsx";
import type { BankProfile, PaymentTransaction } from "./models";
import { ValidationResult, columnLetterToIndex } from "./models";
import { getDefault } from "./profiles";
import { cleanAccountNumber, cleanBic, cleanIban, cleanText } from "./sanitizer";

/**
 * Get available sheet names from an Excel file buffer.
 */
export function getSheetNames(data: ArrayBuffer): string[] {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  return workbook.SheetNames;
}

/**
 * Read transactions from the specified sheets of an Excel file.
 */
export function readTransactions(
  data: ArrayBuffer,
  profile: BankProfile,
  sheetNames: string[]
): { transactions: PaymentTransaction[]; validation: ValidationResult } {
  const workbook = XLSX.read(data, { type: "array", cellDates: true, cellText: true });
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
      const parsed = new Date(cellValue);
      if (!isNaN(parsed.getTime())) {
        trans.valueDate = parsed;
      } else {
        validation.addError(sheetName, row, "ValueDate", "Invalid value date");
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
      const strAmt = cellValue.replace(",", ".").trim();
      const parsedAmt = parseFloat(strAmt);
      if (!isNaN(parsedAmt)) {
        trans.amount = parsedAmt;
      } else {
        validation.addError(sheetName, row, "Amount", `Invalid amount: ${strAmt}`);
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
