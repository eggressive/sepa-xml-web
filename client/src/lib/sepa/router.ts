import type { BankProfile, PaymentTransaction, RoutedPayments, RoutingRule } from "./models";
import { getFilePrefix } from "./models";

/**
 * Route transactions to payment groups based on currency and profile routing rules.
 * Ported from C# PaymentRouter.cs.
 */
export function routePayments(
  transactions: PaymentTransaction[],
  profile: BankProfile
): RoutedPayments[] {
  const groups = new Map<string, { rule: RoutingRule; transactions: PaymentTransaction[] }>();

  for (const trans of transactions) {
    const routingKey = getRoutingKey(trans, profile);
    const rule = resolveRoutingRule(profile, routingKey, trans.currencyCode);

    if (!rule) {
      console.warn(
        `No routing rule for ${trans.currencyCode} on row ${trans.rowNumber} (sheet: ${trans.sheetName})`
      );
      continue;
    }

    const groupKey = `${rule.type}_${trans.currencyCode}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { rule, transactions: [] });
    }
    groups.get(groupKey)!.transactions.push(trans);
  }

  const result: RoutedPayments[] = [];
  for (const [groupKey, group] of Array.from(groups)) {
    const parts = groupKey.split("_");
    const paymentType = parts[0];
    const currencyCode = parts.slice(1).join("_");

    result.push({
      paymentType,
      currencyCode,
      rule: group.rule,
      transactions: group.transactions,
      filePrefix: getFilePrefix(paymentType, currencyCode),
    });
  }

  return result;
}

function getRoutingKey(trans: PaymentTransaction, profile: BankProfile): string {
  // RBS-specific: GBP CHAPS payments use a special routing key
  if (
    profile.bank === "rbs" &&
    trans.currencyCode === "GBP" &&
    trans.paymentType.toUpperCase() === "CHAPS"
  ) {
    return "GBP_CHAPS";
  }
  return trans.currencyCode;
}

function resolveRoutingRule(
  profile: BankProfile,
  routingKey: string,
  currency: string
): RoutingRule | null {
  // Try exact routing key first
  if (profile.routing[routingKey]) return profile.routing[routingKey];
  // Try currency code
  if (routingKey !== currency && profile.routing[currency]) return profile.routing[currency];
  // Fall back to DEFAULT
  if (profile.routing["DEFAULT"]) return profile.routing["DEFAULT"];
  return null;
}
