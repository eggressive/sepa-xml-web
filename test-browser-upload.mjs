import { readFileSync } from "fs";

// We'll use a simpler approach: create a small test page that loads the cleaner
// and tests it with the file directly
console.log("Testing via Node.js simulation of browser behavior...");

// Import jszip and xlsx
import JSZip from "jszip";
import * as XLSX from "xlsx";

const filePath = "/home/ubuntu/upload/240226-Betaallijst_v2.0copy.xlsx";
const raw = readFileSync(filePath);

// Simulate browser DOMParser behavior by using the xlsx browser-like parsing
// The key test is: does the cleaner produce a file that xlsx can parse?

async function cleanExcelFile(data) {
  const zip = await JSZip.loadAsync(data);
  const partsToRemove = [
    /^customXml\//,
    /^docMetadata\//,
    /^xl\/externalLinks\//,
    /^xl\/threadedComments\//,
    /^xl\/persons\//,
  ];

  for (const path of Object.keys(zip.files)) {
    if (partsToRemove.some((pattern) => pattern.test(path))) {
      zip.remove(path);
    }
  }

  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    ct = ct.replace(/<Override[^>]*PartName="\/customXml[^"]*"[^>]*\/>/g, "");
    ct = ct.replace(/<Override[^>]*PartName="\/docMetadata[^"]*"[^>]*\/>/g, "");
    ct = ct.replace(/<Override[^>]*PartName="\/xl\/externalLinks[^"]*"[^>]*\/>/g, "");
    ct = ct.replace(/<Override[^>]*PartName="\/xl\/threadedComments[^"]*"[^>]*\/>/g, "");
    ct = ct.replace(/<Override[^>]*PartName="\/xl\/persons[^"]*"[^>]*\/>/g, "");
    zip.file("[Content_Types].xml", ct);
  }

  const relsFile = zip.file("_rels/.rels");
  if (relsFile) {
    let rels = await relsFile.async("string");
    rels = rels.replace(/<Relationship[^>]*Target="customXml[^"]*"[^>]*\/>/g, "");
    rels = rels.replace(/<Relationship[^>]*Target="docMetadata[^"]*"[^>]*\/>/g, "");
    zip.file("_rels/.rels", rels);
  }

  const wbRelsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (wbRelsFile) {
    let wbRels = await wbRelsFile.async("string");
    wbRels = wbRels.replace(/<Relationship[^>]*Target="externalLinks[^"]*"[^>]*\/>/g, "");
    zip.file("xl/_rels/workbook.xml.rels", wbRels);
  }

  const wbFile = zip.file("xl/workbook.xml");
  if (wbFile) {
    let wb = await wbFile.async("string");
    wb = wb.replace(/<definedName[^>]*>.*?\[[\d]+\].*?<\/definedName>/g, "");
    wb = wb.replace(/<definedNames>\s*<\/definedNames>/g, "");
    zip.file("xl/workbook.xml", wb);
  }

  for (const path of Object.keys(zip.files)) {
    if (path.match(/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/)) {
      const relFile = zip.file(path);
      if (relFile) {
        let relContent = await relFile.async("string");
        relContent = relContent.replace(/<Relationship[^>]*Target="[^"]*threadedComment[^"]*"[^>]*\/>/g, "");
        relContent = relContent.replace(/<Relationship[^>]*Target="[^"]*persons[^"]*"[^>]*\/>/g, "");
        zip.file(path, relContent);
      }
    }
  }

  return await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

async function main() {
  console.log("1. Cleaning file...");
  const cleaned = await cleanExcelFile(raw);
  console.log(`   Original: ${(raw.length / 1024).toFixed(1)} KB → Cleaned: ${(cleaned.length / 1024).toFixed(1)} KB`);
  
  console.log("\n2. Parsing cleaned file...");
  const wb = XLSX.read(cleaned, { type: "buffer", cellDates: true });
  console.log(`   Sheets: ${wb.SheetNames.join(", ")}`);
  
  console.log("\n3. Reading 'Uitgevoerd' sheet data...");
  const sheet = wb.Sheets["Uitgevoerd"];
  if (sheet) {
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    console.log(`   Range: ${sheet["!ref"]}`);
    console.log(`   Data rows: ${range.e.r + 1}, Columns: ${range.e.c + 1}`);
    
    // Read header row (row 3 = index 2)
    const headers = [];
    for (let c = 0; c < Math.min(12, range.e.c + 1); c++) {
      const ref = XLSX.utils.encode_cell({ r: 2, c });
      const cell = sheet[ref];
      headers.push(cell ? (cell.w || String(cell.v)) : "");
    }
    console.log(`   Headers: ${headers.join(" | ")}`);
    
    // Count non-empty data rows
    let dataRows = 0;
    for (let r = 3; r <= range.e.r; r++) {
      const nameRef = XLSX.utils.encode_cell({ r, c: 2 }); // Column C = Fund Name
      const amtRef = XLSX.utils.encode_cell({ r, c: 6 }); // Column G = Amount
      const nameCell = sheet[nameRef];
      const amtCell = sheet[amtRef];
      if ((nameCell && nameCell.v) || (amtCell && amtCell.v)) {
        dataRows++;
      }
    }
    console.log(`   Non-empty data rows: ${dataRows}`);
  }
  
  console.log("\n✅ All tests passed! File can be parsed successfully after cleaning.");
}

main().catch(err => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});
