import type { BankProfile, PaymentTransaction } from "./models";
import { ValidationResult } from "./models";
import { getRoutingRule } from "./profiles";
import {
  extractUkSortCode,
  padBic,
  validateBicFormat,
  validateIbanFormat,
} from "./sanitizer";

/**
 * Validate all transactions and return structured results.
 * Transactions with critical errors are removed from the list.
 */
export function validateTransactions(
  transactions: PaymentTransaction[],
  profile: BankProfile,
  validation: ValidationResult
): { valid: PaymentTransaction[]; validation: ValidationResult } {
  const valid = transactions.filter((t) => validateTransaction(t, profile, validation));
  return { valid, validation };
}

function getRoutingKey(trans: PaymentTransaction, profile: BankProfile): string {
  if (
    profile.bank === "rbs" &&
    trans.currencyCode === "GBP" &&
    trans.paymentType.toUpperCase() === "CHAPS"
  ) {
    return "GBP_CHAPS";
  }
  return trans.currencyCode;
}

function validateTransaction(
  trans: PaymentTransaction,
  profile: BankProfile,
  validation: ValidationResult
): boolean {
  const sheet = trans.sheetName;
  const row = trans.rowNumber;

  // Debtor IBAN required
  if (!trans.debtorIban) {
    validation.addError(sheet, row, "DebtorIBAN", "Missing debtor IBAN");
    return false;
  }

  // Validate debtor IBAN format
  const debtorIbanError = validateIbanFormat(trans.debtorIban);
  if (debtorIbanError) {
    validation.addWarning(sheet, row, "DebtorIBAN", debtorIbanError);
  }

  // Creditor name required
  if (!trans.creditorName) {
    validation.addError(sheet, row, "CreditorName", "Missing creditor name");
    return false;
  }

  // Amount validation
  if (trans.amount <= 0) {
    validation.addError(sheet, row, "Amount", `Invalid amount: ${trans.amount}`);
    return false;
  }

  // Currency validation
  if (!trans.currencyCode || trans.currencyCode.length !== 3) {
    validation.addError(sheet, row, "Currency", `Invalid currency code: ${trans.currencyCode}`);
    return false;
  }

  // Determine payment type for type-specific validation
  const routingKey = getRoutingKey(trans, profile);
  const rule =
    getRoutingRule(profile, routingKey, false) ?? getRoutingRule(profile, trans.currencyCode);

  if (!rule) {
    validation.addError(
      sheet,
      row,
      "Routing",
      `No routing rule for currency ${trans.currencyCode}`
    );
    return false;
  }

  // Payment-type specific validation
  const typeValid = validateForPaymentType(trans, rule.type, profile, validation);

  // BIC auto-padding
  if (trans.creditorBic) {
    const bicError = validateBicFormat(trans.creditorBic);
    if (bicError) {
      validation.addWarning(sheet, row, "CreditorBIC", bicError);
    }

    if (trans.creditorBic.length === 8) {
      const original = trans.creditorBic;
      trans.creditorBic = padBic(trans.creditorBic);
      validation.addInfo(
        sheet,
        row,
        "CreditorBIC",
        `BIC auto-padded: ${original} -> ${trans.creditorBic}`
      );
    }
  }

  // Creditor IBAN format check (if present)
  if (trans.creditorIban) {
    const ibanError = validateIbanFormat(trans.creditorIban);
    if (ibanError) {
      validation.addWarning(sheet, row, "CreditorIBAN", ibanError);
    }
  }

  return typeValid;
}

function validateForPaymentType(
  trans: PaymentTransaction,
  paymentType: string,
  profile: BankProfile,
  validation: ValidationResult
): boolean {
  const sheet = trans.sheetName;
  const row = trans.rowNumber;

  switch (paymentType.toUpperCase()) {
    case "SEPA":
      if (!trans.creditorIban) {
        validation.addError(sheet, row, "CreditorIBAN", "IBAN is mandatory for SEPA payments");
        return false;
      }
      if (profile.bank === "rbs" && !trans.creditorBic) {
        validation.addError(
          sheet,
          row,
          "CreditorBIC",
          "BIC is mandatory for RBS SEPA payments"
        );
        return false;
      }
      break;

    case "NONSEPA":
      if (!trans.creditorIban && !trans.creditorAccountNumber) {
        validation.addError(
          sheet,
          row,
          "CreditorAccount",
          "IBAN or account number required for Non-SEPA payments"
        );
        return false;
      }
      if (!trans.creditorBic) {
        validation.addError(
          sheet,
          row,
          "CreditorBIC",
          `BIC is mandatory for ${trans.currencyCode} payments`
        );
        return false;
      }
      break;

    case "CHAPS":
    case "FP":
      if (!trans.creditorIban && !trans.creditorAccountNumber) {
        validation.addError(
          sheet,
          row,
          "CreditorAccount",
          `Missing creditor account for ${paymentType} payment`
        );
        return false;
      }
      if (extractUkSortCode(trans) === null) {
        validation.addError(
          sheet,
          row,
          "SortCode",
          `Cannot derive UK sort code for ${paymentType} payment (need UK IBAN or 6+ digit account number)`
        );
        return false;
      }
      break;

    case "INTL":
      if (!trans.creditorBic) {
        validation.addError(
          sheet,
          row,
          "CreditorBIC",
          "BIC is mandatory for international payments"
        );
        return false;
      }
      if (!trans.creditorIban && !trans.creditorAccountNumber) {
        validation.addError(
          sheet,
          row,
          "CreditorAccount",
          "Missing creditor account for international payment"
        );
        return false;
      }
      break;
  }

  return true;
}
