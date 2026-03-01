/**
 * ABN AMRO XML Generator — pain.001.001.03
 * Ported from C# AbnAmroGenerator.cs
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
import { xmlEscape } from "../sanitizer";

const PAIN_NS = "urn:iso:std:iso:20022:tech:xsd:pain.001.001.03";
const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

export function generateAbnAmro(
  routedPayments: RoutedPayments[],
  profile: BankProfile
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const timestamp = new Date();
  let fileSeq = 0;

  for (const group of routedPayments) {
    fileSeq++;
    const isSepa = group.paymentType.toUpperCase() === "SEPA";

    const batches = profile.useIndividualProcessing
      ? createIndividualBatches(group.transactions)
      : groupByDebtorAndDate(group.transactions);

    const msgId = `MSG${formatTimestamp(timestamp).replace("_", "")}${group.currencyCode}${fileSeq}`;
    const creationDateTime = formatDateTime(timestamp);
    const totalAmount = group.transactions.reduce((sum, t) => sum + t.amount, 0);

    const xml = buildDocument(
      msgId,
      creationDateTime,
      group.transactions.length,
      totalAmount,
      batches,
      isSepa,
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

function buildDocument(
  msgId: string,
  creationDateTime: string,
  totalCount: number,
  totalAmount: number,
  batches: PaymentBatch[],
  isSepa: boolean,
  profile: BankProfile
): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<Document xmlns="${PAIN_NS}" xmlns:xsi="${XSI_NS}">`);
  lines.push("    <CstmrCdtTrfInitn>");

  // Group Header
  lines.push(...indent(buildGroupHeader(msgId, creationDateTime, totalCount, totalAmount, profile), 2));

  // Payment Info blocks
  for (const batch of batches) {
    lines.push(...indent(buildPaymentInfo(batch, isSepa, profile), 2));
  }

  lines.push("    </CstmrCdtTrfInitn>");
  lines.push("</Document>");

  return lines.join("\n");
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
    `    <MsgId>${xmlEscape(msgId)}</MsgId>`,
    `    <CreDtTm>${creationDateTime}</CreDtTm>`,
    `    <NbOfTxs>${totalCount}</NbOfTxs>`,
    `    <CtrlSum>${formatAmount(totalAmount)}</CtrlSum>`,
    "    <InitgPty>",
    `        <Nm>${xmlEscape(profile.initiatingPartyName)}</Nm>`,
    "    </InitgPty>",
    "</GrpHdr>",
  ];
}

function buildPaymentInfo(batch: PaymentBatch, isSepa: boolean, profile: BankProfile): string[] {
  const batchAmount = batch.totalAmount;
  const debtorBic = getDebtorBic(batch.debtorIban, profile);
  const chargeBearer = isSepa ? "SLEV" : "SHAR";

  const lines: string[] = [];
  lines.push("<PmtInf>");
  lines.push(`    <PmtInfId>${xmlEscape(batch.batchId)}</PmtInfId>`);
  lines.push("    <PmtMtd>TRF</PmtMtd>");
  lines.push(`    <NbOfTxs>${batch.transactionCount}</NbOfTxs>`);
  lines.push(`    <CtrlSum>${formatAmount(batchAmount)}</CtrlSum>`);

  // Service Level — only for SEPA
  if (isSepa) {
    lines.push("    <PmtTpInf>");
    lines.push("        <SvcLvl>");
    lines.push("            <Cd>SEPA</Cd>");
    lines.push("        </SvcLvl>");
    lines.push("    </PmtTpInf>");
  }

  lines.push(`    <ReqdExctnDt>${formatDate(batch.executionDate)}</ReqdExctnDt>`);
  lines.push("    <Dbtr>");
  lines.push(`        <Nm>${xmlEscape(batch.debtorName)}</Nm>`);
  lines.push("    </Dbtr>");
  lines.push("    <DbtrAcct>");
  lines.push("        <Id>");
  lines.push(`            <IBAN>${batch.debtorIban}</IBAN>`);
  lines.push("        </Id>");
  lines.push("    </DbtrAcct>");

  // Debtor Agent
  lines.push("    <DbtrAgt>");
  lines.push("        <FinInstnId>");
  if (debtorBic) {
    lines.push(`            <BIC>${debtorBic}</BIC>`);
  } else {
    lines.push("            <Othr>");
    lines.push("                <Id>NOTPROVIDED</Id>");
    lines.push("            </Othr>");
  }
  lines.push("        </FinInstnId>");
  lines.push("    </DbtrAgt>");

  lines.push(`    <ChrgBr>${chargeBearer}</ChrgBr>`);

  // Transactions
  for (const trans of batch.transactions) {
    lines.push(...indent(buildTransaction(trans, isSepa), 1));
  }

  lines.push("</PmtInf>");
  return lines;
}

function buildTransaction(trans: PaymentTransaction, isSepa: boolean): string[] {
  const endToEndId =
    trans.description && trans.description.length > 0
      ? trans.description.substring(0, Math.min(trans.description.length, 35))
      : "NOTPROVIDED";

  const lines: string[] = [];
  lines.push("<CdtTrfTxInf>");
  lines.push("    <PmtId>");
  lines.push(`        <EndToEndId>${xmlEscape(endToEndId)}</EndToEndId>`);
  lines.push("    </PmtId>");
  lines.push("    <Amt>");
  lines.push(`        <InstdAmt Ccy="${trans.currencyCode}">${formatAmount(trans.amount)}</InstdAmt>`);
  lines.push("    </Amt>");

  // Creditor Agent (BIC)
  if (!isSepa) {
    // Non-SEPA: BIC mandatory
    lines.push("    <CdtrAgt>");
    lines.push("        <FinInstnId>");
    lines.push(`            <BIC>${trans.creditorBic}</BIC>`);
    lines.push("        </FinInstnId>");
    lines.push("    </CdtrAgt>");
  } else if (trans.creditorBic && trans.creditorBic.toUpperCase() !== "NOTPROVIDED") {
    // SEPA: BIC optional
    lines.push("    <CdtrAgt>");
    lines.push("        <FinInstnId>");
    lines.push(`            <BIC>${trans.creditorBic}</BIC>`);
    lines.push("        </FinInstnId>");
    lines.push("    </CdtrAgt>");
  }

  // Creditor
  lines.push("    <Cdtr>");
  lines.push(`        <Nm>${xmlEscape(trans.creditorName)}</Nm>`);
  lines.push("    </Cdtr>");

  // Creditor Account
  lines.push("    <CdtrAcct>");
  lines.push("        <Id>");
  if (trans.creditorIban) {
    lines.push(`            <IBAN>${trans.creditorIban}</IBAN>`);
  } else if (trans.creditorAccountNumber) {
    lines.push("            <Othr>");
    lines.push(`                <Id>${trans.creditorAccountNumber}</Id>`);
    lines.push("            </Othr>");
  }
  lines.push("        </Id>");
  lines.push("    </CdtrAcct>");

  // Remittance Information
  if (trans.description) {
    lines.push("    <RmtInf>");
    lines.push(`        <Ustrd>${xmlEscape(trans.description)}</Ustrd>`);
    lines.push("    </RmtInf>");
  }

  lines.push("</CdtTrfTxInf>");
  return lines;
}

function getDebtorBic(debtorIban: string, profile: BankProfile): string | null {
  if (debtorIban.toUpperCase().startsWith("NL")) return profile.defaultDebtorBic;
  return null;
}

function indent(lines: string[], level: number): string[] {
  const prefix = "    ".repeat(level);
  return lines.map((l) => prefix + l);
}
