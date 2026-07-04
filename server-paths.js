import { join } from "node:path";

export function buildEstimateOutputPlan({ desktopPath, quote = {}, existingPaths = new Set() }) {
  const category = quote.recipientType === "person" ? "個人" : "法人";
  const recipient = sanitizeWindowsPathPart(removeRecipientHonorific(quote.recipientName || "宛名未設定"));
  const year = getIssueYear(quote.issueDate);
  const quoteNumber = sanitizeWindowsPathPart(quote.quoteNumber || "見積番号未設定");
  const title = sanitizeWindowsPathPart(quote.subject || quote.siteName || "件名未設定");
  const folderPath = join(desktopPath, "見積書", category, recipient, year);
  const baseName = `${quoteNumber}_${title}_見積書`;
  const uniqueBaseName = makeUniqueBaseName(folderPath, baseName, existingPaths);

  return {
    category,
    year,
    folderPath,
    pdfPath: join(folderPath, `${uniqueBaseName}.pdf`),
    xlsxPath: join(folderPath, `${uniqueBaseName}.xlsx`),
    fileBaseName: uniqueBaseName,
  };
}

export function sanitizeWindowsPathPart(value) {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return cleaned || "未設定";
}

export function removeRecipientHonorific(value) {
  return String(value || "")
    .replace(/\s*(御中|様|樣|殿)\s*$/u, "")
    .trim();
}

export function getIssueYear(issueDate, fallbackDate = new Date()) {
  const match = String(issueDate || "").match(/^(\d{4})/);
  return match ? match[1] : String(fallbackDate.getFullYear());
}

function makeUniqueBaseName(folderPath, baseName, existingPaths) {
  let candidate = baseName;
  let index = 1;
  while (existingPaths.has(join(folderPath, `${candidate}.pdf`)) || existingPaths.has(join(folderPath, `${candidate}.xlsx`))) {
    candidate = `${baseName}_再出力${index}`;
    index += 1;
  }
  return candidate;
}
