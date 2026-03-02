import JSZip from "jszip";

/**
 * Clean an Excel file by removing problematic XML parts that cause
 * "Unknown Namespace" errors in browser-based xlsx parsing.
 *
 * Microsoft 365 Excel files often contain:
 * - External links (externalLink*.xml)
 * - Custom XML parts (customXml/)
 * - Document metadata (docMetadata/)
 * - Threaded comments
 * - Sensitivity labels
 *
 * These use namespaces that the browser's DOMParser doesn't recognize,
 * causing xlsx to throw "Unknown Namespace" errors. This function
 * strips those parts from the ZIP archive while preserving the
 * actual spreadsheet data.
 */
export async function cleanExcelFile(data: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(data);

  // Parts to remove - these cause namespace errors in browser xlsx
  const partsToRemove = [
    /^customXml\//,
    /^docMetadata\//,
    /^xl\/externalLinks\//,
    /^xl\/threadedComments\//,
    /^xl\/persons\//,
  ];

  // Remove problematic parts
  for (const path of Object.keys(zip.files)) {
    if (partsToRemove.some((pattern) => pattern.test(path))) {
      zip.remove(path);
    }
  }

  // Clean [Content_Types].xml to remove references to deleted parts
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    // Remove Override entries for deleted paths
    ct = ct.replace(/<Override[^>]*PartName="\/customXml[^"]*"[^>]*\/>/g, "");
    ct = ct.replace(/<Override[^>]*PartName="\/docMetadata[^"]*"[^>]*\/>/g, "");
    ct = ct.replace(/<Override[^>]*PartName="\/xl\/externalLinks[^"]*"[^>]*\/>/g, "");
    ct = ct.replace(/<Override[^>]*PartName="\/xl\/threadedComments[^"]*"[^>]*\/>/g, "");
    ct = ct.replace(/<Override[^>]*PartName="\/xl\/persons[^"]*"[^>]*\/>/g, "");
    zip.file("[Content_Types].xml", ct);
  }

  // Clean _rels/.rels to remove references to deleted parts
  const relsFile = zip.file("_rels/.rels");
  if (relsFile) {
    let rels = await relsFile.async("string");
    rels = rels.replace(/<Relationship[^>]*Target="customXml[^"]*"[^>]*\/>/g, "");
    rels = rels.replace(/<Relationship[^>]*Target="docMetadata[^"]*"[^>]*\/>/g, "");
    zip.file("_rels/.rels", rels);
  }

  // Clean xl/_rels/workbook.xml.rels to remove external link references
  const wbRelsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (wbRelsFile) {
    let wbRels = await wbRelsFile.async("string");
    wbRels = wbRels.replace(/<Relationship[^>]*Target="externalLinks[^"]*"[^>]*\/>/g, "");
    zip.file("xl/_rels/workbook.xml.rels", wbRels);
  }

  // Clean xl/workbook.xml to remove external references
  const wbFile = zip.file("xl/workbook.xml");
  if (wbFile) {
    let wb = await wbFile.async("string");
    // Remove <definedNames> entries that reference external workbooks (contain [1], [2], etc.)
    wb = wb.replace(/<definedName[^>]*>.*?\[[\d]+\].*?<\/definedName>/g, "");
    // Remove empty <definedNames> wrapper if all entries were removed
    wb = wb.replace(/<definedNames>\s*<\/definedNames>/g, "");
    zip.file("xl/workbook.xml", wb);
  }

  // Clean worksheet rels to remove comment references for deleted threadedComments
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

  return await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
