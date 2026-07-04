import { createServer } from "node:http";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { buildEstimateOutputPlan } from "./server-paths.js";

const root = process.cwd();
const publicRoot = join(root, "public");
const port = Number(process.env.PORT || 4188);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", `http://${request.headers.host}`).pathname);
  if (request.method === "GET" && pathname === "/api/estimates/pdf/health") {
    writeJson(response, 200, { ok: true });
    return;
  }
  if (request.method === "POST" && pathname === "/api/estimates/pdf") {
    await handleEstimatePdfRequest(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/open-folder") {
    await handleOpenFolderRequest(request, response);
    return;
  }

  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  const rootPath = normalize(join(root, file));
  const publicPath = normalize(join(publicRoot, file));

  if (!rootPath.startsWith(root) || !publicPath.startsWith(publicRoot)) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }

  try {
    const body = await readFile(rootPath).catch(() => readFile(publicPath));
    const extension = extname(rootPath) || extname(publicPath);
    response.writeHead(200, { "content-type": types[extension] || "text/plain; charset=utf-8" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}`);
});

async function handleEstimatePdfRequest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const html = String(payload.html || "");
    if (html) {
      await handleEstimatePdfHtmlRequest(payload, response);
      return;
    }
    if (payload.quote) {
      await handleEstimatePdfDataRequest(payload, response);
      return;
    }
    writeJson(response, 400, { error: "PDF生成用データが空です。" });
  } catch (error) {
    writeJson(response, 500, { error: error instanceof Error ? error.message : "保存先フォルダを開けませんでした。" });
  }
}

async function handleEstimatePdfHtmlRequest(payload, response) {
  const html = String(payload.html || "");
  if (!html.includes("print-page")) {
    writeJson(response, 400, { error: "印刷用HTMLが空です。" });
    return;
  }

  const outputsDir = join(root, "outputs");
  await mkdir(outputsDir, { recursive: true });
  const baseName = sanitizeFileName(payload.fileName || `estimate-${Date.now()}`);
  const htmlName = `${baseName}.html`;
  const pdfName = `${baseName}.pdf`;
  const htmlPath = join(outputsDir, htmlName);
  const pdfPath = join(outputsDir, pdfName);
  const tempPdfPath = join(tmpdir(), pdfName);
  const userDataDir = join(tmpdir(), `takemoto-estimate-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  await mkdir(userDataDir, { recursive: true });
  await writeFile(htmlPath, html, "utf8");

  try {
    const edgePath = await findEdgeExecutable();
    await runEdgePdf(edgePath, `http://127.0.0.1:${port}/outputs/${encodeURIComponent(htmlName)}`, tempPdfPath, userDataDir);
    await waitForFile(tempPdfPath);
    await copyFile(tempPdfPath, pdfPath);

    writeJson(response, 200, {
      pdfUrl: `/outputs/${encodeURIComponent(pdfName)}`,
      htmlUrl: `/outputs/${encodeURIComponent(htmlName)}`,
      fileName: pdfName,
    });
  } catch (error) {
    if (!payload.quote) {
      throw error;
    }
    const fallbackBaseName = sanitizeFileName(`${baseName}-reportlab`);
    const fallbackPdfName = `${fallbackBaseName}.pdf`;
    const fallbackPdfPath = join(outputsDir, fallbackPdfName);
    const fallbackJsonPath = join(outputsDir, `${fallbackBaseName}.json`);
    await writeFile(fallbackJsonPath, JSON.stringify(payload), "utf8");
    await runReportLabPdf(fallbackJsonPath, fallbackPdfPath);
    writeJson(response, 200, {
      pdfUrl: `/outputs/${encodeURIComponent(fallbackPdfName)}`,
      htmlUrl: `/outputs/${encodeURIComponent(htmlName)}`,
      dataUrl: `/outputs/${encodeURIComponent(`${fallbackBaseName}.json`)}`,
      fileName: fallbackPdfName,
      fallback: "reportlab",
      warning: error instanceof Error ? error.message : "HTML/CSS PDF生成に失敗したためReportLabで生成しました。",
    });
  }
}

async function handleOpenFolderRequest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const folderPath = String(payload.folderPath || "");
    const desktopPath = await getWindowsDesktopPath();
    const estimatesRoot = resolve(desktopPath, "見積書");
    const resolvedFolder = resolve(folderPath);
    if (!resolvedFolder.startsWith(estimatesRoot)) {
      writeJson(response, 403, { error: "見積書フォルダ以外は開けません。" });
      return;
    }
    await access(resolvedFolder, constants.R_OK);
    await openFolder(resolvedFolder);
    writeJson(response, 200, { ok: true });
  } catch (error) {
    writeJson(response, 500, { error: error instanceof Error ? error.message : "保存先フォルダを開けませんでした。" });
  }
}

async function buildUniqueEstimateOutputPlan(desktopPath, quote) {
  const firstPlan = buildEstimateOutputPlan({ desktopPath, quote, existingPaths: new Set() });
  const existingPaths = new Set();
  for (let index = 0; index < 100; index += 1) {
    const plan = buildEstimateOutputPlan({ desktopPath, quote, existingPaths });
    const pdfExists = await pathExists(plan.pdfPath);
    const xlsxExists = await pathExists(plan.xlsxPath);
    if (!pdfExists && !xlsxExists) {
      return plan;
    }
    existingPaths.add(plan.pdfPath);
    existingPaths.add(plan.xlsxPath);
  }
  throw new Error(`保存先ファイル名を決定できませんでした: ${firstPlan.folderPath}`);
}

async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getWindowsDesktopPath() {
  return new Promise((resolveDesktop) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$desktop = [Environment]::GetFolderPath('Desktop'); if ([string]::IsNullOrWhiteSpace($desktop)) { $desktop = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders').Desktop; $desktop = [Environment]::ExpandEnvironmentVariables($desktop) }; $desktop",
    ]);
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => resolveDesktop(join(homedir(), "Desktop")));
    child.on("close", () => {
      const desktop = stdout.trim();
      resolveDesktop(desktop || join(homedir(), "Desktop"));
    });
  });
}

function openFolder(folderPath) {
  return new Promise((resolveOpen, reject) => {
    const child = spawn("explorer.exe", [folderPath], { windowsHide: false });
    child.on("error", reject);
    child.on("close", () => resolveOpen());
  });
}
async function handleEstimatePdfDataRequest(payload, response) {
  const outputsDir = join(root, "outputs");
  await mkdir(outputsDir, { recursive: true });
  const baseName = sanitizeFileName(payload.fileName || payload.quote?.quoteNumber || `estimate-${Date.now()}`);
  const jsonPath = join(outputsDir, `${baseName}.json`);
  const pdfName = `${baseName}.pdf`;
  const pdfPath = join(outputsDir, pdfName);
  await writeFile(jsonPath, JSON.stringify(payload), "utf8");
  if (payload.pdfEngine === "excel") {
    const desktopPath = await getWindowsDesktopPath();
    const outputPlan = await buildUniqueEstimateOutputPlan(desktopPath, payload.quote);
    await mkdir(outputPlan.folderPath, { recursive: true });
    const excelResult = await runExcelTemplatePdf(jsonPath, outputPlan.xlsxPath, outputPlan.pdfPath);
    writeJson(response, 200, {
      pdfUrl: pathToFileURL(outputPlan.pdfPath).href,
      xlsxUrl: pathToFileURL(outputPlan.xlsxPath).href,
      dataUrl: `/outputs/${encodeURIComponent(`${baseName}.json`)}`,
      fileName: `${outputPlan.fileBaseName}.pdf`,
      engine: "excel",
      sheetName: excelResult.sheetName,
      savedFolderPath: outputPlan.folderPath,
      pdfPath: outputPlan.pdfPath,
      xlsxPath: outputPlan.xlsxPath,
    });
    return;
  }
  await runReportLabPdf(jsonPath, pdfPath);
  writeJson(response, 200, {
    pdfUrl: `/outputs/${encodeURIComponent(pdfName)}`,
    dataUrl: `/outputs/${encodeURIComponent(`${baseName}.json`)}`,
    fileName: pdfName,
  });
}

async function runExcelTemplatePdf(inputPath, xlsxPath, pdfPath) {
  const fillResult = await runExcelTemplateFill(inputPath, xlsxPath);
  await runExcelPdfExport(xlsxPath, pdfPath, fillResult.sheetName);
  return fillResult;
}

function runExcelTemplateFill(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(findPythonExecutable(), [join(root, "scripts", "fill-estimate-excel-template.py"), inputPath, outputPath], {
      cwd: root,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr || `Excelテンプレートへの流し込みに失敗しました。code=${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim() || "{}");
        resolve({ sheetName: parsed.sheet || "裕吏建設" });
      } catch {
        resolve({ sheetName: "裕吏建設" });
      }
    });
  });
}

function runExcelPdfExport(xlsxPath, pdfPath, sheetName) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(root, "scripts", "export-estimate-excel-pdf.ps1"),
      "-WorkbookPath",
      xlsxPath,
      "-PdfPath",
      pdfPath,
      "-SheetName",
      sheetName || "裕吏建設",
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr || `ExcelからPDFへの出力に失敗しました。code=${code}`));
        return;
      }
      resolve();
    });
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error("送信データが大きすぎます。"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("JSONを読み取れませんでした。"));
      }
    });
    request.on("error", reject);
  });
}

function writeJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sanitizeFileName(value) {
  const cleaned = String(value)
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return cleaned || `estimate-${Date.now()}`;
}

async function findEdgeExecutable() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next standard Windows install path.
    }
  }
  throw new Error("Microsoft Edge が見つからないためPDFを生成できません。");
}

function runEdgePdf(edgePath, url, outputPath, userDataDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(edgePath, [
      "--headless=new",
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--no-first-run",
      "--print-to-pdf-no-header",
      `--user-data-dir=${userDataDir}`,
      `--print-to-pdf=${outputPath}`,
      url,
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr || `PDF生成プロセスが失敗しました。code=${code}`));
        return;
      }
      resolve();
    });
  });
}

function runReportLabPdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(findPythonExecutable(), [join(root, "scripts", "generate-estimate-pdf.py"), inputPath, outputPath]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr || `PDF生成スクリプトが失敗しました。code=${code}`));
        return;
      }
      resolve();
    });
  });
}

function findPythonExecutable() {
  return join(
    process.env.USERPROFILE || "C:\\Users\\takem",
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "python",
    "python.exe",
  );
}

async function waitForFile(filePath) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await access(filePath, constants.R_OK);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("PDFファイルが作成されませんでした。");
}
