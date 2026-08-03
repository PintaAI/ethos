# Apple Intelligence Integration in an Expo App

Research date: July 25, 2026

## Scope

This document covers Apple's AI and Siri integration technologies and how to adopt them in an Expo SDK 56 app using Continuous Native Generation (CNG). It focuses on:

- Foundation Models for on-device AI.
- Vision OCR as the production image-understanding path.
- App Intents, App Shortcuts, Siri, and Spotlight.
- Native Swift integration through Expo Modules and config plugins.
- Production iOS 26 capabilities versus iOS 27 beta features.

## Technology Overview

Apple provides separate frameworks for in-app AI and system discoverability:

| Goal | Apple technology | Status in July 2026 |
| --- | --- | --- |
| Run a language model on-device | Foundation Models | Production on iOS 26 |
| Extract text from images locally | Vision | Production |
| Pass images directly to Apple's language model | Foundation Models multimodal APIs | iOS 27 beta |
| Use Apple's stronger server model | Private Cloud Compute language model | iOS 27 beta |
| Expose app actions to Siri | App Intents and App Shortcuts | Production |
| Expose app content to semantic search | App Entities and Spotlight | Production, expanded in iOS 27 |
| Give Siri detailed on-screen context | View Annotations and App Entities | Expanded in iOS 27 beta |

Foundation Models and App Intents solve different problems. Using Foundation Models does not automatically expose an app to Siri. Siri integration requires App Intents.

## Foundation Models

The `FoundationModels` Swift framework provides access to `SystemLanguageModel`, the on-device language model that powers Apple Intelligence.

The production iOS 26 framework supports:

- Text understanding and generation.
- Structured output with `@Generable` and `@Guide`.
- Tool calling.
- Streaming responses.
- Stateful, multi-turn sessions.
- On-device, offline operation.
- Built-in safety guardrails.

The model is part of the operating system. It does not add model weights to the app bundle and does not require an API key or per-request developer billing.

### Structured Output

Guided generation is the best fit for extracting app data. A native result type can constrain the model to a known shape:

```swift
import FoundationModels

@Generable
struct EntryDraft {
    @Guide(description: "Short description of the transaction")
    let name: String?

    @Guide(description: "Amount in the selected currency")
    let amount: Double?

    @Guide(description: "Transaction date in YYYY-MM-DD format")
    let date: String?

    @Guide(description: "One of the categories supplied in the prompt")
    let category: String?

    let transactionType: TransactionType?
}

@Generable
enum TransactionType {
    case income
    case expense
}
```

The framework converts the Swift type into a generation schema and uses constrained decoding. This is more reliable than asking the model to emit arbitrary JSON and parsing it afterward.

### Availability

The app must check model availability before creating a session:

```swift
let model = SystemLanguageModel.default

switch model.availability {
case .available:
    // The model can be used.
case .unavailable(.appleIntelligenceNotEnabled):
    // Ask the user to enable Apple Intelligence.
case .unavailable(.modelNotReady):
    // Model assets may still be downloading.
default:
    // Use the app's fallback implementation.
}
```

Availability depends on:

- iOS 26 or later.
- Apple Intelligence-compatible hardware.
- Apple Intelligence being enabled by the user.
- Model assets being downloaded and ready.
- A supported language and region.

Compatible iPhones begin with iPhone 15 Pro and iPhone 15 Pro Max, followed by the iPhone 16 and iPhone 17 families. Older iPhones, including the standard iPhone 15, cannot run the model.

The app should also handle runtime failures such as:

- Unsupported language or locale.
- Context-window exhaustion.
- Guardrail violations or refusals.
- Model assets becoming unavailable.
- Temporary model rate limiting.

### Context and Reasoning Limits

The production on-device model has a context window of approximately 4,096 tokens. Instructions, prompts, tool definitions, schemas, prior messages, and generated output all consume that context.

Apple recommends:

- Keeping prompts concise and direct.
- Reducing conditional complexity.
- Splitting difficult tasks into smaller requests only when necessary.
- Supplying a short list of examples rather than long demonstrations.
- Using guided generation to reduce malformed output.
- Testing prompts again after operating-system model updates.

The on-device model has less reasoning capacity than frontier cloud models. It is suitable for classification, extraction, summarization, and lightweight transformation, but a fallback is needed for difficult or ambiguous inputs.

### Language Support

Language support must be tested at runtime with the framework's locale-support API.

Apple's July 2026 support information does not clearly include Indonesian across all Foundation Models capabilities, even though Siri supports Indonesian in more contexts. An Expo app must not assume that `id-ID` transaction input works merely because the device's Siri supports Indonesian.

For unsupported locales, use one of these fallbacks:

- A server model such as Gemini.
- A deterministic parser for common transaction formats.
- A supported-language transformation step, provided its privacy implications are clear.

## Image Understanding

### Production iOS 26 Path

For a production receipt-extraction feature, use Apple Vision to recognize text, then pass the recognized text to Foundation Models:

```text
Receipt image
    -> Vision OCR
    -> Normalized receipt text
    -> SystemLanguageModel
    -> Structured EntryDraft
    -> User review
```

This approach is fully on-device when the Foundation Model is available. It keeps receipt contents off the network and allows the app to control image resizing, orientation, and OCR preprocessing.

The OCR output should be trimmed before prompting so irrelevant receipt content does not consume the model's small context window.

### iOS 27 Beta Features

Apple announced the following for the iOS 27 Foundation Models release:

- Direct image input.
- A rebuilt on-device model with stronger reasoning and tool calling.
- A Vision-backed `OCRTool`.
- A Vision-backed `BarcodeReaderTool`.
- Dynamic profiles for changing model, tools, and instructions during a session.
- Token counting and context inspection improvements.

These capabilities currently require iOS 27 and Xcode 27 beta tooling. They should not be used as production requirements until iOS 27, Xcode 27, App Store submissions, and compatible Expo tooling become stable.

## Private Cloud Compute

Apple announced `PrivateCloudComputeLanguageModel` for iOS 27. It provides a stronger Apple-hosted model with:

- A larger context window, reported as approximately 32K tokens.
- Better reasoning.
- Configurable reasoning levels.
- No app-managed API key or separate model-provider account.
- Apple's Private Cloud Compute privacy guarantees.

As of this research date, Private Cloud Compute model access is an iOS 27 beta capability. An Expo SDK 56 production app should treat it as a future enhancement, not a replacement for its current server fallback.

## Safety and Financial Data

Apple's Foundation Models acceptable-use requirements prohibit unsupervised decisions with material impact in high-risk areas, including finance.

Reasonable uses for a cashflow app include:

- Extracting a draft transaction from user-provided text.
- Extracting receipt fields.
- Suggesting a category.
- Summarizing data while clearly presenting the underlying values.

Riskier uses include:

- Making investment, credit, lending, or eligibility decisions.
- Moving money automatically based on model output.
- Giving financial recommendations without appropriate controls.
- Saving or deleting financial records without user confirmation.

AI-produced transaction data should remain a draft. The user should review and confirm it before the app persists the entry.

## Siri and App Intents

The App Intents framework exposes app actions and content to:

- Siri.
- Spotlight.
- The Shortcuts app.
- Widgets and controls.
- The Action button and other system experiences.

App Intents are written in Swift. App Shortcuts make selected intents available immediately after app installation without requiring the user to create a shortcut manually.

### Appropriate Initial Intents

A cashflow app should begin with a small number of high-value intents:

| Intent | Example request | Recommended behavior |
| --- | --- | --- |
| Add transaction | "Record fifty thousand rupiah for lunch in Ethos" | Open a prefilled form for review |
| Open entry form | "Record spending with Ethos" | Open a blank entry form |
| Today's summary | "How much did I spend today in Ethos?" | Return an authenticated aggregate |
| Open wallet | "Open my household wallet in Ethos" | Navigate to the selected wallet |

An App Shortcut provider can register phrases for Siri and Spotlight:

```swift
import AppIntents

struct EthosShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTransactionIntent(),
            phrases: [
                "Record spending in \(.applicationName)",
                "Add a transaction to \(.applicationName)"
            ],
            shortTitle: "Add Transaction",
            systemImageName: "plus.circle"
        )
    }
}
```

App Shortcuts expose capabilities from an already installed app. They do not cause Siri to recommend or install the app for people who do not have it.

### App Schemas

App Schemas define standard domains that Siri understands deeply. Schema-backed intents can become tools available to Apple Intelligence and gain standardized parameter, side-effect, authentication, and confirmation behavior.

No clearly matching personal cashflow or expense-tracking schema was found during this research. The app should use custom App Intents rather than incorrectly adopting an unrelated schema. A matching finance schema can be adopted later if Apple introduces one.

### Entities and Spotlight

`AppEntity` describes app-specific objects such as wallets or categories. `IndexedEntity` allows those objects to be added to Spotlight's semantic index so Siri and Spotlight can retrieve them by meaning.

Financial data requires a conservative indexing policy:

- Do not index individual transactions by default.
- Do not index balances or private notes.
- Consider indexing only low-sensitivity wallet or category names after user consent.
- Prefer aggregate queries performed by an authenticated intent.

Indexing every transaction would make sensitive details available to system semantic search. That is unnecessary for an initial Siri integration.

### Authentication and Confirmation

Financial intents should require device authentication when reading private data or performing changes:

```swift
static var authenticationPolicy: IntentAuthenticationPolicy {
    .requiresAuthentication
}
```

Recommended rules:

- Require unlock before returning balances or summaries.
- Open the app for transaction creation rather than saving silently.
- Require explicit confirmation for destructive operations.
- Avoid showing sensitive results on the lock screen.
- Treat Siri parameters and on-screen context as untrusted input.

### React Native Runtime Constraint

Siri can invoke an App Intent while the React Native JavaScript runtime is not active. Swift intent code must not depend on calling JavaScript synchronously.

The safest initial flow is:

```text
Siri resolves intent parameters
    -> Native Swift stores a pending draft
    -> The intent opens the app
    -> Expo Router opens the form sheet
    -> React Native reads the pending draft
    -> The user reviews and saves it
```

Directly changing an Expo SQLite database from an App Intent is possible but not recommended initially. It duplicates database access, validation, and migration logic in Swift and increases the risk of writes occurring without the normal React Native data layer.

## Expo SDK 56 Implementation

Expo does not currently provide an official high-level API for Foundation Models or App Intents. Integration requires native Swift code.

The recommended structure is:

```text
modules/
└── ethos-apple-intelligence/
    ├── expo-module.config.json
    ├── index.ts
    ├── src/
    │   └── EthosAppleIntelligence.types.ts
    ├── ios/
    │   ├── EthosAppleIntelligenceModule.swift
    │   ├── EntryDraft.swift
    │   └── ReceiptOCR.swift
    ├── plugin/
    │   ├── app-intents/
    │   │   ├── AddTransactionIntent.swift
    │   │   ├── OpenEntryFormIntent.swift
    │   │   ├── TodaySummaryIntent.swift
    │   │   └── EthosShortcuts.swift
    │   └── src/
    │       └── withEthosAppleIntelligence.ts
    └── app.plugin.js
```

### Local Expo Module

Create a first-party local module with Expo Modules API. The module should expose a narrow TypeScript interface:

```ts
export type AppleModelAvailability =
  | { available: true }
  | {
      available: false;
      reason:
        | "unsupportedOS"
        | "unsupportedDevice"
        | "appleIntelligenceDisabled"
        | "modelNotReady"
        | "unsupportedLocale"
        | "unknown";
    };

export type ExtractedEntryDraft = {
  name: string | null;
  amount: number | null;
  date: string | null;
  category: string | null;
  io: "Income" | "Expenses" | null;
};

export interface EthosAppleIntelligenceModule {
  getAvailability(locale: string): Promise<AppleModelAvailability>;
  extractEntryFromText(input: {
    text: string;
    currency: string;
    locale: string;
    categories: string[];
    currentDate: string;
  }): Promise<ExtractedEntryDraft>;
  extractEntryFromImage(input: {
    uri: string;
    currency: string;
    locale: string;
    categories: string[];
    currentDate: string;
  }): Promise<ExtractedEntryDraft>;
}
```

The Swift implementation should use `@available(iOS 26.0, *)` around Foundation Models APIs so the app can preserve its lower iOS deployment target.

For Android and older iOS versions, the TypeScript layer should report unavailability and select the existing server implementation.

### Why a First-Party Module

Several community Foundation Models wrappers exist, but their maturity and feature coverage vary. Some wrappers use prompt-based JSON rather than native guided generation, and some tool-calling APIs still target older beta interfaces.

A small first-party module is preferable because it can:

- Use Apple's native `@Generable` output directly.
- Expose only the operations the app requires.
- Normalize native errors into stable TypeScript values.
- Keep financial-data handling auditable.
- Be updated deliberately when Apple changes model behavior.

### Config Plugin

App Intents must be compiled into the generated iOS application target. The module's config plugin should:

- Copy App Intent Swift files into the generated iOS project.
- Add those files to the main application target.
- Add localized App Shortcut string catalogs.
- Add an App Group entitlement if shared native storage is required.
- Set any required deployment or build settings without raising the entire app's minimum iOS version unnecessarily.
- Apply the same result deterministically on every prebuild.

The generated `ios/` directory should remain uncommitted. All native changes must be represented by the local module and config plugin so `npx expo prebuild --clean` can reproduce them.

### Shared Native State

If an App Intent needs to pass data into React Native, use a small native shared store rather than invoking JavaScript from `perform()`.

Suitable data includes:

- A pending entry draft.
- A pending navigation destination.
- A short-lived request identifier.
- Precomputed aggregate summaries that Siri may read.

Do not mirror the complete transaction database into shared preferences. If an App Group is used, store only the minimum information required by the intent and clear pending payloads after consumption.

### Navigation

After native intent invocation, Expo Router can consume the pending destination and open an existing route. For transaction creation, navigation should lead to the existing form sheet with prefilled state, not a separate Siri-only form.

This preserves one validation and save path for:

- Manual entry.
- Shared text or receipt extraction.
- Siri-created drafts.
- Future Apple Intelligence actions.

## Hybrid Fallback Strategy

A production app should treat on-device Apple AI as an optional fast and private path:

```text
Apple platform
    -> Check Foundation Models availability and locale
    -> Available: Vision OCR + SystemLanguageModel
    -> Unavailable or failed: server extraction with user consent

Android
    -> Server extraction or deterministic parser
```

Fallbacks are required because many active iPhones do not support Apple Intelligence, users can disable it, model assets may not be ready, and locale support varies.

The UI should describe the data path accurately:

- "Processed on this device" when using Vision and Foundation Models.
- "Processed securely online" when using the server fallback.

## Build and Release Workflow

Foundation Models bridging and App Intents are native changes. They require a new app binary and cannot be delivered only through EAS Update.

Recommended workflow:

1. Implement the local Expo module and config plugin.
2. Run `npx expo prebuild --clean` in a disposable verification workspace or generated local tree.
3. Inspect that the Swift files are included in the correct Xcode target.
4. Run `npx expo config --json` to verify app configuration.
5. Build a custom development client with Xcode 26-era tooling.
6. Test on a physical Apple Intelligence-capable iPhone.
7. Test App Intents in the Shortcuts app and with Siri.
8. Build and distribute new development, preview, and production binaries.

Changing prompts or TypeScript orchestration can generally be shipped by OTA if the native interface and runtime version remain compatible. Adding new Swift APIs, intents, entitlements, or native module methods requires a new build.

## Testing Requirements

### Foundation Models

- Available and unavailable devices.
- Apple Intelligence enabled and disabled.
- Model assets ready and downloading.
- English and Indonesian app locales.
- Short, ambiguous, malformed, and adversarial transaction text.
- Context-limit, refusal, timeout, and rate-limit errors.
- Output stability across supported iOS model versions.
- Server fallback after native failure.

### Vision OCR

- JPEG, PNG, HEIC, screenshots, and camera photos.
- Rotated, blurred, low-light, and partially cropped receipts.
- Indonesian thousand separators and abbreviated prices.
- Receipts with tax, service charge, discount, and multiple totals.
- Long OCR output trimmed to fit the model context.

### App Intents

- Invocation from Siri, Spotlight, and Shortcuts.
- App running, suspended, and terminated.
- Device locked and unlocked.
- Authentication required for sensitive results.
- Correct navigation into Expo Router.
- Pending drafts consumed exactly once.
- No writes before user review and confirmation.
- Localized phrases and dialog.

## Recommended Adoption Order

1. Add custom App Intents for opening the entry form and creating a reviewable transaction draft.
2. Add a local Expo module for Foundation Models text extraction on supported iOS 26 devices.
3. Add Vision OCR and feed recognized receipt text into the on-device model.
4. Retain the current server AI path for Android, unsupported Apple devices, unsupported locales, and failures.
5. Add aggregate Siri queries only after authentication and privacy behavior are validated.
6. Reassess direct image input and Private Cloud Compute after iOS 27 and compatible Expo tooling are production-ready.

## Official Sources

- [Apple Foundation Models](https://developer.apple.com/documentation/foundationmodels)
- [SystemLanguageModel](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel)
- [Generating content with Foundation Models](https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models)
- [Prompting an on-device foundation model](https://developer.apple.com/documentation/foundationmodels/prompting-an-on-device-foundation-model)
- [Foundation Models acceptable use requirements](https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/)
- [Apple App Intents](https://developer.apple.com/documentation/appintents)
- [Making actions discoverable by Apple Intelligence](https://developer.apple.com/documentation/appintents/making-actions-and-content-discoverable-by-apple-intelligence)
- [Making app entities available in Spotlight](https://developer.apple.com/documentation/appintents/making-app-entities-available-in-spotlight)
- [Apple Intelligence developer overview](https://developer.apple.com/apple-intelligence/)
- [WWDC26 Apple Intelligence guide](https://developer.apple.com/wwdc26/guides/apple-intelligence/)
- [Expo Modules API](https://docs.expo.dev/modules/get-started/)
- [Expo config plugins](https://docs.expo.dev/config-plugins/introduction/)
- [Expo Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
