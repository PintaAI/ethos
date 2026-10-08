# Ethos sync candidate — 3 October 2026

Implementation is complete in both working trees. Validation: **52 mobile tests + 10 server PostgreSQL tests + 1 cross-repo end-to-end test passed**, with no failures. Mobile/server TypeScript checks, targeted ESLint, native Android/iOS exports, Expo config, and the isolated server production build passed. Full mobile lint reports six existing warnings in unrelated files, with zero errors. Migration SQL backfill, subsequent revision capture and the parent index also passed against a second disposable PG16 database. An iOS development EAS build completed successfully; details below. At the initial 3 October checkpoint, no production database migration, server deployment, production native build, store submission or OTA publication had been performed. The authorized 8 October commit/deployment work is recorded below.

## Backend rollout — 8 October 2026

The user authorized committing and pushing both repositories and applying the server database migration. Backend commit `6c3ad1f` was pushed to `PintaAI/cashflow-notion` branch `master`, the production branch linked to the Vercel `cashflow-notion` project. Client commit `0272bea` was pushed to `PintaAI/ethos` branch `main`, together with its two previously unpushed commits. All existing tracked changes and new sync files were included, following the backend repository's commit instructions. The client release includes the existing UI/notification changes already present in the successful development build. Git push does not publish an EAS OTA update.

`ETHOS_SYNC_V2_ENABLED=false` was added to the Vercel Production environment before the push. Keep v2 disabled until authenticated v1/v2 and device checks are completed; the legacy endpoint remains available. Environment changes affect new deployments.

Current verification passed: **52 mobile sync/migration tests**, mobile/server TypeScript, **8 server API-contract/recurrence tests**, Expo config (SDK 57, app/runtime policy 1.1.7), and the server production build. Mobile lint has the same six existing warnings and zero errors. The 10 PostgreSQL integration tests and cross-repository E2E results above are from the earlier isolated validation, not a new production run.

The backend `.env` points to Neon `ep-misty-feather-aoi5co6z` / `neondb`, PostgreSQL **17.11**. Before rollout its six historical migrations were completed with no unresolved failures; only `20261002140000_sync_revisions` was pending. A full PostgreSQL 17 custom-format backup was created at `/tmp/ethos-release-20261008-backup/server-before-sync-v2.dump` (593,817 bytes, 208 TOC entries) and its TOC was checked. Credentials and backup data are outside both repositories; the local backup is not a permanent off-host backup.

Vercel's Production database variables are marked sensitive and cannot be read back; CLI environment pull returns empty values. The user explicitly confirmed that the configured Neon database is the production target. `bunx prisma migrate deploy` then applied `20261002140000_sync_revisions` successfully, and `bunx prisma migrate status` reports the database up to date. No historical migration was modified or marked applied. Post-migration queries verified **161 domain entities / 161 backfilled changes**, **126 wallets / 126 wallet revision rows**, all **5 capture triggers** enabled, the parent sync index present, **0** entities missing history and **0** inconsistent revision watermarks.

Production [deployment `dpl_5bvypnQVBZAafD3YfpdDxWGakf6o`](https://cashflow-notion-9n8o0q0s3-pintabots-projects.vercel.app) is **READY** at backend commit `6c3ad1f3986006255d50c4cebe41e2f060d7ebc9` and is aliased to `https://cashflow-notion.vercel.app`. Unauthenticated production smoke checks return the expected **401** for capabilities, manifest, v1 LifeFlow sync, v2 LifeFlow sync, entries and managements. These verify route availability and the authentication boundary; they do not exercise logged-in production sync. Keep the v2 switch disabled until authenticated client checks are completed. No production native build, store submission or OTA publication was performed during this rollout.

## SDK 56 iOS development build (superseded)

[EAS build 2808566d-5c7d-4727-aaa5-62c72fbc9865](https://expo.dev/accounts/rorez/projects/ethos/builds/2808566d-5c7d-4727-aaa5-62c72fbc9865) finished successfully on 3 October 2026 at 02:10:59 UTC, with an installable artifact. Cloud metadata confirms app version **1.1.6**, runtime **1.1.6**, build number **20**, profile `development`, internal distribution and channel `development`. The source archive includes the current sync implementation and excludes generated local `ios/` and `android/` directories. It includes the current working tree's existing notification/UI changes. This is a dev-client build; use `npm run dev` for the development server. It does not replace the production native baseline or installed-device upgrade checks.

The cloud worker's Expo Doctor passed 20 of 22 checks. It reported 19 dependency patch mismatches and the SDK 56 Hermes memory regression affecting apps that import `react-native-worklets` or `react-native-reanimated`, both present here. Native compilation nevertheless completed. That SDK 56 artifact has been superseded by the SDK 57 candidate below. See [Expo SDK 57 known regressions](https://expo.dev/changelog/sdk-57#known-regressions).

## SDK 57 replacement candidate

The user's follow-up requested resolving those findings before release. Dependencies are now aligned to stable Expo **57.0.26**, React Native **0.86.3**, Reanimated **4.5.1**, Worklets **0.10.1** and the SDK-compatible Expo modules. React remains 19.2.3. The installed React Native Hermes marker is `hermes-v0.17.0`, beyond the first fixed v0.16 release. Expo's install command also registered the `expo-font`, `expo-image` and `expo-status-bar` config plugins. No experimental Worklets bundle workaround is enabled.

The replacement app/runtime is **1.1.7**, isolating this native SDK upgrade from both production runtime1.1.5 and the SDK 56 development runtime1.1.6. All iOS EAS profiles pin `macos-tahoe-26.5-xcode-26.6`, the documented SDK 57 image, to keep the compiler environment consistent. Xcode 27's scene lifecycle opt-in is outside this upgrade; do not change that image without checking Expo's scene requirements. See [EAS build infrastructure](https://docs.expo.dev/build-reference/infrastructure/) and [Expo SDK 57](https://expo.dev/changelog/sdk-57).

Post-upgrade validation: **Expo Doctor 21/21 passed**, all **52 mobile sync/migration tests passed**, TypeScript passed, native iOS/Android exports passed, and lint has zero errors with the same six existing warnings. The inspected EAS source archive includes the current sync/migration/widget plugin files and excludes generated native directories. These checks verify dependency alignment and regression coverage; they do not measure memory or startup time on a physical device. Device profiling and upgrade smoke tests remain part of the production sequence.

[Replacement iOS development build 548facab-256b-41db-be67-2e684bac0151](https://expo.dev/accounts/rorez/projects/ethos/builds/548facab-256b-41db-be67-2e684bac0151) **finished successfully** on 3 October 2026 at **09:21:16 UTC**, with an installable artifact. It uses profile `development`, internal distribution and channel `development`. Cloud metadata confirms app/runtime **1.1.7**, build number **20**, and its own Expo Doctor passed **21/21**. Native compilation, signing and artifact upload completed without error. Install this replacement instead of the SDK 56 artifact above, then use `npm run dev` for the dev-client development server. Physical-device memory/startup and data-upgrade checks are still required before production rollout.

## Behavior and measured local checks

- LifeFlow v2 persists dirty keys in the same SQLite transaction as domain writes. A prepared mutation survives network failure/restart with its original ID. ACKs remove only the captured version. Server receipts and writes commit together; reuse of an identity for another payload is rejected.
- Server revisions are distinct from device timestamps. Current-base edits may have equal or older timestamps; concurrent edits retain the previous LWW rule. PG revision allocation holds a per-user row lock until commit. API v1/v2 and MCP validation/write share an account transaction lock.
- Pull pages retain a fixed upper revision. Epoch reset clears stale remote versions and deferred inbox rows while retaining the local outbox. SQLite commits remote rows, deferred child rows and cursor together. Bootstrap sends parents first; dirty local overlays keep downloaded rows in an inbox until they can be applied.
- Metadata manifests cover the category/quick-fill/budget/recurring fields persisted by mobile. PG triggers cover SQL, API, actions and MCP writes, including move/delete. Usage counts in the detailed category response are not cached domain fields. SQLite writes invalidate matching cache tokens, including writes made by a compatible older bundle.
- Legacy endpoints remain available. Missing capability endpoint (404/405) falls back to v1. Authentication/network/server errors remain errors. `ETHOS_SYNC_V2_ENABLED=false` advertises v1 and disables the new endpoints; it does not discard client queues or server receipts.
- Local test: 10,000 clean item rows send **0 mutations**; exactly two edits send **2**, followed by **0** on the next no-op. This measures mutation count, not device latency or bytes. Metadata test: first pull uses **4 lists**, unchanged manifest uses **0**, category-only revision uses **1**.
- Two real SQLite clients converge through the candidate server and isolated PostgreSQL after a lost response, a backdated current-base edit, habit-log creation, parent/child deletion, and no-op sync. New routes are tested with a substituted session boundary and real wallet membership queries; live cookie authentication is not exercised by that fixture.

## Migration and runtime boundary

The finished production iOS build 20 embeds schema20 at commit `ae3fdf0`, runtime1.1.5. Old schema24/25 migrations in this repository removed its tables/data. The legacy embedded repository still cannot read personal LifeFlow tables after upgrade. A new migration runner cannot change that embedded bundle.

The candidate version is **1.1.7**, retaining `runtimeVersion.policy=appVersion`. This intentionally requires a new native baseline for both the persistent-state compatibility boundary and the SDK 57 upgrade. **Never publish this candidate with runtime1.1.5 or runtime1.1.6.** Expo chooses updates by runtime; verify the resolved version in the actual EAS artifact, especially because app version source is remote and native generated directories may be stale. See [Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/) and [error recovery](https://docs.expo.dev/eas-update/error-recovery/).

Upgrade from legacy schema20 preserves ordinary habit definitions and eligible completion history, timeboxes as events, scoped modern items/logs/exceptions, journal opt-in, and canonical merged system history. Exact original rows, including presets, completed/dismissed timebox status, relationships, and history incompatible with the modern recurrence rule, remain in an atomic local archive. Profile offers **Export Previous LifeFlow Data** on iOS/Android. Preset rules are archived rather than activated under different overlap semantics. Previously erased data cannot be recovered from an empty database without another backup/cloud copy.

Schema21/22/24/25/27 migrations now commit their version marker with their transaction where applicable. Actual personal/scoped item layout is inspected if an old runner lowered the marker. Concurrent startup migrators recheck the committed version inside the transaction before replacing tables. The additive sync initializer has its own idempotent metadata marker. Logout/account clearing includes all queues, cursors, cache tokens and archive rows.

Automated fixture tests use the exact production schema20 runner, direct upgrade, injected conversion failure/retry, lowered marker, canonical legacy system IDs, and SQLite integrity/foreign-key checks. They do not prove the old embedded repository can run against the modern schema; runtime isolation prevents that OTA combination.

## Production sequence

1. Review both working trees and select the exact release changes. Preserve existing notification/UI work intentionally. Take a database backup and inspect `bunx prisma migrate status` on the deployment database before migration. Do not use `db push` as a replacement for the revision migration: it does not install the capture triggers/backfill.
2. Apply server migration `20261002140000_sync_revisions`, generate Prisma client and deploy the backward-compatible server with `ETHOS_SYNC_V2_ENABLED=false` initially. Standard command is `bunx prisma migrate deploy` after checking migration history. Fresh replay of the repository's older migration chain currently fails in the pre-existing `20260805133100_remove_revenuecat`; reconcile the actual deployment history before running that command. The new additive SQL was tested independently against the existing schema. Do not edit or mark historical migrations applied blindly.
3. Verify authenticated capability account identity, wallet membership rejection, both sync endpoints, migration triggers, and a legacy client. Enable v2 on staging; after validation enable the server switch in production.
4. Build/distribute a **1.1.7** preview baseline from the reviewed tree. Verify the artifact's runtime is1.1.7 and its embedded bundle includes this migration runner and SDK 57. Test actual installed iOS and Android data upgrades, offline startup, logout/login, background expiration and convergence before store rollout. Profile memory and development startup on a physical device to verify the Hermes fix in this app. No production device baseline was available for those checks in this session.
5. Create production native builds for that baseline, then distribute through the stores. Subsequent OTA updates may target1.1.7 only after compatible persistent-state checks. Review dirty/untracked files immediately before `eas update`; EAS exports the current working tree. A production rollout percentage is a distribution choice after device checks, not a substitute for them.
6. Monitor startup/migration crashes, sync issue areas, pending age, receipt growth, revision/cursor resets and convergence. No queue/receipt TTL is introduced. Long-lived change history requires a future epoch/compaction design; keep it until then. If v2 fails, disable the server switch and fix forward. Do not rollback to the schema20 bundle.

## Reproducible validation

Mobile:

```sh
npm run test:sync
npx tsc --noEmit
npm run lint
npx expo config --json
npx expo export --platform android --output-dir /tmp/ethos-sync-android
npx expo export --platform ios --output-dir /tmp/ethos-sync-ios
```

The test runner runs suites in separate Bun processes to isolate transport mocks. It uses real in-memory SQLite. Native exports are bundle checks, not native device/build tests.

Server:

```sh
bunx prisma generate
bun node_modules/typescript/bin/tsc --noEmit
bun run build
```

Bun-only test files are excluded from the Next production TypeScript project; execute them with Bun. `lib/lifeflow/incremental.test.ts` skips unless `DATABASE_URL` points to the isolated fixture `127.0.0.1:55439/ethos_sync_test`. Create that disposable PG16 database from the pre-migration schema, apply the new migration SQL, then run with explicit `DATABASE_URL` and `DIRECT_URL`. Never use production credentials for fixtures.

For the cross-repo transport test, start server `scripts/sync-e2e-fixture.ts` with those fixture URLs. In Ethos run `ETHOS_SYNC_E2E=1 bun test tests/syncProtocol.e2e.test.ts`. The fixture writes its ephemeral loopback URL to `/tmp/ethos-sync-e2e-url.json` and removes its test user on stop/cleanup. It replaces only the API error helper and accepts no public traffic; it is not a deployment server.
