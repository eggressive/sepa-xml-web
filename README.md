# SEPA XML Generator — Web Application

A browser-based tool for generating ISO 20022 SEPA and international payment XML files from Excel spreadsheets. All processing runs entirely client-side — no data ever leaves the user's machine.

This is the web companion to the [SepaXmlGenerator](https://github.com/eggressive/sepa_xml) desktop application (C# / WinForms), ported to TypeScript and React for cross-platform browser access.

---

## Features

### Core Functionality

- **Excel file parsing** — Reads `.xlsx`, `.xls`, `.xlsm`, and `.xlsb` files using [SheetJS](https://sheetjs.com/). Handles European number formats (space/dot/comma thousands separators) and DD-MM-YYYY dates.
- **Multi-bank profile support** — Three built-in bank profiles with distinct column mappings, routing rules, and XML formats:

  | Profile | Pain Version | XML Format | Payment Types |
  |---------|-------------|------------|---------------|
  | ABN AMRO — Standard | pain.001.001.03 | ISO 20022 | SEPA EUR, NonSEPA (multi-currency) |
  | RBS/NatWest — Standard | pain.001.001.09 | ISO 20022 + SWIFT envelope | CHAPS, Faster Payment, SEPA, International |
  | IREF — ABN AMRO | pain.001.001.03 | ISO 20022 | SEPA EUR (fixed debtor) |

- **Automatic payment routing** — Transactions are classified by currency, BIC prefix, and country code into the correct payment type (SEPA, CHAPS, Faster Payment, International, etc.).
- **BIC auto-padding** — 8-character BICs are automatically padded to 11 characters with `XXX`.
- **Input sanitization** — SEPA-incompatible characters are replaced per the EPC recommended character set.
- **Transaction validation** — Validates IBAN format, BIC structure, amount positivity, required fields, and business rules before generation.
- **XSD schema validation** — Generated XML is validated against pain.001.001.03 and pain.001.001.09 schemas, checking namespace, element structure, cardinality, type constraints (IBAN/BIC patterns, string lengths), numeric precision, and cross-field consistency (NbOfTxs, CtrlSum).

### User Interface

- **4-step guided workflow** — Upload → Configure → Preview → Results
- **Multi-sheet support** — IREF profile allows selecting multiple "Betaallijst" sheets for batch processing
- **Inline XML preview** — View generated XML with syntax display directly in the browser
- **Download options** — Individual XML file download or bulk ZIP export
- **Copy to clipboard** — One-click XML content copy
- **Processing history** — localStorage-backed panel tracking recent exports with file name, profile, timestamp, per-file summaries, and schema validation status (up to 50 entries)
- **Responsive design** — Works on desktop and mobile with adaptive sidebar layout

### Privacy and Security

- **100% client-side** — All Excel parsing, validation, XML generation, and schema validation happen in the browser
- **Zero server communication** — No file uploads, no API calls, no telemetry on payment data
- **No dependencies on external services** — Works offline after initial page load

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Excel Parsing | SheetJS (xlsx) |
| XML Generation | Native DOM APIs (DOMParser, XMLSerializer) |
| File Download | FileSaver.js + JSZip |
| Build Tool | Vite 7 |
| Package Manager | pnpm |

---

## Project Structure

```
client/src/
├── lib/sepa/                  # Core SEPA processing library
│   ├── models.ts              # Data models (BankProfile, PaymentTransaction, etc.)
│   ├── profiles.ts            # Bank profile definitions (ABN AMRO, RBS, IREF)
│   ├── excelReader.ts         # Excel file parsing with column mapping
│   ├── sanitizer.ts           # SEPA character set sanitization
│   ├── validator.ts           # Transaction validation rules
│   ├── router.ts              # Payment routing (SEPA/NonSEPA/CHAPS/FP/INTL)
│   ├── schemaValidator.ts     # XSD schema validation engine
│   └── generators/
│       ├── abnamro.ts         # ABN AMRO XML generator (pain.001.001.03)
│       ├── rbs.ts             # RBS/NatWest XML generator (pain.001.001.09 + SWIFT)
│       └── index.ts           # Generator orchestrator
├── hooks/
│   ├── useSepaProcessor.ts    # Main processing state machine
│   └── useHistory.ts          # localStorage-backed export history
├── components/
│   ├── StepIndicator.tsx      # Workflow sidebar navigation
│   ├── HistoryPanel.tsx       # Recent exports panel
│   └── steps/
│       ├── UploadStep.tsx     # File upload with drag-and-drop
│       ├── ConfigureStep.tsx  # Profile and sheet selection
│       ├── PreviewStep.tsx    # Transaction preview with validation
│       └── ResultsStep.tsx    # Generated files with schema validation
└── pages/
    └── Home.tsx               # Main application page
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ 
- [pnpm](https://pnpm.io/) 10+

### Installation

```bash
git clone https://github.com/eggressive/sepa-xml-web.git
cd sepa-xml-web
pnpm install
```

### Development

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`.

### Build

```bash
pnpm build
```

The production build is output to `dist/`.

---

## Usage

1. **Upload** — Drag and drop (or browse for) an Excel file containing payment transactions.
2. **Configure** — Select a bank profile. The app auto-detects the matching sheet. For IREF, select which sheets to process.
3. **Preview** — Review routed payments grouped by type (SEPA, CHAPS, International, etc.) and check validation messages. Errors block generation; warnings and info messages are advisory.
4. **Results** — Download individual XML files or a ZIP archive. Expand schema validation details per file. Use inline preview or copy-to-clipboard.

### Excel File Requirements

The Excel file must contain a sheet with columns matching the selected bank profile's column mapping. The standard ABN AMRO / RBS layout expects:

| Column | Field |
|--------|-------|
| A | Value Date |
| B | Creditor Name |
| C | Payment Description |
| D | Amount |
| E | Currency Code |
| F | Creditor IBAN |
| G | Creditor BIC |
| H | Debtor IBAN |
| I | Debtor Name |

The IREF profile uses a different layout (B=Name, C=Description, O=Amount, Q=IBAN, R=BIC) with fixed defaults for debtor IBAN, fund name, and currency.

---

## Relationship to Desktop Application

This web app is a TypeScript port of the [SepaXmlGenerator](https://github.com/eggressive/sepa_xml) C# desktop application. The core logic — bank profiles, column mappings, payment routing rules, XML generation templates, and validation rules — has been faithfully translated from C# to TypeScript while adapting to browser APIs (DOMParser instead of System.Xml, SheetJS instead of EPPlus).

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
