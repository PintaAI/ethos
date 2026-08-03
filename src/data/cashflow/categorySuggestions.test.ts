// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEntryName, rankCategories, recencyWeight, suggestCategoryFromNote } from "./categorySuggestions.ts";

const today = "2026-07-25";

test("recency weighting includes the 30 and 90 day boundaries", () => {
  assert.equal(recencyWeight("2026-06-25", today), 3);
  assert.equal(recencyWeight("2026-06-24", today), 2);
  assert.equal(recencyWeight("2026-04-26", today), 2);
  assert.equal(recencyWeight("2026-04-25", today), 1);
  assert.equal(recencyWeight("not-a-date", today), 1);
  assert.equal(recencyWeight(today, "not-a-date"), 1);
});

test("ranking uses score, recency, name, then id and leaves unused categories last", () => {
  const categories = [
    { id: "z", name: "Zoo" }, { id: "b", name: "Bills" }, { id: "a", name: "Bills" }, { id: "f", name: "Food" },
  ];
  const history = [
    { categoryId: "z", name: "Old", date: "2026-01-01", createdAt: "2026-01-01T00:00:00Z", personalWeight: 1 },
    { categoryId: "f", name: "Lunch", date: today, createdAt: "2026-07-25T01:00:00Z", personalWeight: 0.25 },
  ];
  assert.deepEqual(rankCategories(categories, history, today).map((item) => item.id), ["z", "f", "a", "b"]);
});

test("normalization and exact matching ignore case, punctuation, and whitespace", () => {
  assert.equal(normalizeEntryName("  Café---LATTE!! "), "cafe latte");
  const history = [{ categoryId: "food", name: "Cafe latte", date: today, createdAt: "2026-07-25T00:00:00Z", personalWeight: 1 }];
  assert.equal(suggestCategoryFromNote("CAFÉ, latte", history, today), "food");
});

test("individual meaningful words match a longer historical note regardless of case", () => {
  const history = [{ categoryId: "social", name: "Kondangan ke keluarga", date: today, createdAt: "2026-07-25T00:00:00Z", personalWeight: 1 }];
  assert.equal(suggestCategoryFromNote("kondangan", history, today), "social");
  assert.equal(suggestCategoryFromNote("KELUARGA", history, today), "social");
});

test("common connector words do not become category signals", () => {
  const history = [{ categoryId: "social", name: "Kondangan ke keluarga", date: today, createdAt: "2026-07-25T00:00:00Z", personalWeight: 1 }];
  assert.equal(suggestCategoryFromNote("ke", history, today), null);
});

test("conflicting exact history is low confidence when support ties", () => {
  const history = [
    { categoryId: "food", name: "Market", date: today, createdAt: "2026-07-25T00:00:00Z", personalWeight: 1 },
    { categoryId: "shopping", name: "market", date: today, createdAt: "2026-07-25T00:00:00Z", personalWeight: 1 },
  ];
  assert.equal(suggestCategoryFromNote("market", history, today), null);
});
