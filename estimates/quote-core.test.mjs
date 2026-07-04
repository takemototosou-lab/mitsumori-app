import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateLineAmount,
  calculateTotals,
  createBlankContact,
  createRevisionQuote,
  createRevisionNumber,
  getDefaultCompany,
  getDefaultContactTitle,
  normalizeQuotePrefix,
  duplicateQuote,
  generateNextQuoteNumber,
} from "./quote-core.js";

test("数量と単価から明細金額を計算する", () => {
  assert.equal(calculateLineAmount({ quantity: 12.5, unitPrice: 2400 }), 30000);
});

test("数量または単価が未入力なら明細金額はnullにする", () => {
  assert.equal(calculateLineAmount({ quantity: "", unitPrice: 2400 }), null);
  assert.equal(calculateLineAmount({ quantity: 2, unitPrice: "" }), null);
});

test("複数明細、値引き、消費税、端数調整から税込合計を計算する", () => {
  const totals = calculateTotals({
    items: [
      { quantity: 2, unitPrice: 10000 },
      { quantity: 3, unitPrice: 5000 },
      { quantity: "", unitPrice: 1000 },
    ],
    discount: 5000,
    roundingAdjustment: 200,
    taxRate: 0.1,
  });

  assert.deepEqual(totals, {
    subtotalBeforeDiscount: 35000,
    discount: 5000,
    taxableSubtotal: 30000,
    tax: 3000,
    roundingAdjustment: 200,
    totalWithTax: 32800,
  });
});

test("見積番号を年別に連番採番する", () => {
  const next = generateNextQuoteNumber(
    [{ quoteNumber: "TKM-2026-001" }, { quoteNumber: "TKM-2026-001-R1" }, { quoteNumber: "TKM-2025-009" }],
    new Date("2026-06-24T00:00:00+09:00"),
  );

  assert.equal(next, "TKM-2026-002");
});

test("見積番号は会社設定の接頭辞で採番できる", () => {
  const next = generateNextQuoteNumber(
    [{ quoteNumber: "ABC-2026-009" }, { quoteNumber: "TKM-2026-999" }],
    new Date("2026-06-24T00:00:00+09:00"),
    "abc",
  );

  assert.equal(next, "ABC-2026-010");
});

test("宛先区分ごとの敬称初期値を返す", () => {
  assert.equal(getDefaultContactTitle("company"), "御中");
  assert.equal(getDefaultContactTitle("person"), "様");
  assert.equal(createBlankContact("person").title, "様");
});

test("会社情報の既定値と見積番号接頭辞を正規化する", () => {
  assert.equal(getDefaultCompany().quotePrefix, "TKM");
  assert.equal(normalizeQuotePrefix(" tkm-osa_ka "), "TKM-OSAKA");
  assert.equal(normalizeQuotePrefix(""), "TKM");
});

test("提出済み見積は修正版番号を作る", () => {
  assert.equal(createRevisionNumber("TKM-2026-001", []), "TKM-2026-001-R1");
  assert.equal(createRevisionNumber("TKM-2026-001", [{ quoteNumber: "TKM-2026-001-R1" }]), "TKM-2026-001-R2");
});

test("複製では番号と発行日を更新し、値引きと端数調整を0円に戻す", () => {
  const duplicate = duplicateQuote(
    {
      quoteNumber: "TKM-2026-001",
      issueDate: "2026-06-01",
      status: "submitted",
      discount: 1000,
      roundingAdjustment: 50,
      items: [{ description: "外壁塗装", quantity: 1, unitPrice: 100000 }],
    },
    "TKM-2026-002",
    "2026-06-24",
  );

  assert.equal(duplicate.quoteNumber, "TKM-2026-002");
  assert.equal(duplicate.issueDate, "2026-06-24");
  assert.equal(duplicate.status, "draft");
  assert.equal(duplicate.discount, 0);
  assert.equal(duplicate.roundingAdjustment, 0);
  assert.deepEqual(duplicate.items, [{ description: "外壁塗装", quantity: 1, unitPrice: 100000 }]);
});

test("修正版では番号と発行日を更新し、値引きと端数調整は維持する", () => {
  const revision = createRevisionQuote(
    {
      quoteNumber: "TKM-2026-001",
      issueDate: "2026-06-01",
      status: "submitted",
      discount: 1000,
      roundingAdjustment: 50,
      items: [{ description: "外壁塗装", quantity: 1, unitPrice: 100000 }],
    },
    "TKM-2026-001-R1",
    "2026-06-24",
  );

  assert.equal(revision.quoteNumber, "TKM-2026-001-R1");
  assert.equal(revision.issueDate, "2026-06-24");
  assert.equal(revision.status, "draft");
  assert.equal(revision.discount, 1000);
  assert.equal(revision.roundingAdjustment, 50);
});
