import type { BankProfile, GeneratedFile, RoutedPayments } from "../models";
import { generateAbnAmro } from "./abnamro";
import { generateRbs } from "./rbs";

/**
 * Generate XML files based on the bank profile type.
 */
export function generateXmlFiles(
  routedPayments: RoutedPayments[],
  profile: BankProfile
): GeneratedFile[] {
  switch (profile.bank) {
    case "abnamro":
      return generateAbnAmro(routedPayments, profile);
    case "rbs":
      return generateRbs(routedPayments, profile);
    default:
      throw new Error(`Unknown bank: ${profile.bank}`);
  }
}
