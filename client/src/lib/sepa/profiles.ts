import type { BankProfile } from "./models";

export const PROFILES: BankProfile[] = [
  {
    profileName: "ABN AMRO - Standard",
    bank: "abnamro",
    painVersion: "pain.001.001.03",
    defaultDebtorBic: "ABNANL2A",
    initiatingPartyName: "IQ EQ Netherlands N.V.",
    sheetName: "Ter goedkeuring",
    dataStartRow: 4,
    useIndividualProcessing: true,
    isMultiSheet: false,
    columnMapping: {
      paymentType: "B",
      fundName: "C",
      debtorIban: "D",
      valueDate: "E",
      currency: "F",
      amount: "G",
      creditorBic: "H",
      accountNumber: "I",
      creditorIban: "J",
      creditorName: "K",
      description: "L",
    },
    routing: {
      EUR: { type: "SEPA", serviceLevel: "SEPA", chargeBearer: "SLEV" },
      DEFAULT: { type: "NonSEPA", chargeBearer: "SHAR" },
    },
  },
  {
    profileName: "RBS/NatWest - Standard",
    bank: "rbs",
    painVersion: "pain.001.001.09",
    defaultDebtorBic: "RBSIGB2L",
    initiatingPartyName: "IQ EQ Netherlands N.V.",
    senderId: "4493",
    sheetName: "Ter goedkeuring",
    dataStartRow: 4,
    useIndividualProcessing: true,
    isMultiSheet: false,
    columnMapping: {
      paymentType: "B",
      fundName: "C",
      debtorIban: "D",
      valueDate: "E",
      currency: "F",
      amount: "G",
      creditorBic: "H",
      accountNumber: "I",
      creditorIban: "J",
      creditorName: "K",
      description: "L",
    },
    routing: {
      GBP_CHAPS: {
        type: "CHAPS",
        serviceLevel: "URGP",
        chargeBearer: "SHAR",
        priority: "HIGH",
        batchBooking: false,
      },
      GBP: {
        type: "FP",
        serviceLevel: "NURG",
        chargeBearer: "SHAR",
        batchBooking: true,
      },
      EUR: {
        type: "SEPA",
        serviceLevel: "SEPA",
        chargeBearer: "SLEV",
        batchBooking: true,
      },
      DEFAULT: {
        type: "INTL",
        serviceLevel: "NURG",
        chargeBearer: "SHAR",
        batchBooking: false,
      },
    },
  },
  {
    profileName: "IREF - ABN AMRO SEPA",
    bank: "abnamro",
    painVersion: "pain.001.001.03",
    defaultDebtorBic: "ABNANL2A",
    initiatingPartyName: "IQ EQ Netherlands N.V.",
    sheetSelection: "user",
    dataStartRow: 2,
    useIndividualProcessing: true,
    isMultiSheet: true,
    defaults: {
      debtorIban: "NL74ABNA0132320614",
      fundName: "IREF Funding BV",
      currency: "EUR",
      valueDate: "TODAY",
    },
    columnMapping: {
      creditorName: "B",
      description: "C",
      amount: "O",
      creditorIban: "Q",
      creditorBic: "R",
    },
    routing: {
      EUR: { type: "SEPA", serviceLevel: "SEPA", chargeBearer: "SLEV" },
    },
  },
];

export function getProfileByName(name: string): BankProfile | undefined {
  return PROFILES.find((p) => p.profileName === name);
}

export function getRoutingRule(
  profile: BankProfile,
  currency: string,
  includeDefault = true
): { type: string; serviceLevel?: string; chargeBearer?: string; priority?: string; batchBooking?: boolean } | null {
  if (profile.routing[currency]) return profile.routing[currency];
  if (includeDefault && profile.routing["DEFAULT"]) return profile.routing["DEFAULT"];
  return null;
}

export function getDefault(profile: BankProfile, field: string): string | undefined {
  return profile.defaults?.[field];
}
