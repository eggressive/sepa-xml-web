/**
 * RBS/NatWest XML Generator — pain.001.001.09 with SWIFT envelope
 * Ported from C# RbsGenerator.cs
 */
import type { BankProfile, GeneratedFile, PaymentBatch, PaymentTransaction, RoutedPayments } from "../models";
import {
  createIndividualBatches,
  formatAmount,
  formatDate,
  formatDateTime,
  formatTimestamp,
  groupByDebtorAndDate,
} from "../models";
import { extractUkSortCode, xmlEscape } from "../sanitizer";

const ENV_NS = "urn:swift:xsd:envelope";
const APPHDR_NS = "urn:iso:std:iso:20022:tech:xsd:head.001.001.02";
const PAIN_NS = "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09";
const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

export function generateRbs(
  routedPayments: RoutedPayments[],
  profile: BankProfile
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const timestamp = new Date();

  for (const group of routedPayments) {
    const batches = profile.useIndividualProcessing
      ? createIndividualBatches(group.transactions)
      : groupByDebtorAndDate(group.transactions);

    const msgId = generateMessageId(timestamp);
    const creationDateTime = formatDateTime(timestamp);
    const totalAmount = group.transactions.reduce((sum, t) => sum + t.amount, 0);

    const xml = buildEnvelope(
      group.paymentType,
      msgId,
      creationDateTime,
      group.transactions.length,
      totalAmount,
      batches,
      group.currencyCode,
      profile
    );

    const fileName = `${group.filePrefix}_${formatTimestamp(timestamp)}.xml`;

    files.push({
      fileName,
      xmlContent: xml,
      paymentType: group.paymentType,
      currency: group.currencyCode,
      transactionCount: group.transactions.length,
      totalAmount,
    });
  }

  return files;
}

function buildEnvelope(
  paymentType: string,
  msgId: string,
  creationDateTime: string,
  totalCount: number,
  totalAmount: number,
  batches: PaymentBatch[],
  currencyCode: string,
  profile: BankProfile
): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push(`<Envelope xmlns="${ENV_NS}" xmlns:xsi="${XSI_NS}">`);

  // AppHdr
  lines.push(...indent(buildAppHdr(msgId, creationDateTime, profile), 1));

  // Document
  lines.push(`\t<Document xmlns="${PAIN_NS}">`);
  lines.push("\t\t<CstmrCdtTrfInitn>");

  // Group Header
  lines.push(...indent(buildGroupHeader(msgId, creationDateTime, totalCount, totalAmount, profile), 3));

  // Payment Info blocks
  for (const batch of batches) {
    lines.push(...indent(buildPaymentInfo(paymentType, batch, currencyCode, profile), 3));
  }

  lines.push("\t\t</CstmrCdtTrfInitn>");
  lines.push("\t</Document>");
  lines.push("</Envelope>");

  return lines.join("\n");
}

function buildAppHdr(msgId: string, creationDateTime: string, profile: BankProfile): string[] {
  const tzOffset = getTimezoneOffset();

  return [
    `<AppHdr xmlns="${APPHDR_NS}">`,
    "\t<Fr>",
    "\t\t<OrgId>",
    "\t\t\t<Id>",
    "\t\t\t\t<OrgId>",
    "\t\t\t\t\t<Othr>",
    `\t\t\t\t\t\t<Id>${xmlEscape(profile.senderId ?? "")}</Id>`,
    "\t\t\t\t\t</Othr>",
    "\t\t\t\t</OrgId>",
    "\t\t\t</Id>",
    "\t\t</OrgId>",
    "\t</Fr>",
    "\t<To>",
    "\t\t<FIId>",
    "\t\t\t<FinInstnId>",
    `\t\t\t\t<BICFI>${profile.defaultDebtorBic}</BICFI>`,
    "\t\t\t</FinInstnId>",
    "\t\t</FIId>",
    "\t</To>",
    `\t<BizMsgIdr>${xmlEscape(msgId)}</BizMsgIdr>`,
    "\t<MsgDefIdr>pain.001.001.09</MsgDefIdr>",
    "\t<BizSvc>swift.cbprplus.02</BizSvc>",
    `\t<CreDt>${creationDateTime}${tzOffset}</CreDt>`,
    "</AppHdr>",
  ];
}

function buildGroupHeader(
  msgId: string,
  creationDateTime: string,
  totalCount: number,
  totalAmount: number,
  profile: BankProfile
): string[] {
  return [
    "<GrpHdr>",
    `\t<MsgId>${xmlEscape(msgId)}</MsgId>`,
    `\t<CreDtTm>${creationDateTime}</CreDtTm>`,
    `\t<NbOfTxs>${totalCount}</NbOfTxs>`,
    `\t<CtrlSum>${formatAmount(totalAmount)}</CtrlSum>`,
    "\t<InitgPty>",
    `\t\t<Nm>${xmlEscape(profile.initiatingPartyName)}</Nm>`,
    "\t\t<Id>",
    "\t\t\t<OrgId>",
    "\t\t\t\t<Othr>",
    `\t\t\t\t\t<Id>${xmlEscape(profile.senderId ?? "")}</Id>`,
    "\t\t\t\t</Othr>",
    "\t\t\t</OrgId>",
    "\t\t</Id>",
    "\t</InitgPty>",
    "</GrpHdr>",
  ];
}

function buildPaymentInfo(
  paymentType: string,
  batch: PaymentBatch,
  currencyCode: string,
  profile: BankProfile
): string[] {
  const batchAmount = batch.totalAmount;
  const isBatchBooking = paymentType === "FP" || paymentType === "SEPA";

  const lines: string[] = [];
  lines.push("<PmtInf>");
  lines.push(`\t<PmtInfId>${xmlEscape(batch.batchId)}</PmtInfId>`);
  lines.push("\t<PmtMtd>TRF</PmtMtd>");
  lines.push(`\t<BtchBookg>${isBatchBooking ? "true" : "false"}</BtchBookg>`);
  lines.push(`\t<NbOfTxs>${batch.transactionCount}</NbOfTxs>`);
  lines.push(`\t<CtrlSum>${formatAmount(batchAmount)}</CtrlSum>`);

  // Payment Type Information
  lines.push("\t<PmtTpInf>");
  if (paymentType === "CHAPS") {
    lines.push("\t\t<InstrPrty>HIGH</InstrPrty>");
    lines.push("\t\t<SvcLvl>");
    lines.push("\t\t\t<Cd>URGP</Cd>");
    lines.push("\t\t</SvcLvl>");
  } else if (paymentType === "FP") {
    lines.push("\t\t<SvcLvl>");
    lines.push("\t\t\t<Cd>NURG</Cd>");
    lines.push("\t\t</SvcLvl>");
  } else if (paymentType === "SEPA") {
    lines.push("\t\t<SvcLvl>");
    lines.push("\t\t\t<Cd>SEPA</Cd>");
    lines.push("\t\t</SvcLvl>");
  } else {
    // INTL
    lines.push("\t\t<SvcLvl>");
    lines.push("\t\t\t<Cd>NURG</Cd>");
    lines.push("\t\t</SvcLvl>");
  }
  lines.push("\t</PmtTpInf>");

  // Requested Execution Date (pain.001.001.09 uses nested Dt element)
  lines.push("\t<ReqdExctnDt>");
  lines.push(`\t\t<Dt>${formatDate(batch.executionDate)}</Dt>`);
  lines.push("\t</ReqdExctnDt>");

  // Debtor
  lines.push("\t<Dbtr>");
  lines.push(`\t\t<Nm>${xmlEscape(batch.debtorName)}</Nm>`);
  lines.push("\t</Dbtr>");

  // Debtor Account with currency
  lines.push("\t<DbtrAcct>");
  lines.push("\t\t<Id>");
  lines.push(`\t\t\t<IBAN>${batch.debtorIban}</IBAN>`);
  lines.push("\t\t</Id>");
  lines.push(`\t\t<Ccy>${currencyCode}</Ccy>`);
  lines.push("\t</DbtrAcct>");

  // Debtor Agent
  lines.push("\t<DbtrAgt>");
  lines.push("\t\t<FinInstnId>");
  lines.push(`\t\t\t<BICFI>${profile.defaultDebtorBic}</BICFI>`);
  lines.push("\t\t</FinInstnId>");
  lines.push("\t</DbtrAgt>");

  // Charge Bearer at PmtInf level for CHAPS and International
  if (paymentType === "CHAPS" || paymentType === "INTL") {
    lines.push("\t<ChrgBr>SHAR</ChrgBr>");
  }

  // Transactions
  for (const trans of batch.transactions) {
    lines.push(...indentTab(buildTransaction(paymentType, trans), 1));
  }

  lines.push("</PmtInf>");
  return lines;
}

function buildTransaction(paymentType: string, trans: PaymentTransaction): string[] {
  const instrId = generateMessageId(new Date());
  const endToEndId =
    trans.description && trans.description.length > 0
      ? trans.description.substring(0, Math.min(trans.description.length, 35))
      : instrId;

  const lines: string[] = [];
  lines.push("<CdtTrfTxInf>");
  lines.push("\t<PmtId>");
  lines.push(`\t\t<InstrId>${xmlEscape(instrId)}</InstrId>`);
  lines.push(`\t\t<EndToEndId>${xmlEscape(endToEndId)}</EndToEndId>`);

  // UETR for CHAPS
  if (paymentType === "CHAPS") {
    lines.push(`\t\t<UETR>${generateUUID()}</UETR>`);
  }

  lines.push("\t</PmtId>");
  lines.push("\t<Amt>");
  lines.push(`\t\t<InstdAmt Ccy="${trans.currencyCode}">${formatAmount(trans.amount)}</InstdAmt>`);
  lines.push("\t</Amt>");

  // Charge Bearer at transaction level for FP and SEPA
  if (paymentType === "FP") {
    lines.push("\t<ChrgBr>SHAR</ChrgBr>");
  } else if (paymentType === "SEPA") {
    lines.push("\t<ChrgBr>SLEV</ChrgBr>");
  }

  // Creditor Agent
  lines.push(...indentTab(buildCreditorAgent(paymentType, trans), 1));

  // Creditor
  lines.push("\t<Cdtr>");
  lines.push(`\t\t<Nm>${xmlEscape(trans.creditorName)}</Nm>`);
  lines.push("\t</Cdtr>");

  // Creditor Account
  lines.push("\t<CdtrAcct>");
  lines.push("\t\t<Id>");
  if (trans.creditorIban) {
    lines.push(`\t\t\t<IBAN>${trans.creditorIban}</IBAN>`);
  } else if (trans.creditorAccountNumber) {
    lines.push("\t\t\t<Othr>");
    lines.push(`\t\t\t\t<Id>${trans.creditorAccountNumber}</Id>`);
    lines.push("\t\t\t</Othr>");
  }
  lines.push("\t\t</Id>");
  lines.push("\t</CdtrAcct>");

  // Remittance Information
  if (trans.description) {
    lines.push("\t<RmtInf>");
    lines.push(`\t\t<Ustrd>${xmlEscape(trans.description)}</Ustrd>`);
    lines.push("\t</RmtInf>");
  }

  lines.push("</CdtTrfTxInf>");
  return lines;
}

function buildCreditorAgent(paymentType: string, trans: PaymentTransaction): string[] {
  const lines: string[] = [];
  lines.push("<CdtrAgt>");
  lines.push("\t<FinInstnId>");

  if (paymentType === "CHAPS" || paymentType === "FP") {
    // GBP uses clearing system (GBDSC) with sort code
    const sortCode = extractUkSortCode(trans) ?? "000000";
    lines.push("\t\t<ClrSysMmbId>");
    lines.push("\t\t\t<ClrSysId>");
    lines.push("\t\t\t\t<Cd>GBDSC</Cd>");
    lines.push("\t\t\t</ClrSysId>");
    lines.push(`\t\t\t<MmbId>${sortCode}</MmbId>`);
    lines.push("\t\t</ClrSysMmbId>");
  } else {
    // SEPA / INTL — use BICFI
    lines.push(`\t\t<BICFI>${trans.creditorBic}</BICFI>`);
  }

  lines.push("\t</FinInstnId>");
  lines.push("</CdtrAgt>");
  return lines;
}

function generateMessageId(timestamp: Date): string {
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `MSG${formatTimestamp(timestamp).replace("_", "")}${rand}`;
}

function getTimezoneOffset(): string {
  const offset = -new Date().getTimezoneOffset(); // minutes from UTC
  const sign = offset >= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offset) / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function generateUUID(): string {
  // Simple UUID v4 generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function indent(lines: string[], level: number): string[] {
  const prefix = "\t".repeat(level);
  return lines.map((l) => prefix + l);
}

function indentTab(lines: string[], level: number): string[] {
  const prefix = "\t".repeat(level);
  return lines.map((l) => prefix + l);
}
