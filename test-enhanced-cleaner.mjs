import JSZip from "jszip";
import * as XLSX from "xlsx";
import { readFileSync } from "fs";

const filePath = "/home/ubuntu/upload/240226-Betaallijst_v2.0copy.xlsx";
const raw = readFileSync(filePath);

async function cleanExcelFile(data) {
  const zip = await JSZip.loadAsync(data);

  const partsToRemove = [
    /^customXml\//,
    /^docMetadata\//,
    /^docProps\/custom\.xml$/,
    /^xl\/externalLinks\//,
    /^xl\/threadedComments\//,
    /^xl\/persons\//,
    /^xl\/richData\//,
    /^xl\/namedSheetViews\//,
    /^xl\/slicerCaches\//,
    /^xl\/slicers\//,
    /^xl\/timelines\//,
    /^xl\/timelineCaches\//,
    /^xl\/connections\.xml$/,
    /^xl\/queryTables\//,
    /^xl\/customData\//,
    /^xl\/customProperty\d+\.bin$/,
    /^xl\/metadata\.xml$/,
    /^xl\/rdrichvalue/,
    /^xl\/rdRichValueTypes/,
    /^xl\/rdarray/,
    /^xl\/rdSupportingPropertyBag/,
    /^xl\/richValueRel/,
  ];

  const removedPaths = [];
  for (const path of Object.keys(zip.files)) {
    if (partsToRemove.some((pattern) => pattern.test(path))) {
      removedPaths.push(path);
      zip.remove(path);
    }
  }
  console.log(`Removed ${removedPaths.length} parts:`, removedPaths);

  // Clean [Content_Types].xml
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    const ctPatternsToRemove = [
      /customXml/, /docMetadata/, /externalLinks/, /threadedComments/,
      /persons/, /richData/, /namedSheetViews/, /slicerCaches/,
      /slicers/, /timelines/, /timelineCaches/, /connections/,
      /queryTables/, /customData/, /customProperty/, /metadata/,
      /rdrichvalue/i, /rdRichValueTypes/i, /rdarray/i,
      /rdSupportingPropertyBag/i, /richValueRel/i, /custom\.xml/,
    ];
    ct = ct.replace(/<Override[^>]*\/>/g, (match) => {
      return ctPatternsToRemove.some((p) => p.test(match)) ? "" : match;
    });
    zip.file("[Content_Types].xml", ct);
  }

  // Clean _rels/.rels
  const relsFile = zip.file("_rels/.rels");
  if (relsFile) {
    let rels = await relsFile.async("string");
    rels = rels.replace(/<Relationship[^>]*Target="customXml[^"]*"[^>]*\/>/g, "");
    rels = rels.replace(/<Relationship[^>]*Target="docMetadata[^"]*"[^>]*\/>/g, "");
    rels = rels.replace(/<Relationship[^>]*Target="docProps\/custom[^"]*"[^>]*\/>/g, "");
    zip.file("_rels/.rels", rels);
  }

  // Clean xl/_rels/workbook.xml.rels
  const wbRelsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (wbRelsFile) {
    let wbRels = await wbRelsFile.async("string");
    const wbRelPatternsToRemove = [
      /externalLinks/, /connections/, /queryTables/, /customData/,
      /customProperty/, /slicerCaches/, /namedSheetViews/, /timelines/,
      /timelineCaches/, /richData/, /metadata/, /rdrichvalue/i,
      /rdRichValueTypes/i, /rdarray/i, /rdSupportingPropertyBag/i,
      /richValueRel/i, /persons/,
    ];
    wbRels = wbRels.replace(/<Relationship[^>]*\/>/g, (match) => {
      return wbRelPatternsToRemove.some((p) => p.test(match)) ? "" : match;
    });
    zip.file("xl/_rels/workbook.xml.rels", wbRels);
  }

  // Clean xl/workbook.xml
  const wbFile = zip.file("xl/workbook.xml");
  if (wbFile) {
    let wb = await wbFile.async("string");
    wb = wb.replace(/<definedName[^>]*>.*?\[[\d]+\].*?<\/definedName>/g, "");
    wb = wb.replace(/<definedNames>\s*<\/definedNames>/g, "");
    wb = wb.replace(/mc:Ignorable="[^"]*"/g, 'mc:Ignorable=""');
    zip.file("xl/workbook.xml", wb);
  }

  // Clean worksheet rels
  for (const path of Object.keys(zip.files)) {
    if (path.match(/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/)) {
      const relFile = zip.file(path);
      if (relFile) {
        let relContent = await relFile.async("string");
        const sheetRelPatternsToRemove = [
          /threadedComment/, /persons/, /slicer/i, /timeline/i, /namedSheetView/i,
        ];
        relContent = relContent.replace(/<Relationship[^>]*\/>/g, (match) => {
          return sheetRelPatternsToRemove.some((p) => p.test(match)) ? "" : match;
        });
        zip.file(path, relContent);
      }
    }
  }

  // Clean worksheet XML - remove <extLst> blocks and unknown namespaces
  for (const path of Object.keys(zip.files)) {
    if (path.match(/^xl\/worksheets\/sheet\d+\.xml$/)) {
      const sheetFile = zip.file(path);
      if (sheetFile) {
        let sheetContent = await sheetFile.async("string");
        const hadExtLst = sheetContent.includes("<extLst>");
        sheetContent = sheetContent.replace(/<extLst>[\s\S]*?<\/extLst>/g, "");
        sheetContent = sheetContent.replace(/mc:Ignorable="[^"]*"/g, 'mc:Ignorable=""');
        if (hadExtLst) console.log(`  Cleaned <extLst> from ${path}`);
        zip.file(path, sheetContent);
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
  console.log("=== Enhanced Cleaner Test ===\n");
  console.log(`Original: ${(raw.length / 1024).toFixed(1)} KB`);

  const cleaned = await cleanExcelFile(raw);
  console.log(`\nCleaned: ${(cleaned.length / 1024).toFixed(1)} KB`);

  console.log("\nParsing cleaned file...");
  const wb = XLSX.read(cleaned, { type: "buffer", cellDates: true });
  console.log(`Sheets: ${wb.SheetNames.join(", ")}`);

  const sheet = wb.Sheets["Uitgevoerd"];
  if (sheet) {
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    console.log(`Uitgevoerd: ${range.e.r + 1} rows, ${range.e.c + 1} cols`);
    
    // Check headers
    const headers = [];
    for (let c = 0; c < Math.min(12, range.e.c + 1); c++) {
      const ref = XLSX.utils.encode_cell({ r: 2, c });
      const cell = sheet[ref];
      headers.push(cell ? (cell.w || String(cell.v)).substring(0, 25) : "");
    }
    console.log(`Headers: ${headers.join(" | ")}`);
    
    // Count data rows
    let dataRows = 0;
    for (let r = 3; r <= range.e.r; r++) {
      const nameRef = XLSX.utils.encode_cell({ r, c: 2 });
      const amtRef = XLSX.utils.encode_cell({ r, c: 6 });
      if ((sheet[nameRef]?.v) || (sheet[amtRef]?.v)) dataRows++;
    }
    console.log(`Data rows: ${dataRows}`);
  }

  console.log("\n✅ Enhanced cleaner test passed!");
}

main().catch(err => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
