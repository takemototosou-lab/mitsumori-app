import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import {
  buildEstimateOutputPlan,
  sanitizeWindowsPathPart,
} from "./server-paths.js";

const desktop = "C:\\Users\\user\\OneDrive\\Desktop";

const quote = {
  recipientType: "company",
  recipientName: "ワンベスト株式会社 御中",
  quoteNumber: "TKM-2026-003",
  subject: "外壁塗装工事",
  siteName: "奈良/橿原:現場",
  issueDate: "2026-07-05",
};

test("Windowsで使えない文字を保存名から除外する", () => {
  assert.equal(sanitizeWindowsPathPart('A/B\\C:D*E?F"G<H>I|J'), "A_B_C_D_E_F_G_H_I_J");
  assert.equal(sanitizeWindowsPathPart(" 御中 "), "御中");
  assert.equal(sanitizeWindowsPathPart("..."), "未設定");
});

test("会社宛の見積をデスクトップ見積書配下へ整理する", () => {
  const plan = buildEstimateOutputPlan({ desktopPath: desktop, quote, existingPaths: new Set() });

  assert.equal(plan.category, "法人");
  assert.equal(plan.year, "2026");
  assert.equal(plan.folderPath, join(desktop, "見積書", "法人", "ワンベスト株式会社", "2026"));
  assert.equal(plan.pdfPath, join(plan.folderPath, "TKM-2026-003_外壁塗装工事_見積書.pdf"));
  assert.equal(plan.xlsxPath, join(plan.folderPath, "TKM-2026-003_外壁塗装工事_見積書.xlsx"));
});

test("個人宛の見積は個人フォルダに保存する", () => {
  const plan = buildEstimateOutputPlan({
    desktopPath: desktop,
    quote: { ...quote, recipientType: "person", recipientName: "田中太郎 様", subject: "", siteName: "屋根塗装工事" },
    existingPaths: new Set(),
  });

  assert.equal(plan.category, "個人");
  assert.equal(plan.folderPath, join(desktop, "見積書", "個人", "田中太郎", "2026"));
  assert.equal(plan.pdfPath, join(plan.folderPath, "TKM-2026-003_屋根塗装工事_見積書.pdf"));
});

test("同名ファイルがある場合は再出力連番を付ける", () => {
  const first = buildEstimateOutputPlan({ desktopPath: desktop, quote, existingPaths: new Set() });
  const second = buildEstimateOutputPlan({
    desktopPath: desktop,
    quote,
    existingPaths: new Set([first.pdfPath, first.xlsxPath]),
  });

  assert.equal(second.pdfPath, join(second.folderPath, "TKM-2026-003_外壁塗装工事_見積書_再出力1.pdf"));
  assert.equal(second.xlsxPath, join(second.folderPath, "TKM-2026-003_外壁塗装工事_見積書_再出力1.xlsx"));
});
