# Contributing to SEPA XML Generator — Web Application

Thank you for your interest in contributing. This document covers the development workflow, coding conventions, architecture decisions, and step-by-step guides for common extension tasks such as adding a new bank profile or XML generator.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Coding Conventions](#coding-conventions)
- [Processing Pipeline](#processing-pipeline)
- [Adding a New Bank Profile](#adding-a-new-bank-profile)
- [Adding a New XML Generator](#adding-a-new-xml-generator)
- [Adding a New Routing Rule](#adding-a-new-routing-rule)
- [Schema Validation](#schema-validation)
- [Testing](#testing)
- [Git Workflow](#git-workflow)
- [Design Guidelines](#design-guidelines)

---

## Development Setup

### Prerequisites

- Node.js 18 or later
- pnpm 10 or later

### Getting Started

```bash
git clone https://github.com/eggressive/sepa-xml-web.git
cd sepa-xml-web
pnpm install
pnpm dev
```

The development server starts at `http://localhost:3000` with hot module replacement enabled.

### Useful Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start the development server |
| `pnpm build` | Create a production build |
| `pnpm check` | Run TypeScript type checking (`tsc --noEmit`) |
| `pnpm format` | Format all files with Prettier |

---

## Project Architecture

The application is a **client-side only** React SPA. All processing — Excel parsing, validation, XML generation, and schema validation — runs entirely in the browser. There is no backend API for payment data.

### Directory Layout

```
client/src/
├── lib/sepa/              ← Core processing library (bank-agnostic logic)
│   ├── models.ts          ← Data interfaces and helper functions
│   ├── profiles.ts        ← Bank profile definitions
│   ├── excelReader.ts     ← Excel → PaymentTransaction[] parser
│   ├── sanitizer.ts       ← SEPA character set sanitization
│   ├── validator.ts       ← Transaction-level validation rules
│   ├── router.ts          ← Payment routing (currency → payment type)
│   ├── schemaValidator.ts ← XSD-like structural validation engine
│   └── generators/        ← Bank-specific XML generators
│       ├── abnamro.ts     ← pain.001.001.03 generator
│       ├── rbs.ts         ← pain.001.001.09 + SWIFT envelope generator
│       └── index.ts       ← Generator dispatcher
├── hooks/
│   ├── useSepaProcessor.ts ← Main state machine orchestrating the pipeline
│   └── useHistory.ts       ← localStorage-backed export history
├── components/
│   ├── StepIndicator.tsx   ← Workflow sidebar navigation
│   ├── HistoryPanel.tsx    ← Recent exports panel
│   └── steps/              ← One component per workflow step
│       ├── UploadStep.tsx
│       ├── ConfigureStep.tsx
│       ├── PreviewStep.tsx
│       └── ResultsStep.tsx
└── pages/
    └── Home.tsx            ← Main page layout
```

### Key Interfaces

The core data model is defined in `client/src/lib/sepa/models.ts`. Understanding these interfaces is essential before making changes.

**`BankProfile`** — Defines a bank's column mapping, routing rules, and XML format:

```typescript
interface BankProfile {
  profileName: string;          // Display name shown in the UI
  bank: string;                 // Generator key: "abnamro" | "rbs"
  painVersion: string;          // "pain.001.001.03" | "pain.001.001.09"
  defaultDebtorBic: string;     // Default BIC for the debtor bank
  initiatingPartyName: string;  // InitgPty/Nm in the XML header
  senderId?: string;            // Optional sender ID (RBS uses this)
  sheetName?: string;           // Auto-selected sheet name
  sheetSelection?: string;      // "user" for multi-sheet selection
  dataStartRow: number;         // 1-indexed row where data begins
  columnMapping: ColumnMapping; // Excel column letter → field mapping
  defaults?: Record<string, string>; // Fixed default values
  routing: Record<string, RoutingRule>; // Currency/key → routing rule
  useIndividualProcessing: boolean;
  isMultiSheet: boolean;
}
```

**`PaymentTransaction`** — A single parsed and validated payment row:

```typescript
interface PaymentTransaction {
  paymentType: string;
  fundName: string;
  debtorIban: string;
  valueDate: Date;
  currencyCode: string;
  amount: number;
  creditorBic: string;
  creditorAccountNumber: string;
  creditorIban: string;
  creditorName: string;
  description: string;
  sheetName: string;
  rowNumber: number;
}
```

**`RoutingRule`** — Determines how a payment group is generated:

```typescript
interface RoutingRule {
  type: string;             // "SEPA" | "NonSEPA" | "CHAPS" | "FP" | "INTL"
  serviceLevel?: string;    // "SEPA" | "URGP" | "NURG"
  chargeBearer?: string;    // "SLEV" | "SHAR"
  priority?: string;        // "HIGH" | "NORM"
  batchBooking?: boolean;
}
```

---

## Coding Conventions

### TypeScript

The project uses **strict mode** TypeScript with the following settings:

- `strict: true` — All strict checks enabled
- `moduleResolution: "bundler"` — Vite-compatible module resolution
- Path alias `@/*` maps to `client/src/*`

General rules:

- Prefer `interface` over `type` for object shapes.
- Use `type` imports (`import type { ... }`) when importing only types.
- Avoid `any`; use `unknown` and narrow with type guards when the type is uncertain.
- All functions in `lib/sepa/` must be pure (no side effects, no DOM access) — they receive data and return data.
- Use `const` by default; use `let` only when reassignment is necessary.

### Formatting

Prettier is configured in `.prettierrc`:

| Setting | Value |
|---------|-------|
| Semicolons | Always |
| Quotes | Double quotes |
| Trailing commas | ES5 |
| Print width | 80 characters |
| Tab width | 2 spaces |
| Arrow parens | Avoid when possible |

Run `pnpm format` before committing.

### File Naming

- React components: `PascalCase.tsx` (e.g., `ConfigureStep.tsx`)
- Library modules: `camelCase.ts` (e.g., `excelReader.ts`)
- Hooks: `useCamelCase.ts` (e.g., `useSepaProcessor.ts`)
- Test files: `*.test.ts` (co-located or in a `__tests__` directory)

### Component Conventions

- Use functional components with hooks exclusively.
- Place a JSDoc comment at the top of each component file noting the design system context.
- Prefer shadcn/ui primitives (`Button`, `Select`, `Card`) over custom implementations.
- Use Tailwind CSS utility classes; avoid inline styles and custom CSS files.
- Keep components focused — if a component exceeds 200 lines, consider extracting sub-components.

---

## Processing Pipeline

The end-to-end flow is orchestrated by `useSepaProcessor.ts` and follows these stages:

```
Excel File
    │
    ▼
┌──────────────┐
│ excelReader   │  Parse Excel → PaymentTransaction[]
│               │  Apply column mapping, defaults, date/amount parsing
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ validator     │  Validate IBAN, BIC, amounts, required fields
│               │  Produce ValidationResult (errors, warnings, info)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ router        │  Group transactions by currency + routing rules
│               │  Output: RoutedPayments[] (one per payment type)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ generators    │  Bank-specific XML generation
│               │  abnamro.ts → pain.001.001.03
│               │  rbs.ts → pain.001.001.09 + SWIFT envelope
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ schemaValidator│  Structural validation against XSD rules
│               │  Namespace, elements, types, cardinality, patterns
└──────┬───────┘
       │
       ▼
  GeneratedFile[] → UI (download, preview, history)
```

Each stage is a pure function that takes input data and returns output data. The `useSepaProcessor` hook manages the state transitions between UI steps.

---

## Adding a New Bank Profile

Adding a new bank profile is the most common extension task. If the new bank uses an existing XML format (pain.001.001.03 or pain.001.001.09), you only need to add a profile definition — no new generator code is required.

### Step 1: Define the Profile

Open `client/src/lib/sepa/profiles.ts` and add a new entry to the `PROFILES` array:

```typescript
{
  profileName: "New Bank - Standard",    // Unique display name
  bank: "abnamro",                       // Existing generator key
  painVersion: "pain.001.001.03",        // Must match the generator
  defaultDebtorBic: "NEWBNL2A",          // Bank's BIC
  initiatingPartyName: "Your Company",   // InitgPty name in XML
  sheetName: "Payments",                 // Auto-selected sheet name
  dataStartRow: 2,                       // 1-indexed first data row
  useIndividualProcessing: true,
  isMultiSheet: false,
  columnMapping: {
    valueDate: "A",
    creditorName: "B",
    description: "C",
    amount: "D",
    currency: "E",
    creditorIban: "F",
    creditorBic: "G",
    debtorIban: "H",
    fundName: "I",
  },
  routing: {
    EUR: { type: "SEPA", serviceLevel: "SEPA", chargeBearer: "SLEV" },
    DEFAULT: { type: "NonSEPA", chargeBearer: "SHAR" },
  },
},
```

### Step 2: Column Mapping Reference

The `columnMapping` object maps Excel column letters to transaction fields. All fields are optional — unmapped fields will use profile `defaults` or be left empty.

| Field | Description | Example Column |
|-------|-------------|----------------|
| `valueDate` | Payment execution date | `"A"` |
| `creditorName` | Beneficiary name | `"B"` |
| `description` | Payment reference / remittance | `"C"` |
| `amount` | Payment amount (numeric) | `"D"` |
| `currency` | ISO 4217 currency code | `"E"` |
| `creditorIban` | Beneficiary IBAN | `"F"` |
| `creditorBic` | Beneficiary BIC/SWIFT | `"G"` |
| `debtorIban` | Debtor/sender IBAN | `"H"` |
| `fundName` | Debtor entity name | `"I"` |
| `paymentType` | Payment type override (e.g., "CHAPS") | `"J"` |
| `accountNumber` | Non-IBAN account number | `"K"` |

### Step 3: Using Defaults

For profiles where certain fields are fixed (e.g., a single debtor IBAN for all payments), use the `defaults` dictionary instead of mapping a column:

```typescript
defaults: {
  debtorIban: "NL74ABNA0132320614",
  fundName: "My Fund BV",
  currency: "EUR",
  valueDate: "TODAY",  // Special value: uses current date
},
```

Default values are used when the corresponding column is not mapped or the cell is empty.

### Step 4: Multi-Sheet Profiles

For profiles that process multiple sheets from one workbook, set:

```typescript
isMultiSheet: true,
sheetSelection: "user",  // Let the user pick which sheets to process
```

The UI will show checkboxes for all sheets in the workbook.

### Step 5: Test

Upload an Excel file with the expected column layout, select the new profile, and verify that transactions are parsed, validated, routed, and generated correctly.

---

## Adding a New XML Generator

If a new bank requires a different XML format (not pain.001.001.03 or pain.001.001.09), you need to create a new generator module.

### Step 1: Create the Generator File

Create `client/src/lib/sepa/generators/newbank.ts`:

```typescript
import type { BankProfile, GeneratedFile, RoutedPayments } from "../models";
import {
  createIndividualBatches,
  formatDate,
  formatDateTime,
  formatAmount,
  formatTimestamp,
} from "../models";
import { sanitize } from "../sanitizer";
import { padBic } from "../sanitizer";

export function generateNewBank(
  routedPayments: RoutedPayments[],
  profile: BankProfile
): GeneratedFile[] {
  return routedPayments.map((group) => {
    const batches = createIndividualBatches(group.transactions);
    const now = new Date();
    const totalAmount = group.transactions.reduce(
      (sum, t) => sum + t.amount, 0
    );
    const totalCount = group.transactions.length;

    // Build XML using DOMParser (not string concatenation)
    const doc = document.implementation.createDocument(
      "urn:iso:std:iso:20022:tech:xsd:pain.001.001.03",
      "Document",
      null
    );

    // ... build your XML structure here ...

    const serializer = new XMLSerializer();
    const xmlContent =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      serializer.serializeToString(doc);

    return {
      fileName: `${group.filePrefix}_${formatTimestamp(now)}.xml`,
      xmlContent,
      paymentType: group.paymentType,
      currency: group.currencyCode,
      transactionCount: totalCount,
      totalAmount,
    };
  });
}
```

### Step 2: Register the Generator

Open `client/src/lib/sepa/generators/index.ts` and add the new generator:

```typescript
import { generateNewBank } from "./newbank";

export function generateXmlFiles(
  routedPayments: RoutedPayments[],
  profile: BankProfile
): GeneratedFile[] {
  switch (profile.bank) {
    case "abnamro":
      return generateAbnAmro(routedPayments, profile);
    case "rbs":
      return generateRbs(routedPayments, profile);
    case "newbank":                          // ← Add this case
      return generateNewBank(routedPayments, profile);
    default:
      throw new Error(`Unknown bank: ${profile.bank}`);
  }
}
```

### Step 3: Add Schema Validation Rules

If the new format has specific XSD constraints, add them to `client/src/lib/sepa/schemaValidator.ts` in the `SCHEMA_DEFINITIONS` object.

### Important Guidelines for Generators

- **Use DOMParser/XMLSerializer** for XML construction — never concatenate XML strings manually. This ensures proper escaping and well-formedness.
- **Use the sanitizer** (`sanitize()`, `padBic()`, `cleanBic()`) on all text content before inserting into XML elements.
- **Use the model helpers** (`formatDate()`, `formatAmount()`, `formatDateTime()`) for consistent formatting.
- **Return `GeneratedFile[]`** — one file per routed payment group.

---

## Adding a New Routing Rule

Routing rules determine how transactions are grouped by payment type. The router (`client/src/lib/sepa/router.ts`) uses a priority-based lookup:

1. **Exact match** on a composite routing key (e.g., `GBP_CHAPS`)
2. **Currency match** (e.g., `EUR`, `GBP`, `USD`)
3. **DEFAULT** fallback

To add a new routing key (e.g., for a bank that distinguishes domestic vs. international USD payments), modify the `getRoutingKey` function in `router.ts`:

```typescript
function getRoutingKey(
  trans: PaymentTransaction,
  profile: BankProfile
): string {
  // Example: domestic USD vs. international USD
  if (
    profile.bank === "newbank" &&
    trans.currencyCode === "USD" &&
    trans.creditorIban.startsWith("US")
  ) {
    return "USD_DOMESTIC";
  }
  return trans.currencyCode;
}
```

Then add the corresponding routing rules in the profile definition:

```typescript
routing: {
  USD_DOMESTIC: { type: "ACH", chargeBearer: "SHAR" },
  USD: { type: "WIRE", chargeBearer: "SHAR" },
  DEFAULT: { type: "INTL", chargeBearer: "SHAR" },
},
```

---

## Schema Validation

The schema validator (`client/src/lib/sepa/schemaValidator.ts`) performs structural validation against XSD-like rules using the browser's native DOMParser. It checks:

- XML well-formedness and namespace correctness
- Required element presence and ordering
- Element cardinality (minOccurs / maxOccurs)
- Simple type constraints (string length, patterns for IBAN/BIC/currency)
- Numeric precision (decimal places)
- Cross-field consistency (NbOfTxs matches actual count, CtrlSum matches total)

When adding a new pain version, add its schema definition to the `SCHEMA_DEFINITIONS` map in `schemaValidator.ts`. The schema definition is a simplified representation of the XSD — not a full XSD parser, but sufficient for structural validation.

BIC and IBAN pattern mismatches are reported as **warnings** (data quality issues) rather than **errors** (structural issues), since the XML is still well-formed.

---

## Testing

### Manual Testing

The primary testing method is manual end-to-end testing through the browser:

1. Upload an Excel file with known data.
2. Select the appropriate profile.
3. Verify transaction counts and amounts in the Preview step.
4. Generate XML and check schema validation results.
5. Download and inspect the XML content.

### TypeScript Checking

Always run the type checker before committing:

```bash
pnpm check
```

This catches type errors, missing imports, and interface mismatches across the entire codebase.

### Regression Testing

When modifying core logic (excelReader, validator, router, generators), test all three profiles to ensure no regressions:

1. **ABN AMRO** — Standard multi-currency file with SEPA EUR and NonSEPA payments
2. **RBS/NatWest** — Multi-payment-type file with CHAPS, Faster Payment, SEPA, and International
3. **IREF** — Multi-sheet file with fixed defaults and EUR-only SEPA payments

---

## Git Workflow

### Branch Strategy

- `main` — Production-ready code. All commits should pass `pnpm check`.
- Feature branches — Use `feat/description` for new features, `fix/description` for bug fixes.

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: add Deutsche Bank profile with pain.001.003.03 support
fix: handle empty BIC cells in IREF profile
docs: update column mapping reference in CONTRIBUTING.md
chore: upgrade xlsx dependency to 0.20.x
```

Keep the subject line under 72 characters. Add a body paragraph for non-trivial changes explaining the "why" behind the change.

### Pull Request Checklist

Before opening a PR, verify:

- [ ] `pnpm check` passes with zero errors
- [ ] `pnpm format` has been run
- [ ] All three bank profiles tested manually (if core logic changed)
- [ ] New profile or generator documented in this file
- [ ] No `console.log` statements left in production code (use `console.warn` sparingly for genuine warnings)

---

## Design Guidelines

The UI follows a **"Swiss Banking — Precision Minimalism"** design philosophy:

- **Typography**: DM Sans for headings, JetBrains Mono for financial data (amounts, IBANs, BICs, file names). Use the `font-data` utility class for monospaced data.
- **Color palette**: Warm white background, charcoal text, deep teal (`oklch(0.45 0.12 180)`) as the primary accent. Green for success/valid states, amber for warnings, red for errors.
- **Spacing**: Generous whitespace. Use Tailwind's spacing scale consistently (`gap-3`, `p-4`, `space-y-6`).
- **Components**: Prefer shadcn/ui primitives. Keep interactions minimal and purposeful — this is a financial tool, not a marketing site.
- **Responsiveness**: The sidebar collapses on mobile; the step indicator becomes a horizontal bar. Test at 375px, 768px, and 1280px widths.
