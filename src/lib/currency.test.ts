// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import { formatCurrencyAmount, SUPPORTED_CURRENCIES } from "./currency.ts";

test("compact IDR keeps one decimal for non-whole units", () => {
  assert.equal(formatCurrencyAmount(1_173_000, "IDR", { compact: true }), "Rp1,2 jt");
  assert.equal(formatCurrencyAmount(1_100_000, "IDR", { compact: true }), "Rp1,1 jt");
  assert.equal(formatCurrencyAmount(1_250, "IDR", { compact: true }), "Rp1,3 rb");
  assert.equal(formatCurrencyAmount(-1_173_000, "IDR", { compact: true }), "-Rp1,2 jt");
});

test("compact IDR omits decimals for whole units", () => {
  assert.equal(formatCurrencyAmount(1_000_000, "IDR", { compact: true }), "Rp1 jt");
});

test("compact formatting keeps fractional information for every currency", () => {
  for (const currency of SUPPORTED_CURRENCIES) {
    const whole = formatCurrencyAmount(1_000_000, currency.code, { compact: true });
    const fractional = formatCurrencyAmount(1_173_000, currency.code, { compact: true });

    assert.notEqual(fractional, whole, `${currency.code} should not round 1,173,000 to 1 million`);
  }
});
