// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import { canDeleteUnreferencedWalletTheme, walletThemeSlug } from "./onboardingWallet.ts";

test("wallet themes use a stable wallet id slug", () => {
  assert.equal(walletThemeSlug("Management_ABC 123"), "wallet-management-abc-123");
});

test("only unreferenced custom wallet themes can be deleted", () => {
  const referenced = [{ id: "other", imageTheme: { themeSlug: "legacy" } }];
  assert.equal(canDeleteUnreferencedWalletTheme("default", "current", [], ["legacy"]), false);
  assert.equal(canDeleteUnreferencedWalletTheme("legacy", "current", referenced, ["legacy"]), false);
  assert.equal(canDeleteUnreferencedWalletTheme("legacy", "current", [], ["legacy"]), true);
});
