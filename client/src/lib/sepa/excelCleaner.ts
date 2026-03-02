import JSZip from "jszip";

/**
 * Clean an Excel file by removing ALL non-essential XML parts that can
 * cause "Unknown Namespace" or TypeError errors in browser-based xlsx parsing.
 *
 * Microsoft 365 / SharePoint / OneDrive Excel files accumulate many
 * extension parts that use namespaces the browser's DOMParser and the
 * xlsx library cannot handle:
 *
 * - External links (externalLink*.xml)
 * - Custom XML parts (customXml/)
 * - Document metadata / sensitivity labels (docMetadata/)
 * - Threaded comments & person data
 * - Rich data types (xl/richData/)
 * - Named sheet views (xl/namedSheetViews/)
 * - Timeline / slicer caches
 * - Power Query connections
 * - Custom properties
 *
 * This function strips ALL of these from the ZIP archive while preserving
 * the actual spreadsheet data (sheets, styles, shared strings, themes).
 */
export async function cleanExcelFile(data: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(data);

  // ── 1. Remove entire directories / file patterns that are non-essential ──
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

  const removedPaths: string[] = [];
  for (const path of Object.keys(zip.files)) {
    if (partsToRemove.some((pattern) => pattern.test(path))) {
      removedPaths.push(path);
      zip.remove(path);
    }
  }

  if (removedPaths.length > 0) {
    console.log(`[SEPA] Removed ${removedPaths.length} non-essential parts from Excel file`);
  }

  // ── 2. Clean [Content_Types].xml ──
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    // Remove Override entries referencing any deleted paths
    const ctPatternsToRemove = [
      /customXml/,
      /docMetadata/,
      /externalLinks/,
      /threadedComments/,
      /persons/,
      /richData/,
      /namedSheetViews/,
      /slicerCaches/,
      /slicers/,
      /timelines/,
      /timelineCaches/,
      /connections/,
      /queryTables/,
      /customData/,
      /customProperty/,
      /metadata/,
      /rdrichvalue/i,
      /rdRichValueTypes/i,
      /rdarray/i,
      /rdSupportingPropertyBag/i,
      /richValueRel/i,
      /custom\.xml/,
    ];
    ct = ct.replace(/<Override[^>]*\/>/g, (match) => {
      return ctPatternsToRemove.some((p) => p.test(match)) ? "" : match;
    });
    zip.file("[Content_Types].xml", ct);
  }

  // ── 3. Clean _rels/.rels ──
  const relsFile = zip.file("_rels/.rels");
  if (relsFile) {
    let rels = await relsFile.async("string");
    rels = rels.replace(/<Relationship[^>]*Target="customXml[^"]*"[^>]*\/>/g, "");
    rels = rels.replace(/<Relationship[^>]*Target="docMetadata[^"]*"[^>]*\/>/g, "");
    rels = rels.replace(/<Relationship[^>]*Target="docProps\/custom[^"]*"[^>]*\/>/g, "");
    zip.file("_rels/.rels", rels);
  }

  // ── 4. Clean xl/_rels/workbook.xml.rels ──
  const wbRelsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (wbRelsFile) {
    let wbRels = await wbRelsFile.async("string");
    // Remove relationships to all deleted parts
    const wbRelPatternsToRemove = [
      /externalLinks/,
      /connections/,
      /queryTables/,
      /customData/,
      /customProperty/,
      /slicerCaches/,
      /namedSheetViews/,
      /timelines/,
      /timelineCaches/,
      /richData/,
      /metadata/,
      /rdrichvalue/i,
      /rdRichValueTypes/i,
      /rdarray/i,
      /rdSupportingPropertyBag/i,
      /richValueRel/i,
      /persons/,
    ];
    wbRels = wbRels.replace(/<Relationship[^>]*\/>/g, (match) => {
      return wbRelPatternsToRemove.some((p) => p.test(match)) ? "" : match;
    });
    zip.file("xl/_rels/workbook.xml.rels", wbRels);
  }

  // ── 5. Clean xl/workbook.xml ──
  const wbFile = zip.file("xl/workbook.xml");
  if (wbFile) {
    let wb = await wbFile.async("string");
    // Remove <definedName> entries that reference external workbooks ([1], [2], etc.)
    wb = wb.replace(/<definedName[^>]*>.*?\[[\d]+\].*?<\/definedName>/g, "");
    // Remove empty <definedNames> wrapper
    wb = wb.replace(/<definedNames>\s*<\/definedNames>/g, "");

    // Strip unknown namespace declarations from the root element
    // Keep only the standard spreadsheetml namespace and the "r" (relationships) namespace
    wb = wb.replace(
      /(<workbook[^>]*?)(\s+xmlns:[a-z][a-z0-9]*="[^"]*")+/g,
      (match, prefix) => {
        // Extract all xmlns declarations
        const nsDecls = match.slice(prefix.length);
        // Keep only essential namespaces
        const kept = nsDecls.replace(
          /\s+xmlns:([a-z][a-z0-9]*)="([^"]*)"/g,
          (_m: string, nsPrefix: string, nsUri: string) => {
            const essential = [
              "r",           // relationships
              "mc",          // markup compatibility
            ];
            if (essential.includes(nsPrefix)) return _m;
            // Also keep the main spreadsheetml namespace
            if (nsUri.includes("spreadsheetml")) return _m;
            return "";
          }
        );
        return prefix + kept;
      }
    );

    // Strip mc:Ignorable attribute values for removed namespaces
    wb = wb.replace(
      /mc:Ignorable="[^"]*"/g,
      'mc:Ignorable=""'
    );

    zip.file("xl/workbook.xml", wb);
  }

  // ── 6. Clean worksheet rels ──
  for (const path of Object.keys(zip.files)) {
    if (path.match(/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/)) {
      const relFile = zip.file(path);
      if (relFile) {
        let relContent = await relFile.async("string");
        // Remove relationships to threadedComments, persons, slicers, timelines, namedSheetViews
        const sheetRelPatternsToRemove = [
          /threadedComment/,
          /persons/,
          /slicer/i,
          /timeline/i,
          /namedSheetView/i,
        ];
        relContent = relContent.replace(/<Relationship[^>]*\/>/g, (match) => {
          return sheetRelPatternsToRemove.some((p) => p.test(match)) ? "" : match;
        });
        zip.file(path, relContent);
      }
    }
  }

  // ── 7. Clean individual worksheet XML files ──
  // Remove extension elements (like <extLst>) that reference unknown namespaces
  for (const path of Object.keys(zip.files)) {
    if (path.match(/^xl\/worksheets\/sheet\d+\.xml$/)) {
      const sheetFile = zip.file(path);
      if (sheetFile) {
        let sheetContent = await sheetFile.async("string");

        // Remove <extLst>...</extLst> blocks (extension lists with custom namespaces)
        sheetContent = sheetContent.replace(/<extLst>[\s\S]*?<\/extLst>/g, "");

        // Strip unknown namespace declarations from the worksheet root element
        sheetContent = sheetContent.replace(
          /(<worksheet[^>]*?)(\s+xmlns:[a-z][a-z0-9]*="[^"]*")+/g,
          (match, prefix) => {
            const nsDecls = match.slice(prefix.length);
            const kept = nsDecls.replace(
              /\s+xmlns:([a-z][a-z0-9]*)="([^"]*)"/g,
              (_m: string, nsPrefix: string, nsUri: string) => {
                const essential = ["r", "mc"];
                if (essential.includes(nsPrefix)) return _m;
                if (nsUri.includes("spreadsheetml")) return _m;
                return "";
              }
            );
            return prefix + kept;
          }
        );

        // Strip mc:Ignorable
        sheetContent = sheetContent.replace(
          /mc:Ignorable="[^"]*"/g,
          'mc:Ignorable=""'
        );

        zip.file(path, sheetContent);
      }
    }
  }

  return await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
