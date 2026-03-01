import type { PaymentTransaction } from "./models";

/**
 * SEPA/CBPR+ allowed character set.
 */
function isSepaAllowedChar(c: string): boolean {
  return /^[A-Za-z0-9 .,;:'()+?/\\-]$/.test(c);
}

/**
 * Remove all non-alphanumeric characters and convert to uppercase.
 */
export function cleanIban(iban: string | null | undefined): string {
  if (!iban || !iban.trim()) return "";
  return iban
    .split("")
    .filter((c) => /[A-Za-z0-9]/.test(c))
    .map((c) => c.toUpperCase())
    .join("");
}

/**
 * Remove all non-alphanumeric characters and convert to uppercase.
 */
export function cleanBic(bic: string | null | undefined): string {
  if (!bic || !bic.trim()) return "";
  return bic
    .split("")
    .filter((c) => /[A-Za-z0-9]/.test(c))
    .map((c) => c.toUpperCase())
    .join("");
}

/**
 * Allow alphanumeric, hyphen, and space. Trim result.
 */
export function cleanAccountNumber(accountNum: string | null | undefined): string {
  if (!accountNum || !accountNum.trim()) return "";
  return accountNum
    .split("")
    .filter((c) => /[A-Za-z0-9\- ]/.test(c))
    .join("")
    .trim();
}

/**
 * Keep only Latin letters, digits, space, and SEPA-safe punctuation.
 * Truncate to maxLength.
 */
export function cleanText(text: string | null | undefined, maxLength: number): string {
  if (!text || !text.trim()) return "";
  const result = text
    .trim()
    .split("")
    .filter((c) => isSepaAllowedChar(c))
    .join("");
  return result.length > maxLength ? result.substring(0, maxLength) : result;
}

/**
 * Auto-pad 8-character BIC to 11 characters with "XXX" suffix.
 */
export function padBic(bic: string): string {
  if (bic.length === 8) return bic + "XXX";
  return bic;
}

/**
 * Validate basic BIC format (ISO 9362).
 * Returns null if valid, error message if invalid.
 */
export function validateBicFormat(bic: string): string | null {
  if (bic.length !== 8 && bic.length !== 11)
    return `Invalid BIC length (${bic.length} chars, expected 8 or 11): ${bic}`;

  const bankCode = bic.substring(0, 4);
  if (!/^[A-Za-z]+$/.test(bankCode))
    return `BIC bank code should be 4 letters (found: ${bankCode})`;

  const countryCode = bic.substring(4, 6);
  if (!/^[A-Za-z]+$/.test(countryCode))
    return `BIC country code should be 2 letters (found: ${countryCode})`;

  return null;
}

/**
 * Basic IBAN format validation.
 * Returns null if valid, error message if invalid.
 */
export function validateIbanFormat(iban: string): string | null {
  if (iban.length < 15 || iban.length > 34)
    return `Invalid IBAN length (${iban.length} chars): ${iban}`;

  if (!/^[A-Za-z]/.test(iban[0]) || !/^[A-Za-z]/.test(iban[1]))
    return `IBAN must start with 2-letter country code: ${iban}`;

  if (iban.toUpperCase().startsWith("NL") && iban.length !== 18)
    return `Dutch IBAN must be 18 characters (found ${iban.length}): ${iban}`;

  if (iban.toUpperCase().startsWith("GB") && iban.length !== 22)
    return `UK IBAN must be 22 characters (found ${iban.length}): ${iban}`;

  return null;
}

/**
 * Extract 6-digit UK sort code from a UK IBAN or account number.
 */
export function extractUkSortCode(trans: PaymentTransaction): string | null {
  if (trans.creditorIban) {
    const clean = cleanIban(trans.creditorIban);
    if (clean.startsWith("GB") && clean.length === 22) {
      const sortCode = clean.substring(8, 14);
      if (/^\d{6}$/.test(sortCode)) return sortCode;
    }
  }

  if (trans.creditorAccountNumber) {
    const digits = trans.creditorAccountNumber
      .split("")
      .filter((c) => /\d/.test(c))
      .slice(0, 6)
      .join("");
    if (digits.length === 6) return digits;
  }

  return null;
}

/**
 * XML-escape a string for safe inclusion in XML content.
 */
export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
