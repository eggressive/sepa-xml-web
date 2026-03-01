/**
 * Schema Validator — Client-side XSD validation for SEPA XML files
 *
 * Ported from C# SchemaValidator.cs. Since browsers lack native XSD validation,
 * this module implements structural validation by:
 *   1. Parsing the generated XML with DOMParser
 *   2. Walking the DOM tree against compiled schema rules
 *   3. Checking namespace, element structure, cardinality, and type constraints
 *
 * Covers pain.001.001.03 (ABN AMRO) and pain.001.001.09 (RBS/NatWest).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaValidationIssue {
  severity: "error" | "warning" | "info";
  path: string;
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaValidationIssue[];
}

// ---------------------------------------------------------------------------
// Internal schema representation
// ---------------------------------------------------------------------------

interface SimpleTypeRule {
  base: string;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enumerations?: string[];
  fractionDigits?: number;
  totalDigits?: number;
  minInclusive?: number;
}

type ElementDef = {
  name: string;
  type: string; // type name reference
  minOccurs: number; // 0 = optional, 1+ = required
  maxOccurs: number; // -1 = unbounded
};

type ComplexTypeDef = {
  /** Ordered child elements (for xs:sequence) */
  elements: ElementDef[];
  /** If true, children are wrapped in xs:choice (exactly one must appear) */
  isChoice?: boolean;
  /** For simpleContent extensions (e.g. ActiveOrHistoricCurrencyAndAmount) */
  simpleContent?: { base: string; attributes: { name: string; type: string; required: boolean }[] };
};

// ---------------------------------------------------------------------------
// Schema definitions — pain.001.001.03
// ---------------------------------------------------------------------------

const SIMPLE_TYPES_03: Record<string, SimpleTypeRule> = {
  Max35Text: { base: "string", minLength: 1, maxLength: 35 },
  Max70Text: { base: "string", minLength: 1, maxLength: 70 },
  Max140Text: { base: "string", minLength: 1, maxLength: 140 },
  Max128Text: { base: "string", minLength: 1, maxLength: 128 },
  Max2048Text: { base: "string", minLength: 1, maxLength: 2048 },
  Max34Text: { base: "string", minLength: 1, maxLength: 34 },
  Max16Text: { base: "string", minLength: 1, maxLength: 16 },
  Max10Text: { base: "string", minLength: 1, maxLength: 10 },
  Max4Text: { base: "string", minLength: 1, maxLength: 4 },
  Max15NumericText: { base: "string", pattern: /^[0-9]{1,15}$/ },
  IBAN2007Identifier: { base: "string", pattern: /^[A-Z]{2}[0-9]{2}[a-zA-Z0-9]{1,30}$/ },
  BICIdentifier: { base: "string", pattern: /^[A-Z]{6}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?$/ },
  AnyBICIdentifier: { base: "string", pattern: /^[A-Z]{6}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?$/ },
  ActiveOrHistoricCurrencyCode: { base: "string", pattern: /^[A-Z]{3}$/ },
  CountryCode: { base: "string", pattern: /^[A-Z]{2}$/ },
  ISODate: { base: "date" },
  ISODateTime: { base: "dateTime" },
  BatchBookingIndicator: { base: "boolean" },
  ActiveOrHistoricCurrencyAndAmount_SimpleType: {
    base: "decimal", fractionDigits: 5, totalDigits: 18, minInclusive: 0,
  },
  DecimalNumber: { base: "decimal", fractionDigits: 17, totalDigits: 18 },
  BaseOneRate: { base: "decimal", fractionDigits: 10, totalDigits: 11 },
  PercentageRate: { base: "decimal", fractionDigits: 10, totalDigits: 11 },
  Number: { base: "decimal", fractionDigits: 0, totalDigits: 18 },
  PhoneNumber: { base: "string", pattern: /^\+[0-9]{1,3}-[0-9()+\-]{1,30}$/ },
  // Enumerations
  ChargeBearerType1Code: {
    base: "string", enumerations: ["DEBT", "CRED", "SHAR", "SLEV"],
  },
  PaymentMethod3Code: {
    base: "string", enumerations: ["CHK", "TRF", "TRA"],
  },
  Priority2Code: {
    base: "string", enumerations: ["HIGH", "NORM"],
  },
  AddressType2Code: {
    base: "string", enumerations: ["ADDR", "PBOX", "HOME", "BIZZ", "MLTO", "DLVY"],
  },
  Instruction3Code: {
    base: "string", enumerations: ["CHQB", "HOLD", "PHOB", "TELB"],
  },
  CreditDebitCode: {
    base: "string", enumerations: ["CRDT", "DBIT"],
  },
  Authorisation1Code: {
    base: "string", enumerations: ["AUTH", "FDET", "FSUM", "ILEV"],
  },
  NamePrefix1Code: {
    base: "string", enumerations: ["DOCT", "MIST", "MISS", "MADM"],
  },
  DocumentType3Code: {
    base: "string", enumerations: ["RADM", "RPIN", "FXDR", "DISP", "PUOR", "SCOR"],
  },
  DocumentType5Code: {
    base: "string",
    enumerations: ["MSIN", "CNFA", "DNFA", "CINV", "CREN", "DEBN", "HIRI", "SBIN", "CMCN", "SOAC", "DISP", "BOLD", "VCHR", "AROI", "TSUT"],
  },
  ExchangeRateType1Code: {
    base: "string", enumerations: ["SPOT", "SALE", "AGRD"],
  },
  CashAccountType4Code: {
    base: "string",
    enumerations: ["CASH", "CHAR", "COMM", "TAXE", "CISH", "TRAS", "SACC", "CACC", "SVGS", "ONDP", "MGLD", "NREX", "MOMA", "LOAN", "SLRY", "ODFT"],
  },
  ChequeType2Code: {
    base: "string", enumerations: ["CCHQ", "CCCH", "BCHQ", "DRFT", "ELDR"],
  },
  ChequeDelivery1Code: {
    base: "string",
    enumerations: ["MLDB", "MLCD", "MLFA", "CRDB", "CRCD", "CRFA", "PUDB", "PUCD", "PUFA", "RGDB", "RGCD", "RGFA"],
  },
  RegulatoryReportingType1Code: {
    base: "string", enumerations: ["CRED", "DEBT", "BOTH"],
  },
  RemittanceLocationMethod2Code: {
    base: "string", enumerations: ["FAXI", "EDIC", "URID", "EMAL", "POST", "SMSM"],
  },
  TaxRecordPeriod1Code: {
    base: "string",
    enumerations: ["MM01", "MM02", "MM03", "MM04", "MM05", "MM06", "MM07", "MM08", "MM09", "MM10", "MM11", "MM12", "QTR1", "QTR2", "QTR3", "QTR4", "HLF1", "HLF2"],
  },
  // External code types — just length-constrained strings
  ExternalAccountIdentification1Code: { base: "string", minLength: 1, maxLength: 4 },
  ExternalCategoryPurpose1Code: { base: "string", minLength: 1, maxLength: 4 },
  ExternalClearingSystemIdentification1Code: { base: "string", minLength: 1, maxLength: 5 },
  ExternalFinancialInstitutionIdentification1Code: { base: "string", minLength: 1, maxLength: 4 },
  ExternalLocalInstrument1Code: { base: "string", minLength: 1, maxLength: 35 },
  ExternalOrganisationIdentification1Code: { base: "string", minLength: 1, maxLength: 4 },
  ExternalPersonIdentification1Code: { base: "string", minLength: 1, maxLength: 4 },
  ExternalPurpose1Code: { base: "string", minLength: 1, maxLength: 4 },
  ExternalServiceLevel1Code: { base: "string", minLength: 1, maxLength: 4 },
};

const COMPLEX_TYPES_03: Record<string, ComplexTypeDef> = {
  Document: {
    elements: [{ name: "CstmrCdtTrfInitn", type: "CustomerCreditTransferInitiationV03", minOccurs: 1, maxOccurs: 1 }],
  },
  CustomerCreditTransferInitiationV03: {
    elements: [
      { name: "GrpHdr", type: "GroupHeader32", minOccurs: 1, maxOccurs: 1 },
      { name: "PmtInf", type: "PaymentInstructionInformation3", minOccurs: 1, maxOccurs: -1 },
    ],
  },
  GroupHeader32: {
    elements: [
      { name: "MsgId", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
      { name: "CreDtTm", type: "ISODateTime", minOccurs: 1, maxOccurs: 1 },
      { name: "Authstn", type: "Authorisation1Choice", minOccurs: 0, maxOccurs: 2 },
      { name: "NbOfTxs", type: "Max15NumericText", minOccurs: 1, maxOccurs: 1 },
      { name: "CtrlSum", type: "DecimalNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "InitgPty", type: "PartyIdentification32", minOccurs: 1, maxOccurs: 1 },
      { name: "FwdgAgt", type: "BranchAndFinancialInstitutionIdentification4", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  PaymentInstructionInformation3: {
    elements: [
      { name: "PmtInfId", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
      { name: "PmtMtd", type: "PaymentMethod3Code", minOccurs: 1, maxOccurs: 1 },
      { name: "BtchBookg", type: "BatchBookingIndicator", minOccurs: 0, maxOccurs: 1 },
      { name: "NbOfTxs", type: "Max15NumericText", minOccurs: 0, maxOccurs: 1 },
      { name: "CtrlSum", type: "DecimalNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "PmtTpInf", type: "PaymentTypeInformation19", minOccurs: 0, maxOccurs: 1 },
      { name: "ReqdExctnDt", type: "ISODate", minOccurs: 1, maxOccurs: 1 },
      { name: "PoolgAdjstmntDt", type: "ISODate", minOccurs: 0, maxOccurs: 1 },
      { name: "Dbtr", type: "PartyIdentification32", minOccurs: 1, maxOccurs: 1 },
      { name: "DbtrAcct", type: "CashAccount16", minOccurs: 1, maxOccurs: 1 },
      { name: "DbtrAgt", type: "BranchAndFinancialInstitutionIdentification4", minOccurs: 1, maxOccurs: 1 },
      { name: "DbtrAgtAcct", type: "CashAccount16", minOccurs: 0, maxOccurs: 1 },
      { name: "UltmtDbtr", type: "PartyIdentification32", minOccurs: 0, maxOccurs: 1 },
      { name: "ChrgBr", type: "ChargeBearerType1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "ChrgsAcct", type: "CashAccount16", minOccurs: 0, maxOccurs: 1 },
      { name: "ChrgsAcctAgt", type: "BranchAndFinancialInstitutionIdentification4", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtTrfTxInf", type: "CreditTransferTransactionInformation10", minOccurs: 1, maxOccurs: -1 },
    ],
  },
  CreditTransferTransactionInformation10: {
    elements: [
      { name: "PmtId", type: "PaymentIdentification1", minOccurs: 1, maxOccurs: 1 },
      { name: "PmtTpInf", type: "PaymentTypeInformation19", minOccurs: 0, maxOccurs: 1 },
      { name: "Amt", type: "AmountType3Choice", minOccurs: 1, maxOccurs: 1 },
      { name: "XchgRateInf", type: "ExchangeRateInformation1", minOccurs: 0, maxOccurs: 1 },
      { name: "ChrgBr", type: "ChargeBearerType1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "ChqInstr", type: "Cheque6", minOccurs: 0, maxOccurs: 1 },
      { name: "UltmtDbtr", type: "PartyIdentification32", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt1", type: "BranchAndFinancialInstitutionIdentification4", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt1Acct", type: "CashAccount16", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt2", type: "BranchAndFinancialInstitutionIdentification4", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt2Acct", type: "CashAccount16", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt3", type: "BranchAndFinancialInstitutionIdentification4", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt3Acct", type: "CashAccount16", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtrAgt", type: "BranchAndFinancialInstitutionIdentification4", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtrAgtAcct", type: "CashAccount16", minOccurs: 0, maxOccurs: 1 },
      { name: "Cdtr", type: "PartyIdentification32", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtrAcct", type: "CashAccount16", minOccurs: 0, maxOccurs: 1 },
      { name: "UltmtCdtr", type: "PartyIdentification32", minOccurs: 0, maxOccurs: 1 },
      { name: "InstrForCdtrAgt", type: "InstructionForCreditorAgent1", minOccurs: 0, maxOccurs: -1 },
      { name: "InstrForDbtrAgt", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Purp", type: "Purpose2Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "RgltryRptg", type: "RegulatoryReporting3", minOccurs: 0, maxOccurs: 10 },
      { name: "Tax", type: "TaxInformation3", minOccurs: 0, maxOccurs: 1 },
      { name: "RltdRmtInf", type: "RemittanceLocation2", minOccurs: 0, maxOccurs: 10 },
      { name: "RmtInf", type: "RemittanceInformation5", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  PaymentIdentification1: {
    elements: [
      { name: "InstrId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "EndToEndId", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  PaymentTypeInformation19: {
    elements: [
      { name: "InstrPrty", type: "Priority2Code", minOccurs: 0, maxOccurs: 1 },
      { name: "SvcLvl", type: "ServiceLevel8Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "LclInstrm", type: "LocalInstrument2Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "CtgyPurp", type: "CategoryPurpose1Choice", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  PartyIdentification32: {
    elements: [
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PstlAdr", type: "PostalAddress6", minOccurs: 0, maxOccurs: 1 },
      { name: "Id", type: "Party6Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "CtryOfRes", type: "CountryCode", minOccurs: 0, maxOccurs: 1 },
      { name: "CtctDtls", type: "ContactDetails2", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  PostalAddress6: {
    elements: [
      { name: "AdrTp", type: "AddressType2Code", minOccurs: 0, maxOccurs: 1 },
      { name: "Dept", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "SubDept", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "StrtNm", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "BldgNb", type: "Max16Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PstCd", type: "Max16Text", minOccurs: 0, maxOccurs: 1 },
      { name: "TwnNm", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "CtrySubDvsn", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Ctry", type: "CountryCode", minOccurs: 0, maxOccurs: 1 },
      { name: "AdrLine", type: "Max70Text", minOccurs: 0, maxOccurs: 7 },
    ],
  },
  CashAccount16: {
    elements: [
      { name: "Id", type: "AccountIdentification4Choice", minOccurs: 1, maxOccurs: 1 },
      { name: "Tp", type: "CashAccountType2", minOccurs: 0, maxOccurs: 1 },
      { name: "Ccy", type: "ActiveOrHistoricCurrencyCode", minOccurs: 0, maxOccurs: 1 },
      { name: "Nm", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  AccountIdentification4Choice: {
    isChoice: true,
    elements: [
      { name: "IBAN", type: "IBAN2007Identifier", minOccurs: 1, maxOccurs: 1 },
      { name: "Othr", type: "GenericAccountIdentification1", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  GenericAccountIdentification1: {
    elements: [
      { name: "Id", type: "Max34Text", minOccurs: 1, maxOccurs: 1 },
      { name: "SchmeNm", type: "AccountSchemeName1Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "Issr", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  AccountSchemeName1Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ExternalAccountIdentification1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  CashAccountType2: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "CashAccountType4Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  BranchAndFinancialInstitutionIdentification4: {
    elements: [
      { name: "FinInstnId", type: "FinancialInstitutionIdentification7", minOccurs: 1, maxOccurs: 1 },
      { name: "BrnchId", type: "BranchData2", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  FinancialInstitutionIdentification7: {
    elements: [
      { name: "BIC", type: "BICIdentifier", minOccurs: 0, maxOccurs: 1 },
      { name: "ClrSysMmbId", type: "ClearingSystemMemberIdentification2", minOccurs: 0, maxOccurs: 1 },
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PstlAdr", type: "PostalAddress6", minOccurs: 0, maxOccurs: 1 },
      { name: "Othr", type: "GenericFinancialIdentification1", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  BranchData2: {
    elements: [
      { name: "Id", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PstlAdr", type: "PostalAddress6", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  ClearingSystemMemberIdentification2: {
    elements: [
      { name: "ClrSysId", type: "ClearingSystemIdentification2Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "MmbId", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  ClearingSystemIdentification2Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ExternalClearingSystemIdentification1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  GenericFinancialIdentification1: {
    elements: [
      { name: "Id", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
      { name: "SchmeNm", type: "FinancialIdentificationSchemeName1Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "Issr", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  FinancialIdentificationSchemeName1Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ExternalFinancialInstitutionIdentification1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  AmountType3Choice: {
    isChoice: true,
    elements: [
      { name: "InstdAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 1, maxOccurs: 1 },
      { name: "EqvtAmt", type: "EquivalentAmount2", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  ActiveOrHistoricCurrencyAndAmount: {
    simpleContent: {
      base: "ActiveOrHistoricCurrencyAndAmount_SimpleType",
      attributes: [{ name: "Ccy", type: "ActiveOrHistoricCurrencyCode", required: true }],
    },
    elements: [],
  },
  EquivalentAmount2: {
    elements: [
      { name: "Amt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 1, maxOccurs: 1 },
      { name: "CcyOfTrf", type: "ActiveOrHistoricCurrencyCode", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  ExchangeRateInformation1: {
    elements: [
      { name: "XchgRate", type: "BaseOneRate", minOccurs: 0, maxOccurs: 1 },
      { name: "RateTp", type: "ExchangeRateType1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "CtrctId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  ServiceLevel8Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ExternalServiceLevel1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  LocalInstrument2Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ExternalLocalInstrument1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  CategoryPurpose1Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ExternalCategoryPurpose1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  Purpose2Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ExternalPurpose1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  Authorisation1Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "Authorisation1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max128Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  Party6Choice: {
    isChoice: true,
    elements: [
      { name: "OrgId", type: "OrganisationIdentification4", minOccurs: 1, maxOccurs: 1 },
      { name: "PrvtId", type: "PersonIdentification5", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  OrganisationIdentification4: {
    elements: [
      { name: "BICOrBEI", type: "AnyBICIdentifier", minOccurs: 0, maxOccurs: 1 },
      { name: "Othr", type: "GenericOrganisationIdentification1", minOccurs: 0, maxOccurs: -1 },
    ],
  },
  GenericOrganisationIdentification1: {
    elements: [
      { name: "Id", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
      { name: "SchmeNm", type: "OrganisationIdentificationSchemeName1Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "Issr", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  OrganisationIdentificationSchemeName1Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ExternalOrganisationIdentification1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  PersonIdentification5: {
    elements: [
      { name: "DtAndPlcOfBirth", type: "DateAndPlaceOfBirth", minOccurs: 0, maxOccurs: 1 },
      { name: "Othr", type: "GenericPersonIdentification1", minOccurs: 0, maxOccurs: -1 },
    ],
  },
  GenericPersonIdentification1: {
    elements: [
      { name: "Id", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
      { name: "SchmeNm", type: "PersonIdentificationSchemeName1Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "Issr", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  PersonIdentificationSchemeName1Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ExternalPersonIdentification1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  DateAndPlaceOfBirth: {
    elements: [
      { name: "BirthDt", type: "ISODate", minOccurs: 1, maxOccurs: 1 },
      { name: "PrvcOfBirth", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "CityOfBirth", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
      { name: "CtryOfBirth", type: "CountryCode", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  ContactDetails2: {
    elements: [
      { name: "NmPrfx", type: "NamePrefix1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PhneNb", type: "PhoneNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "MobNb", type: "PhoneNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "FaxNb", type: "PhoneNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "EmailAdr", type: "Max2048Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Othr", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  InstructionForCreditorAgent1: {
    elements: [
      { name: "Cd", type: "Instruction3Code", minOccurs: 0, maxOccurs: 1 },
      { name: "InstrInf", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  RemittanceInformation5: {
    elements: [
      { name: "Ustrd", type: "Max140Text", minOccurs: 0, maxOccurs: -1 },
      { name: "Strd", type: "StructuredRemittanceInformation7", minOccurs: 0, maxOccurs: -1 },
    ],
  },
  StructuredRemittanceInformation7: {
    elements: [
      { name: "RfrdDocInf", type: "ReferredDocumentInformation3", minOccurs: 0, maxOccurs: -1 },
      { name: "RfrdDocAmt", type: "RemittanceAmount1", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtrRefInf", type: "CreditorReferenceInformation2", minOccurs: 0, maxOccurs: 1 },
      { name: "Invcr", type: "PartyIdentification32", minOccurs: 0, maxOccurs: 1 },
      { name: "Invcee", type: "PartyIdentification32", minOccurs: 0, maxOccurs: 1 },
      { name: "AddtlRmtInf", type: "Max140Text", minOccurs: 0, maxOccurs: 3 },
    ],
  },
  CreditorReferenceInformation2: {
    elements: [
      { name: "Tp", type: "CreditorReferenceType2", minOccurs: 0, maxOccurs: 1 },
      { name: "Ref", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  CreditorReferenceType2: {
    elements: [
      { name: "CdOrPrtry", type: "CreditorReferenceType1Choice", minOccurs: 1, maxOccurs: 1 },
      { name: "Issr", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  CreditorReferenceType1Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "DocumentType3Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  ReferredDocumentInformation3: {
    elements: [
      { name: "Tp", type: "ReferredDocumentType2", minOccurs: 0, maxOccurs: 1 },
      { name: "Nb", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "RltdDt", type: "ISODate", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  ReferredDocumentType2: {
    elements: [
      { name: "CdOrPrtry", type: "ReferredDocumentType1Choice", minOccurs: 1, maxOccurs: 1 },
      { name: "Issr", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  ReferredDocumentType1Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "DocumentType5Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  RemittanceAmount1: {
    elements: [
      { name: "DuePyblAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
      { name: "DscntApldAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtNoteAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
      { name: "TaxAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
      { name: "AdjstmntAmtAndRsn", type: "DocumentAdjustment1", minOccurs: 0, maxOccurs: -1 },
      { name: "RmtdAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  DocumentAdjustment1: {
    elements: [
      { name: "Amt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 1, maxOccurs: 1 },
      { name: "CdtDbtInd", type: "CreditDebitCode", minOccurs: 0, maxOccurs: 1 },
      { name: "Rsn", type: "Max4Text", minOccurs: 0, maxOccurs: 1 },
      { name: "AddtlInf", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  RemittanceLocation2: {
    elements: [
      { name: "RmtId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "RmtLctnMtd", type: "RemittanceLocationMethod2Code", minOccurs: 0, maxOccurs: 1 },
      { name: "RmtLctnElctrncAdr", type: "Max2048Text", minOccurs: 0, maxOccurs: 1 },
      { name: "RmtLctnPstlAdr", type: "NameAndAddress10", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  NameAndAddress10: {
    elements: [
      { name: "Nm", type: "Max140Text", minOccurs: 1, maxOccurs: 1 },
      { name: "Adr", type: "PostalAddress6", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  RegulatoryReporting3: {
    elements: [
      { name: "DbtCdtRptgInd", type: "RegulatoryReportingType1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "Authrty", type: "RegulatoryAuthority2", minOccurs: 0, maxOccurs: 1 },
      { name: "Dtls", type: "StructuredRegulatoryReporting3", minOccurs: 0, maxOccurs: -1 },
    ],
  },
  RegulatoryAuthority2: {
    elements: [
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Ctry", type: "CountryCode", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  StructuredRegulatoryReporting3: {
    elements: [
      { name: "Tp", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Dt", type: "ISODate", minOccurs: 0, maxOccurs: 1 },
      { name: "Ctry", type: "CountryCode", minOccurs: 0, maxOccurs: 1 },
      { name: "Cd", type: "Max10Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Amt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
      { name: "Inf", type: "Max35Text", minOccurs: 0, maxOccurs: -1 },
    ],
  },
  TaxInformation3: {
    elements: [
      { name: "Cdtr", type: "TaxParty1", minOccurs: 0, maxOccurs: 1 },
      { name: "Dbtr", type: "TaxParty2", minOccurs: 0, maxOccurs: 1 },
      { name: "AdmstnZn", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "RefNb", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Mtd", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "TtlTaxblBaseAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
      { name: "TtlTaxAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
      { name: "Dt", type: "ISODate", minOccurs: 0, maxOccurs: 1 },
      { name: "SeqNb", type: "Number", minOccurs: 0, maxOccurs: 1 },
      { name: "Rcrd", type: "TaxRecord1", minOccurs: 0, maxOccurs: -1 },
    ],
  },
  TaxParty1: {
    elements: [
      { name: "TaxId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "RegnId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "TaxTp", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  TaxParty2: {
    elements: [
      { name: "TaxId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "RegnId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "TaxTp", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Authstn", type: "TaxAuthorisation1", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  TaxAuthorisation1: {
    elements: [
      { name: "Titl", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  TaxRecord1: {
    elements: [
      { name: "Tp", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Ctgy", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "CtgyDtls", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "DbtrSts", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "CertId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "FrmsCd", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Prd", type: "TaxPeriod1", minOccurs: 0, maxOccurs: 1 },
      { name: "TaxAmt", type: "TaxAmount1", minOccurs: 0, maxOccurs: 1 },
      { name: "AddtlInf", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  TaxAmount1: {
    elements: [
      { name: "Rate", type: "PercentageRate", minOccurs: 0, maxOccurs: 1 },
      { name: "TaxblBaseAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
      { name: "TtlAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 0, maxOccurs: 1 },
      { name: "Dtls", type: "TaxRecordDetails1", minOccurs: 0, maxOccurs: -1 },
    ],
  },
  TaxPeriod1: {
    elements: [
      { name: "Yr", type: "ISODate", minOccurs: 0, maxOccurs: 1 },
      { name: "Tp", type: "TaxRecordPeriod1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "FrToDt", type: "DatePeriodDetails", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  TaxRecordDetails1: {
    elements: [
      { name: "Prd", type: "TaxPeriod1", minOccurs: 0, maxOccurs: 1 },
      { name: "Amt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  DatePeriodDetails: {
    elements: [
      { name: "FrDt", type: "ISODate", minOccurs: 1, maxOccurs: 1 },
      { name: "ToDt", type: "ISODate", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  Cheque6: {
    elements: [
      { name: "ChqTp", type: "ChequeType2Code", minOccurs: 0, maxOccurs: 1 },
      { name: "ChqNb", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "ChqFr", type: "NameAndAddress10", minOccurs: 0, maxOccurs: 1 },
      { name: "DlvryMtd", type: "ChequeDeliveryMethod1Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "DlvrTo", type: "NameAndAddress10", minOccurs: 0, maxOccurs: 1 },
      { name: "InstrPrty", type: "Priority2Code", minOccurs: 0, maxOccurs: 1 },
      { name: "ChqMtrtyDt", type: "ISODate", minOccurs: 0, maxOccurs: 1 },
      { name: "FrmsCd", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "MemoFld", type: "Max35Text", minOccurs: 0, maxOccurs: 2 },
      { name: "RgnlClrZone", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PrtLctn", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  ChequeDeliveryMethod1Choice: {
    isChoice: true,
    elements: [
      { name: "Cd", type: "ChequeDelivery1Code", minOccurs: 1, maxOccurs: 1 },
      { name: "Prtry", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Schema definitions — pain.001.001.09 (subset used by RBS generator)
// Reuses most types from 03 with minor differences
// ---------------------------------------------------------------------------

const SIMPLE_TYPES_09: Record<string, SimpleTypeRule> = {
  ...SIMPLE_TYPES_03,
  // pain.001.001.09 uses BICFI instead of BICIdentifier
  BICFIDec2014Identifier: { base: "string", pattern: /^[A-Z]{6}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?$/ },
  Max350Text: { base: "string", minLength: 1, maxLength: 350 },
  Max105Text: { base: "string", minLength: 1, maxLength: 105 },
  Max256Text: { base: "string", minLength: 1, maxLength: 256 },
  Max1025Text: { base: "string", minLength: 1, maxLength: 1025 },
  Max2048Text: { base: "string", minLength: 1, maxLength: 2048 },
  ExternalServiceLevel1Code: { base: "string", minLength: 1, maxLength: 4 },
  ExternalLocalInstrument1Code: { base: "string", minLength: 1, maxLength: 35 },
  ExternalCategoryPurpose1Code: { base: "string", minLength: 1, maxLength: 4 },
  ExternalPurpose1Code: { base: "string", minLength: 1, maxLength: 4 },
  // pain.001.001.09 specific
  Exact4AlphaNumericText: { base: "string", pattern: /^[a-zA-Z0-9]{4}$/ },
  UUIDv4Identifier: { base: "string", pattern: /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i },
};

const COMPLEX_TYPES_09: Record<string, ComplexTypeDef> = {
  Document: {
    elements: [{ name: "CstmrCdtTrfInitn", type: "CustomerCreditTransferInitiationV09", minOccurs: 1, maxOccurs: 1 }],
  },
  CustomerCreditTransferInitiationV09: {
    elements: [
      { name: "GrpHdr", type: "GroupHeader85", minOccurs: 1, maxOccurs: 1 },
      { name: "PmtInf", type: "PaymentInstruction34", minOccurs: 1, maxOccurs: -1 },
    ],
  },
  GroupHeader85: {
    elements: [
      { name: "MsgId", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
      { name: "CreDtTm", type: "ISODateTime", minOccurs: 1, maxOccurs: 1 },
      { name: "Authstn", type: "Authorisation1Choice", minOccurs: 0, maxOccurs: 2 },
      { name: "NbOfTxs", type: "Max15NumericText", minOccurs: 1, maxOccurs: 1 },
      { name: "CtrlSum", type: "DecimalNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "InitgPty", type: "PartyIdentification135", minOccurs: 1, maxOccurs: 1 },
      { name: "FwdgAgt", type: "BranchAndFinancialInstitutionIdentification6", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  PaymentInstruction34: {
    elements: [
      { name: "PmtInfId", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
      { name: "PmtMtd", type: "PaymentMethod3Code", minOccurs: 1, maxOccurs: 1 },
      { name: "BtchBookg", type: "BatchBookingIndicator", minOccurs: 0, maxOccurs: 1 },
      { name: "NbOfTxs", type: "Max15NumericText", minOccurs: 0, maxOccurs: 1 },
      { name: "CtrlSum", type: "DecimalNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "PmtTpInf", type: "PaymentTypeInformation26", minOccurs: 0, maxOccurs: 1 },
      { name: "ReqdExctnDt", type: "DateAndDateTime2Choice", minOccurs: 1, maxOccurs: 1 },
      { name: "PoolgAdjstmntDt", type: "ISODate", minOccurs: 0, maxOccurs: 1 },
      { name: "Dbtr", type: "PartyIdentification135", minOccurs: 1, maxOccurs: 1 },
      { name: "DbtrAcct", type: "CashAccount40", minOccurs: 1, maxOccurs: 1 },
      { name: "DbtrAgt", type: "BranchAndFinancialInstitutionIdentification6", minOccurs: 1, maxOccurs: 1 },
      { name: "DbtrAgtAcct", type: "CashAccount40", minOccurs: 0, maxOccurs: 1 },
      { name: "UltmtDbtr", type: "PartyIdentification135", minOccurs: 0, maxOccurs: 1 },
      { name: "ChrgBr", type: "ChargeBearerType1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "ChrgsAcct", type: "CashAccount40", minOccurs: 0, maxOccurs: 1 },
      { name: "ChrgsAcctAgt", type: "BranchAndFinancialInstitutionIdentification6", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtTrfTxInf", type: "CreditTransferTransaction39", minOccurs: 1, maxOccurs: -1 },
    ],
  },
  CreditTransferTransaction39: {
    elements: [
      { name: "PmtId", type: "PaymentIdentification6", minOccurs: 1, maxOccurs: 1 },
      { name: "PmtTpInf", type: "PaymentTypeInformation26", minOccurs: 0, maxOccurs: 1 },
      { name: "Amt", type: "AmountType4Choice", minOccurs: 1, maxOccurs: 1 },
      { name: "XchgRateInf", type: "ExchangeRate1", minOccurs: 0, maxOccurs: 1 },
      { name: "ChrgBr", type: "ChargeBearerType1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "ChqInstr", type: "_skip", minOccurs: 0, maxOccurs: 1 },
      { name: "UltmtDbtr", type: "PartyIdentification135", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt1", type: "BranchAndFinancialInstitutionIdentification6", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt1Acct", type: "CashAccount40", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt2", type: "BranchAndFinancialInstitutionIdentification6", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt2Acct", type: "CashAccount40", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt3", type: "BranchAndFinancialInstitutionIdentification6", minOccurs: 0, maxOccurs: 1 },
      { name: "IntrmyAgt3Acct", type: "CashAccount40", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtrAgt", type: "BranchAndFinancialInstitutionIdentification6", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtrAgtAcct", type: "CashAccount40", minOccurs: 0, maxOccurs: 1 },
      { name: "Cdtr", type: "PartyIdentification135", minOccurs: 0, maxOccurs: 1 },
      { name: "CdtrAcct", type: "CashAccount40", minOccurs: 0, maxOccurs: 1 },
      { name: "UltmtCdtr", type: "PartyIdentification135", minOccurs: 0, maxOccurs: 1 },
      { name: "InstrForCdtrAgt", type: "InstructionForCreditorAgent3", minOccurs: 0, maxOccurs: -1 },
      { name: "InstrForDbtrAgt", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Purp", type: "Purpose2Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "RgltryRptg", type: "RegulatoryReporting3", minOccurs: 0, maxOccurs: 10 },
      { name: "Tax", type: "TaxInformation3", minOccurs: 0, maxOccurs: 1 },
      { name: "RltdRmtInf", type: "RemittanceLocation2", minOccurs: 0, maxOccurs: 10 },
      { name: "RmtInf", type: "RemittanceInformation16", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  PaymentIdentification6: {
    elements: [
      { name: "InstrId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "EndToEndId", type: "Max35Text", minOccurs: 1, maxOccurs: 1 },
      { name: "UETR", type: "UUIDv4Identifier", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  PaymentTypeInformation26: {
    elements: [
      { name: "InstrPrty", type: "Priority2Code", minOccurs: 0, maxOccurs: 1 },
      { name: "SvcLvl", type: "ServiceLevel8Choice", minOccurs: 0, maxOccurs: -1 },
      { name: "LclInstrm", type: "LocalInstrument2Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "CtgyPurp", type: "CategoryPurpose1Choice", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  DateAndDateTime2Choice: {
    isChoice: true,
    elements: [
      { name: "Dt", type: "ISODate", minOccurs: 1, maxOccurs: 1 },
      { name: "DtTm", type: "ISODateTime", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  PartyIdentification135: {
    elements: [
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PstlAdr", type: "PostalAddress24", minOccurs: 0, maxOccurs: 1 },
      { name: "Id", type: "Party38Choice", minOccurs: 0, maxOccurs: 1 },
      { name: "CtryOfRes", type: "CountryCode", minOccurs: 0, maxOccurs: 1 },
      { name: "CtctDtls", type: "Contact4", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  PostalAddress24: {
    elements: [
      { name: "AdrTp", type: "_skip", minOccurs: 0, maxOccurs: 1 },
      { name: "Dept", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "SubDept", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "StrtNm", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "BldgNb", type: "Max16Text", minOccurs: 0, maxOccurs: 1 },
      { name: "BldgNm", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Flr", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PstBx", type: "Max16Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Room", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PstCd", type: "Max16Text", minOccurs: 0, maxOccurs: 1 },
      { name: "TwnNm", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "TwnLctnNm", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "DstrctNm", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "CtrySubDvsn", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Ctry", type: "CountryCode", minOccurs: 0, maxOccurs: 1 },
      { name: "AdrLine", type: "Max70Text", minOccurs: 0, maxOccurs: 7 },
    ],
  },
  Party38Choice: {
    isChoice: true,
    elements: [
      { name: "OrgId", type: "OrganisationIdentification4", minOccurs: 1, maxOccurs: 1 },
      { name: "PrvtId", type: "PersonIdentification5", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  Contact4: {
    elements: [
      { name: "NmPrfx", type: "NamePrefix1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PhneNb", type: "PhoneNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "MobNb", type: "PhoneNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "FaxNb", type: "PhoneNumber", minOccurs: 0, maxOccurs: 1 },
      { name: "EmailAdr", type: "Max2048Text", minOccurs: 0, maxOccurs: 1 },
      { name: "EmailPurp", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "JobTitl", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Rspnsblty", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Dept", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Othr", type: "_skip", minOccurs: 0, maxOccurs: -1 },
    ],
  },
  CashAccount40: {
    elements: [
      { name: "Id", type: "AccountIdentification4Choice", minOccurs: 1, maxOccurs: 1 },
      { name: "Tp", type: "CashAccountType2", minOccurs: 0, maxOccurs: 1 },
      { name: "Ccy", type: "ActiveOrHistoricCurrencyCode", minOccurs: 0, maxOccurs: 1 },
      { name: "Nm", type: "Max70Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Prxy", type: "_skip", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  BranchAndFinancialInstitutionIdentification6: {
    elements: [
      { name: "FinInstnId", type: "FinancialInstitutionIdentification18", minOccurs: 1, maxOccurs: 1 },
      { name: "BrnchId", type: "BranchData3", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  FinancialInstitutionIdentification18: {
    elements: [
      { name: "BICFI", type: "BICFIDec2014Identifier", minOccurs: 0, maxOccurs: 1 },
      { name: "ClrSysMmbId", type: "ClearingSystemMemberIdentification2", minOccurs: 0, maxOccurs: 1 },
      { name: "LEI", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PstlAdr", type: "PostalAddress24", minOccurs: 0, maxOccurs: 1 },
      { name: "Othr", type: "GenericFinancialIdentification1", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  BranchData3: {
    elements: [
      { name: "Id", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "LEI", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
      { name: "Nm", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
      { name: "PstlAdr", type: "PostalAddress24", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  AmountType4Choice: {
    isChoice: true,
    elements: [
      { name: "InstdAmt", type: "ActiveOrHistoricCurrencyAndAmount", minOccurs: 1, maxOccurs: 1 },
      { name: "EqvtAmt", type: "EquivalentAmount2", minOccurs: 1, maxOccurs: 1 },
    ],
  },
  ExchangeRate1: {
    elements: [
      { name: "UnitCcy", type: "ActiveOrHistoricCurrencyCode", minOccurs: 0, maxOccurs: 1 },
      { name: "XchgRate", type: "BaseOneRate", minOccurs: 0, maxOccurs: 1 },
      { name: "RateTp", type: "ExchangeRateType1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "CtrctId", type: "Max35Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  InstructionForCreditorAgent3: {
    elements: [
      { name: "Cd", type: "ExternalCreditorAgentInstruction1Code", minOccurs: 0, maxOccurs: 1 },
      { name: "InstrInf", type: "Max140Text", minOccurs: 0, maxOccurs: 1 },
    ],
  },
  RemittanceInformation16: {
    elements: [
      { name: "Ustrd", type: "Max140Text", minOccurs: 0, maxOccurs: -1 },
      { name: "Strd", type: "_skip", minOccurs: 0, maxOccurs: -1 },
    ],
  },
  // Reuse from 03 where identical
  ...Object.fromEntries(
    [
      "AccountIdentification4Choice", "GenericAccountIdentification1",
      "AccountSchemeName1Choice", "CashAccountType2",
      "ClearingSystemMemberIdentification2", "ClearingSystemIdentification2Choice",
      "GenericFinancialIdentification1", "FinancialIdentificationSchemeName1Choice",
      "ActiveOrHistoricCurrencyAndAmount", "EquivalentAmount2",
      "ServiceLevel8Choice", "LocalInstrument2Choice",
      "CategoryPurpose1Choice", "Purpose2Choice",
      "Authorisation1Choice", "Party6Choice",
      "OrganisationIdentification4", "GenericOrganisationIdentification1",
      "OrganisationIdentificationSchemeName1Choice",
      "PersonIdentification5", "GenericPersonIdentification1",
      "PersonIdentificationSchemeName1Choice", "DateAndPlaceOfBirth",
      "RemittanceLocation2", "NameAndAddress10",
      "RegulatoryReporting3", "RegulatoryAuthority2", "StructuredRegulatoryReporting3",
      "TaxInformation3", "TaxParty1", "TaxParty2", "TaxAuthorisation1",
      "TaxRecord1", "TaxAmount1", "TaxPeriod1", "TaxRecordDetails1",
      "DatePeriodDetails", "DocumentAdjustment1",
    ].map(k => [k, COMPLEX_TYPES_03[k]])
  ),
};

// Add the ExternalCreditorAgentInstruction1Code simple type for pain.001.001.09
SIMPLE_TYPES_09["ExternalCreditorAgentInstruction1Code"] = { base: "string", minLength: 1, maxLength: 4 };

// ---------------------------------------------------------------------------
// Namespaces
// ---------------------------------------------------------------------------

const NAMESPACES: Record<string, string> = {
  "pain.001.001.03": "urn:iso:std:iso:20022:tech:xsd:pain.001.001.03",
  "pain.001.001.09": "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09",
};

// ---------------------------------------------------------------------------
// Validation engine
// ---------------------------------------------------------------------------

function getChildElements(parent: Element, ns: string): Element[] {
  const children: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      children.push(node as Element);
    }
  }
  return children;
}

function getTextContent(el: Element): string {
  let text = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      text += node.textContent || "";
    }
  }
  return text;
}

// Data-quality type names whose pattern mismatches should be warnings, not errors.
// These are valid XML but may indicate non-standard data from the source Excel.
const DATA_QUALITY_TYPES = new Set([
  "BICIdentifier",
  "AnyBICIdentifier",
  "IBAN2007Identifier",
  "BICFIDec2014Identifier",
  "AnyBICDec2014Identifier",
]);

function validateSimpleValue(
  value: string,
  typeName: string,
  simpleTypes: Record<string, SimpleTypeRule>,
  path: string,
  issues: SchemaValidationIssue[],
): void {
  const rule = simpleTypes[typeName];
  if (!rule) return; // Unknown type — skip

  if (rule.enumerations && !rule.enumerations.includes(value)) {
    issues.push({
      severity: "error",
      path,
      message: `Value "${value}" is not in allowed values: [${rule.enumerations.join(", ")}]`,
    });
    return;
  }

  if (rule.pattern && !rule.pattern.test(value)) {
    // BIC / IBAN pattern mismatches are data-quality issues, not structural errors.
    // The XML is well-formed; the bank may accept or reject the value.
    const severity = DATA_QUALITY_TYPES.has(typeName) ? "warning" : "error";
    issues.push({
      severity,
      path,
      message: `Value "${value}" does not match pattern ${rule.pattern}`,
    });
    if (severity === "error") return;
  }

  if (rule.minLength !== undefined && value.length < rule.minLength) {
    issues.push({
      severity: "error",
      path,
      message: `Value length ${value.length} is less than minimum ${rule.minLength}`,
    });
  }

  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    issues.push({
      severity: "error",
      path,
      message: `Value length ${value.length} exceeds maximum ${rule.maxLength}`,
    });
  }

  if (rule.base === "decimal" || rule.base === "xs:decimal") {
    const num = parseFloat(value);
    if (isNaN(num)) {
      issues.push({ severity: "error", path, message: `Value "${value}" is not a valid decimal number` });
      return;
    }
    if (rule.minInclusive !== undefined && num < rule.minInclusive) {
      issues.push({ severity: "error", path, message: `Value ${num} is less than minimum ${rule.minInclusive}` });
    }
    if (rule.fractionDigits !== undefined) {
      const parts = value.split(".");
      if (parts.length === 2 && parts[1].length > rule.fractionDigits) {
        issues.push({
          severity: "warning",
          path,
          message: `Value has ${parts[1].length} fraction digits, maximum is ${rule.fractionDigits}`,
        });
      }
    }
  }

  if (rule.base === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      issues.push({ severity: "error", path, message: `Value "${value}" is not a valid ISO date (YYYY-MM-DD)` });
    }
  }

  if (rule.base === "dateTime") {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      issues.push({ severity: "error", path, message: `Value "${value}" is not a valid ISO dateTime` });
    }
  }

  if (rule.base === "boolean") {
    if (!["true", "false", "1", "0"].includes(value)) {
      issues.push({ severity: "error", path, message: `Value "${value}" is not a valid boolean` });
    }
  }
}

function validateElement(
  el: Element,
  typeName: string,
  complexTypes: Record<string, ComplexTypeDef>,
  simpleTypes: Record<string, SimpleTypeRule>,
  ns: string,
  path: string,
  issues: SchemaValidationIssue[],
  depth: number = 0,
): void {
  // Guard against infinite recursion
  if (depth > 50) {
    issues.push({ severity: "warning", path, message: "Maximum validation depth exceeded" });
    return;
  }

  // Skip types marked as _skip (complex types not fully modeled)
  if (typeName === "_skip") return;

  // Check if it's a simple type
  if (simpleTypes[typeName]) {
    const text = getTextContent(el).trim();
    if (text) {
      validateSimpleValue(text, typeName, simpleTypes, path, issues);
    }
    return;
  }

  // Check if it's a complex type
  const complexDef = complexTypes[typeName];
  if (!complexDef) {
    // Unknown type — skip silently
    return;
  }

  // Handle simpleContent types (e.g., ActiveOrHistoricCurrencyAndAmount)
  if (complexDef.simpleContent) {
    const text = getTextContent(el).trim();
    if (text) {
      validateSimpleValue(text, complexDef.simpleContent.base, simpleTypes, path, issues);
    }
    // Validate required attributes
    for (const attr of complexDef.simpleContent.attributes) {
      const attrVal = el.getAttribute(attr.name);
      if (attr.required && !attrVal) {
        issues.push({ severity: "error", path, message: `Missing required attribute "${attr.name}"` });
      } else if (attrVal) {
        validateSimpleValue(attrVal, attr.type, simpleTypes, `${path}/@${attr.name}`, issues);
      }
    }
    return;
  }

  const children = getChildElements(el, ns);

  if (complexDef.isChoice) {
    // Exactly one of the choice elements should be present
    const matchingChildren = children.filter(c =>
      complexDef.elements.some(e => e.name === c.localName)
    );
    if (matchingChildren.length === 0) {
      const expected = complexDef.elements.map(e => e.name).join(" | ");
      issues.push({ severity: "error", path, message: `Choice element requires one of: ${expected}` });
    } else if (matchingChildren.length > 1) {
      issues.push({ severity: "error", path, message: `Choice element should have exactly one child, found ${matchingChildren.length}` });
    }
    // Validate the chosen element
    for (const child of matchingChildren) {
      const def = complexDef.elements.find(e => e.name === child.localName);
      if (def) {
        validateElement(child, def.type, complexTypes, simpleTypes, ns, `${path}/${child.localName}`, issues, depth + 1);
      }
    }
    return;
  }

  // Sequence validation — check required elements and cardinality
  const childNameCounts = new Map<string, number>();
  for (const child of children) {
    const name = child.localName;
    childNameCounts.set(name, (childNameCounts.get(name) || 0) + 1);
  }

  // Check for required elements
  for (const elemDef of complexDef.elements) {
    const count = childNameCounts.get(elemDef.name) || 0;
    if (elemDef.minOccurs > 0 && count < elemDef.minOccurs) {
      issues.push({
        severity: "error",
        path,
        message: `Missing required element "${elemDef.name}" (expected at least ${elemDef.minOccurs}, found ${count})`,
      });
    }
    if (elemDef.maxOccurs !== -1 && count > elemDef.maxOccurs) {
      issues.push({
        severity: "error",
        path,
        message: `Too many "${elemDef.name}" elements (expected at most ${elemDef.maxOccurs}, found ${count})`,
      });
    }
  }

  // Check for unexpected elements
  const knownNames = new Set(complexDef.elements.map(e => e.name));
  for (const child of children) {
    if (!knownNames.has(child.localName)) {
      issues.push({
        severity: "warning",
        path,
        message: `Unexpected element "${child.localName}" not defined in schema`,
      });
    }
  }

  // Check element ordering (sequence order must be maintained)
  let lastDefIndex = -1;
  for (const child of children) {
    const defIndex = complexDef.elements.findIndex(e => e.name === child.localName);
    if (defIndex !== -1) {
      if (defIndex < lastDefIndex) {
        const expectedAfter = complexDef.elements[lastDefIndex].name;
        issues.push({
          severity: "error",
          path,
          message: `Element "${child.localName}" appears out of order (should come before "${expectedAfter}")`,
        });
      }
      // Allow same element repeated (for maxOccurs > 1)
      if (defIndex >= lastDefIndex) {
        lastDefIndex = defIndex;
      }
    }
  }

  // Recursively validate child elements
  for (const child of children) {
    const def = complexDef.elements.find(e => e.name === child.localName);
    if (def) {
      validateElement(child, def.type, complexTypes, simpleTypes, ns, `${path}/${child.localName}`, issues, depth + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Envelope extraction for RBS (pain.001.001.09)
// ---------------------------------------------------------------------------

function extractDocumentFromEnvelope(xmlDoc: Document, ns: string): Element | null {
  // Check if root is Envelope
  const root = xmlDoc.documentElement;
  if (root.localName === "Envelope") {
    // Find the Document element within the envelope
    const allElements = root.getElementsByTagNameNS(ns, "Document");
    if (allElements.length > 0) {
      return allElements[0];
    }
    // Try without namespace
    const allElements2 = root.getElementsByTagName("Document");
    if (allElements2.length > 0) {
      return allElements2[0];
    }
    return null;
  }
  return root;
}

// ---------------------------------------------------------------------------
// Business rule cross-checks
// ---------------------------------------------------------------------------

function validateBusinessRules(
  xmlDoc: Document,
  docElement: Element,
  ns: string,
  issues: SchemaValidationIssue[],
): void {
  // Check NbOfTxs in GrpHdr matches actual count
  const grpHdr = docElement.getElementsByTagNameNS(ns, "GrpHdr")[0]
    || docElement.getElementsByTagName("GrpHdr")[0];
  if (grpHdr) {
    const nbOfTxsEl = grpHdr.getElementsByTagNameNS(ns, "NbOfTxs")[0]
      || grpHdr.getElementsByTagName("NbOfTxs")[0];
    if (nbOfTxsEl) {
      const declaredCount = parseInt(nbOfTxsEl.textContent || "0", 10);
      // Count actual CdtTrfTxInf elements
      const txElements = docElement.getElementsByTagNameNS(ns, "CdtTrfTxInf").length
        || docElement.getElementsByTagName("CdtTrfTxInf").length;
      if (txElements > 0 && declaredCount !== txElements) {
        issues.push({
          severity: "error",
          path: "/Document/CstmrCdtTrfInitn/GrpHdr/NbOfTxs",
          message: `NbOfTxs declares ${declaredCount} transactions but found ${txElements} CdtTrfTxInf elements`,
        });
      }
    }

    // Check CtrlSum matches sum of amounts
    const ctrlSumEl = grpHdr.getElementsByTagNameNS(ns, "CtrlSum")[0]
      || grpHdr.getElementsByTagName("CtrlSum")[0];
    if (ctrlSumEl) {
      const declaredSum = parseFloat(ctrlSumEl.textContent || "0");
      let actualSum = 0;
      const instdAmts = docElement.getElementsByTagNameNS(ns, "InstdAmt");
      const instdAmtsFallback = instdAmts.length > 0 ? instdAmts : docElement.getElementsByTagName("InstdAmt");
      for (let i = 0; i < instdAmtsFallback.length; i++) {
        actualSum += parseFloat(instdAmtsFallback[i].textContent || "0");
      }
      // Allow small floating point tolerance
      if (actualSum > 0 && Math.abs(declaredSum - actualSum) > 0.01) {
        issues.push({
          severity: "error",
          path: "/Document/CstmrCdtTrfInitn/GrpHdr/CtrlSum",
          message: `CtrlSum declares ${declaredSum.toFixed(2)} but sum of InstdAmt is ${actualSum.toFixed(2)}`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateXmlAgainstSchema(
  xmlContent: string,
  painVersion: string,
  paymentType?: string,
): SchemaValidationResult {
  const issues: SchemaValidationIssue[] = [];

  // Step 1: Parse XML
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

  // Check for parse errors
  const parseError = xmlDoc.getElementsByTagName("parsererror");
  if (parseError.length > 0) {
    return {
      valid: false,
      issues: [{
        severity: "error",
        path: "/",
        message: `XML parse error: ${parseError[0].textContent}`,
      }],
    };
  }

  // Step 2: Determine schema
  const ns = NAMESPACES[painVersion];
  if (!ns) {
    issues.push({
      severity: "warning",
      path: "/",
      message: `No schema available for ${painVersion}`,
    });
    return { valid: true, issues };
  }

  // Step 3: Select schema definitions
  const simpleTypes = painVersion === "pain.001.001.09" ? SIMPLE_TYPES_09 : SIMPLE_TYPES_03;
  const complexTypes = painVersion === "pain.001.001.09" ? COMPLEX_TYPES_09 : COMPLEX_TYPES_03;

  // Step 4: Get Document element (handle RBS envelope)
  let docElement: Element | null;
  if (painVersion === "pain.001.001.09") {
    docElement = extractDocumentFromEnvelope(xmlDoc, ns);
    if (!docElement) {
      return {
        valid: false,
        issues: [{
          severity: "error",
          path: "/",
          message: "Could not find Document element in XML (checked both direct root and Envelope wrapper)",
        }],
      };
    }
  } else {
    docElement = xmlDoc.documentElement;
  }

  // Step 5: Validate root element
  if (docElement.localName !== "Document") {
    issues.push({
      severity: "error",
      path: "/",
      message: `Root element should be "Document", found "${docElement.localName}"`,
    });
    return { valid: false, issues };
  }

  // Check namespace
  const actualNs = docElement.namespaceURI;
  if (actualNs && actualNs !== ns) {
    issues.push({
      severity: "error",
      path: "/Document",
      message: `Namespace mismatch: expected "${ns}", found "${actualNs}"`,
    });
  }

  // Step 6: Recursive structural validation
  validateElement(docElement, "Document", complexTypes, simpleTypes, ns, "/Document", issues, 0);

  // Step 7: Business rule cross-checks
  validateBusinessRules(xmlDoc, docElement, ns, issues);

  // Step 8: Add success info if no errors
  const hasErrors = issues.some(i => i.severity === "error");
  if (!hasErrors) {
    issues.push({
      severity: "info",
      path: "/",
      message: `XML validates successfully against ${painVersion} schema`,
    });
  }

  return {
    valid: !hasErrors,
    issues,
  };
}
