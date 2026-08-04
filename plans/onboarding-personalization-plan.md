# Onboarding Personalization Plan

Status: reviewed against the current Expo Router, auth, local database, theme, and sync implementation.

## Goal

Turn onboarding into a short setup flow that prepares a user to use Ethos:

1. Choose Cashflow cloud backup or fully local operation with accurate copy.
2. Create the first wallet, or edit the active wallet when onboarding is reopened.
3. Optionally choose a wallet image that becomes the app theme.
4. Optionally build one or more small recurring habits inspired by Atomic Habits.

The first version does not add a native dependency. Image compression is out of scope; unsupported or oversized images are rejected before use.

## Product Scope

### Cloud mode

- Authentication is required.
- `cloudSyncEnabled` is set to `true` when onboarding completes.
- Only Cashflow data and wallet images are promised as cloud-backed.
- Personal Growth data remains local in this version.

### Offline mode

- Authentication is not required.
- `cloudSyncEnabled` is set to `false` when onboarding completes.
- All data remains on the current device and is not cloud-backed.
- If an already-authenticated user reopens onboarding and chooses offline, the session is not destructively signed out; cloud synchronization is disabled.

### Non-goals

- No Personal Growth cloud synchronization.
- No image compression or HEIC/HEIF transcoding.
- No exact recurring time for habits. The initial habit schedule supports weekdays only.
- No changes to existing system habits (`App check-in` and `Daily Journal`).

## Final Flow

```text
Introduction slides (3)
  -> Get Started
  -> Storage choice
      -> Cloud backup
          -> Sign in, unless already authenticated
          -> Wallet Setup
      -> Fully offline
          -> Wallet Setup
  -> Build One Tiny Habit (skippable)
  -> Persist selected sync mode and onboarding completion
  -> /home
```

Cloud authentication happens before wallet setup. This keeps the "Sign in" action truthful and allows cancellation to return to onboarding without partially marking onboarding as complete.

### Cloud authentication return

- Open `/auth?returnTo=onboarding-wallet`.
- Extend `auth.tsx` so a successful sign-in with this return target replaces the route with `/(onboarding)/wallet-setup?mode=cloud`.
- If authentication is cancelled, return to onboarding and do not change `hasSkippedOnboarding` or `cloudSyncEnabled`.
- If the user is already authenticated, skip the auth form and go directly to Wallet Setup.

### Completion state

`hasSkippedOnboarding` is the existing completion flag despite its historical name. Set it only after:

- Wallet Setup has been committed, and
- Growth Setup has been saved or skipped.

At completion:

- `mode=cloud` -> `cloudSyncEnabled=true`.
- `mode=offline` -> `cloudSyncEnabled=false`.
- Set `hasSkippedOnboarding=true`.
- Replace navigation with `/home`.

## Storage Choice

Use two clear option cards instead of presenting account creation as mandatory.

### Sign in & back up Cashflow

> Sync and back up your Cashflow data to the cloud so it is available on your other devices. Personal Growth remains on this device.

Primary action: **Sign in & continue**

### Continue fully offline

> No account needed. Your data stays on this device without cloud backup and may be lost if the app is removed or the device is unavailable.

Primary action: **Continue fully offline**

Supporting copy:

> You can enable Cashflow cloud backup later from Profile.

Indonesian and English copy must communicate the same scope. Do not claim Personal Growth backup.

## Wallet Setup

### Form behavior

- Wallet name is required.
- The input starts empty for a new wallet.
- Placeholder is exactly **`Primary Wallet`**.
- Placeholder is not a fallback value; Continue remains disabled until the user enters a non-empty name.
- Wallet image is optional.
- A fresh install creates a wallet.
- Reopening onboarding edits the active wallet instead of creating another wallet.
- If management data is still loading, show a loading state and prevent submission.

### Wallet image copy

> Your wallet image shapes the color theme across Ethos. Choose an image with clear, vibrant colors.

The user sees:

- Current or newly selected image preview.
- Palette/theme preview without changing the persisted app theme.
- Replace and remove actions when an image is present.

## Image Selection and Validation

### Shared picker validation

Keep selection and persistence as separate responsibilities.

`pickUploadImage`:

- Opens ImagePicker.
- Validates the temporary result.
- Returns the temporary URI, file name, MIME type, and size.
- Does not copy every selected file into permanent storage.

`persistWalletImage`:

- Used only when Wallet Setup is committed.
- Copies the validated temporary image to `Paths.document/wallet-images/`.
- Uses a generated UUID-based name while preserving a supported extension.
- Returns the persistent URI.

This avoids permanently storing profile photos that are uploaded immediately.

### Validation rules

- Maximum size: `5 * 1024 * 1024` bytes, matching the management and profile server limits.
- Supported MIME types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/gif`
- Use `asset.fileSize` when available; otherwise read `new File(asset.uri).size`.
- Use `asset.mimeType` when supported.
- If MIME is absent, infer it only from `.jpg`, `.jpeg`, `.png`, `.webp`, or `.gif`.
- Reject unknown extensions and HEIC/HEIF. Never relabel HEIC as JPEG without transcoding.
- Errors use localized `imageUpload.tooLarge` and `imageUpload.unsupportedType` messages.

### File lifecycle

- Do not persist the image while the user is only previewing it.
- On Continue, copy the selected temporary image and then commit wallet/theme state.
- If commit fails after copying, delete the newly copied file.
- When replacing a previous local wallet image, delete the previous local file only after the database commit succeeds.
- When a local image uploads successfully, update the database to the server pathname before deleting the local file.
- Deleting a wallet also removes its local image when the path belongs to the app wallet-image directory.
- Never delete server-backed `managements/...` paths or arbitrary external URIs.

## Theme Preview and Commit

### Preview

When an image is selected:

1. Run `extractColors(temporaryUri)`.
2. Build a draft `ThemeSet` through `colorsToThemeSet`.
3. Render palette swatches and a small UI preview using the draft colors.
4. Do not call `saveTheme` or `setTheme` yet.

Backing out of Wallet Setup therefore leaves no selected theme or custom-theme artifact.

### Commit

On Continue:

1. Create the wallet and receive its local ID, or use the active wallet ID.
2. Persist the selected image if one is new.
3. Upsert a wallet theme with a stable slug derived from the wallet ID, for example `wallet-{localManagementId}`.
4. Save `ManagementImageTheme` with the persistent image URI and stable theme slug.
5. Apply the committed theme.

Extend AppTheme with an explicit wallet-theme upsert operation instead of using the current unique-slug-only `saveTheme` behavior. Replacing an image updates the same theme record instead of creating `wallet-2`, `wallet-3`, and other orphan themes.

When replacing a legacy wallet theme with a different custom slug, remove the old custom theme after the new wallet/theme commit succeeds and only when no other wallet references it.

## Wallet Image Cloud Sync

Local wallet images act as pending uploads until the server returns a protected `managements/...` pathname.

### Retry pass

Add a dedicated `pushPendingManagementImages` pass:

1. Run after `pushManagements`, so newly-created wallets have `remote_id`.
2. Run before `pullManagements`, so a server response cannot overwrite a pending local image first.
3. Scan all non-deleted managements with:
   - a non-null `remote_id`, and
   - a local app-owned wallet-image URI.
4. Derive upload name and MIME from the validated persistent extension.
5. Upload through `PUT /api/v1/managements/{id}/image`.
6. On success, atomically replace the local URI with the returned `managements/...` pathname and update `image_theme_json.image`.
7. Delete the local file only after the database update succeeds.
8. On failure, keep the local URI unchanged so the next sync retries it.

### Pull protection

`pullManagements` must preserve a local app-owned wallet image and its `image_theme_json` while that image is pending upload, even if the server management timestamp is newer. Other server fields such as the name may still reconcile normally.

This protection is required; simply scanning local URIs is insufficient if a pull can erase the pending URI.

### Sync failure behavior

- A wallet-image failure increments the sync error count but does not roll back successfully synchronized Cashflow entities.
- Retrying Sync retries the pending image.
- Offline mode never runs this pass because cloud sync is disabled.

## Build One Tiny Habit

This step is inspired by Atomic Habits but does not present itself as an official Atomic Habits product.

### Step 1: Choose a direction

- Health
- Focus
- Learning
- Calm
- Custom

### Step 2: Make it tiny

Localized starter suggestions:

- Stretch for 2 minutes
- Read 1 page
- Write one sentence
- Breathe for 1 minute
- Prepare tomorrow's priorities

Selecting a suggestion pre-fills an editable habit name. Custom starts with an empty input.

### Step 3: Choose your rhythm

- Every day: `[0,1,2,3,4,5,6]`
- Weekdays: `[1,2,3,4,5]`
- Weekends: `[0,6]`
- Custom: weekday chips with at least one selected day

No exact time is collected in this version.

### Step 4: Commitment preview

Show a localized sentence such as:

> Every Monday-Friday, I will read one page.

The user can:

- Choose a color from `TIME_BOX_COLORS`.
- Save and add another habit.
- Edit a draft before finishing.
- Finish with the current valid habit.

### Skip for now

- The Skip action stays visible throughout Growth Setup.
- Skip creates no new habit and immediately completes onboarding.
- Wallet Setup remains committed.

### Idempotency when onboarding is reopened

- Exclude system habits from matching and editing.
- Normalize names with `trim().toLocaleLowerCase()`.
- When a draft matches an existing custom habit, update that habit's color and weekdays instead of creating a duplicate.
- Show existing custom habits in the review list so the user understands an existing habit will be updated.
- Different normalized names create separate habits.

## Route Structure

```text
src/app/(onboarding)/
|- _layout.tsx
|- onboarding.tsx       # introduction + storage choice
|- wallet-setup.tsx     # wallet name, image, theme preview
`- growth-setup.tsx     # tiny habit builder + Skip
```

The `(onboarding)` folder is a route group and is not a URL segment.

Use explicit typed hrefs to avoid ambiguity:

- File `src/app/(onboarding)/wallet-setup.tsx`
  - public pathname: `/wallet-setup`
  - explicit grouped href: `/(onboarding)/wallet-setup`
- File `src/app/(onboarding)/growth-setup.tsx`
  - public pathname: `/growth-setup`
  - explicit grouped href: `/(onboarding)/growth-setup`

Use `mode=cloud|offline`, not a raw destination URL.

## State and Transaction Rules

- Storage choice is route state until the final step; it does not mutate preferences immediately.
- Wallet Setup writes wallet, image metadata, and theme in an order that can be compensated if a later operation fails.
- Growth drafts remain in component state until Save/Finish.
- `hasSkippedOnboarding` and `cloudSyncEnabled` are persisted together at final completion.
- Back/cancel before final completion must not mark onboarding complete.
- Reopening onboarding must remain safe for existing wallet and habit data.

## Files Expected to Change

- `src/app/(onboarding)/onboarding.tsx`
- `src/app/(onboarding)/wallet-setup.tsx` (new)
- `src/app/(onboarding)/growth-setup.tsx` (new)
- `src/app/auth.tsx` (onboarding auth return target)
- `src/lib/imageUpload.ts` (selection and validation only)
- New wallet-image persistence helper under `src/lib/`
- `src/components/AppTheme.tsx` (stable wallet-theme upsert)
- `src/lib/preferences.ts` if a typed helper is needed for atomic completion preferences
- `src/lib/sync/syncEngine.ts` (pending image upload pass and pull protection)
- `src/lib/api/managements.ts` (sync upload options/signal if needed)
- `src/data/cashflow/repository.ts` (`createManagement` return ID and local-image cleanup)
- `src/data/cashflow/CashflowDataProvider.tsx`
- `src/data/cashflow/types.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/id.ts`

No Personal Growth schema migration is required because the first version stores recurrence in `Habit.weekdays`.

## Implementation Phases

### Phase 1: Shared foundations

- Add image validation without persistence side effects.
- Add wallet-image persistence and cleanup helpers.
- Make local management creation return its ID.
- Add stable wallet-theme upsert.
- Add localized copy.

### Phase 2: Onboarding screens

- Update storage choice.
- Add auth return behavior.
- Add Wallet Setup with draft theme preview.
- Add Growth Setup and final completion behavior.

### Phase 3: Cloud image retry

- Add pending image upload pass.
- Protect pending local images during management pull.
- Update theme image path and clean local files after upload.

### Phase 4: Verification

- Type checking and linting.
- Focused unit tests for pure validation/normalization helpers.
- Manual dev-client checks for picker, filesystem, auth cancellation, and image upload retry.

## Acceptance Criteria

### Storage and auth

- [ ] Cloud action opens auth before setup when unauthenticated.
- [ ] Cancelling auth returns to onboarding without marking it complete.
- [ ] Authenticated users selecting cloud skip the auth form.
- [ ] Cloud completion sets `cloudSyncEnabled=true`.
- [ ] Offline completion sets `cloudSyncEnabled=false`.
- [ ] Copy promises cloud backup only for Cashflow.
- [ ] Personal Growth is explicitly described as local.

### Wallet

- [ ] New wallet name input is empty with `Primary Wallet` as its placeholder.
- [ ] Continue is disabled for an empty/whitespace-only name.
- [ ] A new wallet is created exactly once.
- [ ] Reopening onboarding edits the active wallet.
- [ ] Image is optional.

### Image and theme

- [ ] Files over 5MB are rejected before persistence/upload.
- [ ] Unsupported, unknown, HEIC, and HEIF files are rejected.
- [ ] Profile image selection does not leave permanent local copies.
- [ ] Wallet image remains available after app restart.
- [ ] Backing out after preview does not change the selected theme.
- [ ] Committing an image applies the generated theme.
- [ ] Replacing an image updates one stable wallet theme rather than creating duplicates.
- [ ] Replaced, cancelled, deleted, and uploaded local files follow the cleanup rules.

### Image sync

- [ ] A wallet created before cloud sync uploads its local image after receiving `remote_id`.
- [ ] A failed image upload remains pending and retries on the next sync.
- [ ] Management pull does not erase a pending local image.
- [ ] Successful upload changes the local image to the returned server pathname.
- [ ] Theme metadata references the server pathname after upload.

### Personal Growth

- [ ] Skip creates no custom habit and completes onboarding.
- [ ] Every rhythm maps to the correct weekday array.
- [ ] Custom rhythm requires at least one day.
- [ ] Starter copy and commitment preview are localized.
- [ ] Reopening onboarding updates matching custom habits instead of duplicating them.
- [ ] System habits are never modified by the builder.

### Navigation and quality

- [ ] Grouped onboarding hrefs resolve correctly with typed routes.
- [ ] Back/cancel before completion does not set `hasSkippedOnboarding`.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run lint` passes.
- [ ] Wallet image selection/persistence is manually verified on Android and iOS dev clients.

## Risks and Mitigations

- **New expo-file-system API:** verify `File.copy`, `Directory.create`, and `Paths.document` against SDK 56 and both native platforms.
- **Image upload in background sync:** keep the URI pending on failure and allow foreground Sync to retry.
- **Server pull races:** run image upload before pull and explicitly preserve pending local images during reconciliation.
- **Theme/file orphaning:** defer persistence until commit, use stable theme slugs, and define cleanup after successful state transitions.
- **Auth cancellation:** authenticate before setup and do not mutate completion preferences until the final step.
- **Runtime compatibility:** no dependency changes are planned, so the feature can ship by OTA under the current runtime.
