/**
 * Test script to verify the Excel cleaner works with the problematic file.
 * 
 * This simulates the browser flow:
 * 1. Read the problematic Excel file
 * 2. Clean it with JSZip (removing custom XML parts)
 * 3. Parse it with xlsx
 * 4. Verify sheet names and data are intact
 */

import JSZip from "jszip";
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "fs";

const filePath = "/home/ubuntu/upload/240226-Betaallijst_v2.0copy.xlsx";

async function cleanExcelFile(data) {
  const zip = await JSZip.loadAsync(data);

  const partsToRemove = [
    /^customXml\//,
    /^docMetadata\//,
    /^xl\/externalLinks\//,
    /^xl\/threadedComments\//,
    /^xl\/persons\//,
  ];

  // List what we're removing
  const removed = [];
  for (const path of Object.keys(zip.files)) {
    if (partsToRemove.some((pattern) => pattern.test(path))) {
      removed.push(path);
      zip.remove(path);
    }
  }
  console.log(`\nRemoved ${removed.length} problematic parts:`);
  removed.forEach(p => console.log(`  - ${p}`));

  // Clean [Content_Types].xml
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

  // Clean _rels/.rels
  const relsFile = zip.file("_rels/.rels");
  if (relsFile) {
    let rels = await relsFile.async("string");
    rels = rels.replace(/<Relationship[^>]*Target="customXml[^"]*"[^>]*\/>/g, "");
    rels = rels.replace(/<Relationship[^>]*Target="docMetadata[^"]*"[^>]*\/>/g, "");
    zip.file("_rels/.rels", rels);
  }

  // Clean xl/_rels/workbook.xml.rels
  const wbRelsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (wbRelsFile) {
    let wbRels = await wbRelsFile.async("string");
    wbRels = wbRels.replace(/<Relationship[^>]*Target="externalLinks[^"]*"[^>]*\/>/g, "");
    zip.file("xl/_rels/workbook.xml.rels", wbRels);
  }

  // Clean xl/workbook.xml
  const wbFile = zip.file("xl/workbook.xml");
  if (wbFile) {
    let wb = await wbFile.async("string");
    wb = wb.replace(/<definedName[^>]*>.*?\[[\d]+\].*?<\/definedName>/g, "");
    wb = wb.replace(/<definedNames>\s*<\/definedNames>/g, "");
    zip.file("xl/workbook.xml", wb);
  }

  // Clean worksheet rels
  for (const path of Object.keys(zip.files)) {
    if (path.match(/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/)) {
      const relFile = zip.file(path);
      if (relFile) {
        let relContent = await relFile.async("string");
        relContent = relContent.replace(
          /<Relationship[^>]*Target="[^"]*threadedComment[^"]*"[^>]*\/>/g,
          ""
        );
        relContent = relContent.replace(
          /<Relationship[^>]*Target="[^"]*persons[^"]*"[^>]*\/>/g,
          ""
        );
        zip.file(path, relContent);
      }
    }
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}

async function main() {
  console.log("=== Testing Excel Cleaner ===\n");
  
  const raw = readFileSync(filePath);
  console.log(`Original file size: ${(raw.length / 1024).toFixed(1)} KB`);
  
  // First, try parsing the original file (this works in Node.js but fails in browser)
  console.log("\n--- Parsing ORIGINAL file with xlsx ---");
  try {
    const wb1 = XLSX.read(raw, { type: "buffer", cellDates: true });
    console.log(`Sheets: ${wb1.SheetNames.join(", ")}`);
    
    // Check the Uitgevoerd sheet
    const sheet = wb1.Sheets["Uitgevoerd"];
    if (sheet) {
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      console.log(`Uitgevoerd range: ${sheet["!ref"]}`);
      console.log(`  Rows: ${range.e.r + 1}, Cols: ${range.e.c + 1}`);
    }
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
  }
  
  // Now clean the file and try again
  console.log("\n--- Cleaning file with JSZip ---");
  const cleaned = await cleanExcelFile(raw);
  console.log(`Cleaned file size: ${(cleaned.length / 1024).toFixed(1)} KB`);
  
  // Save cleaned file for inspection
  writeFileSync("/home/ubuntu/upload/cleaned-test.xlsx", cleaned);
  console.log("Saved cleaned file to /home/ubuntu/upload/cleaned-test.xlsx");
  
  // Parse the cleaned file
  console.log("\n--- Parsing CLEANED file with xlsx ---");
  try {
    const wb2 = XLSX.read(cleaned, { type: "buffer", cellDates: true });
    console.log(`Sheets: ${wb2.SheetNames.join(", ")}`);
    
    // Check the Uitgevoerd sheet
    const sheet = wb2.Sheets["Uitgevoerd"];
    if (sheet) {
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      console.log(`Uitgevoerd range: ${sheet["!ref"]}`);
      console.log(`  Rows: ${range.e.r + 1}, Cols: ${range.e.c + 1}`);
      
      // Read a few cells to verify data integrity
      console.log("\nSample data from Uitgevoerd sheet:");
      for (let r = 0; r < Math.min(5, range.e.r + 1); r++) {
        const cells = [];
        for (let c = 0; c < Math.min(8, range.e.c + 1); c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[ref];
          cells.push(cell ? (cell.w || String(cell.v)).substring(0, 20) : "");
        }
        console.log(`  Row ${r}: ${cells.join(" | ")}`);
      }
    }
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
  }
  
  console.log("\n=== Test Complete ===");
}

main().catch(console.error);
