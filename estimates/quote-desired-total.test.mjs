import assert from "node:assert/strict";
import test from "node:test";

import { calculateRoundingAdjustmentForDesiredTotal } from "./quote-core.js";

test("希望税込着地額から端数調整を逆算する", () => {
  const rounding = calculateRoundingAdjustmentForDesiredTotal({
    items: [{ quantity: 1, unitPrice: 100000 }],
    discount: 0,
    desiredTotalWithTax: 100000,
    taxRate: 0.1,
  });

  assert.equal(rounding, 10000);
});

test("希望税込着地額が現在の税込額以上なら端数調整は0円にする", () => {
  const rounding = calculateRoundingAdjustmentForDesiredTotal({
    items: [{ quantity: 1, unitPrice: 100000 }],
    discount: 0,
    desiredTotalWithTax: 120000,
    taxRate: 0.1,
  });

  assert.equal(rounding, 0);
});
