# iOS Widgets in Ethos with Expo SDK 56

Research date: July 26, 2026

## Executive Summary

Ethos can add a native iOS Home Screen widget without maintaining a hand-written Swift WidgetKit target. Expo SDK 56 promotes the first-party `expo-widgets` package to stable. Its config plugin generates the iOS Widget Extension target, App Group entitlements, SwiftUI scaffolding, CocoaPods linkage, and EAS app-extension declaration during Expo Prebuild. Widget layouts are authored in TypeScript with `@expo/ui/swift-ui` components and rendered by WidgetKit.

The recommended first release is a read-only **Current Month** widget for the active Ethos wallet:

- Small and medium Home Screen sizes only.
- Current-month income, expenses, and net cashflow.
- Values precomputed and formatted by the main app from the existing `buildStats(entries)` result.
- A tap deep-links to the existing summary screen.
- A privacy preference can replace monetary values with masked text.
- No Lock Screen families in the first release because financial amounts are sensitive and Lock Screen widgets are visible before the app is opened.
- No direct database writes or API calls from the widget.

The main implementation path is:

```text
Expo app and existing SQLite data
    -> CashflowDataProvider computes buildStats(entries)
    -> Main app creates small, serializable, preformatted widget props
    -> EthosMonthlyWidget.updateSnapshot(props)
    -> expo-widgets stores the timeline in the shared App Group
    -> WidgetKit launches the generated extension when needed
    -> Isolated widget JavaScript returns an @expo/ui SwiftUI layout
    -> iOS renders the native widget
```

This is a native feature. Installing `expo-widgets`, adding the plugin, adding the extension target, changing entitlements, or changing the extension's bundled widget layout requires a new iOS binary. Expo Go cannot run it. EAS Update should only be relied on for compatible main-app JavaScript changes, not for introducing or replacing the widget extension bundle.

## Research Conclusions

| Question | Answer for Ethos |
| --- | --- |
| Can an Expo SDK 56 app create a real iOS widget? | Yes, with the stable first-party `expo-widgets` package. |
| Is Swift required for the normal implementation? | No. The config plugin generates the Swift WidgetKit target and the layout is written with TypeScript and Expo UI. |
| Is this supported in Expo Go? | No. Use a custom development build, simulator build, preview build, or production build. |
| Does the widget run the normal React Native app? | No. It runs a small isolated JavaScript runtime inside an iOS app extension and produces SwiftUI-compatible output. |
| Can it use React hooks, context, SQLite, or async fetches? | No. A `'widget'` component is synchronous and pure. Data must arrive through props and widget environment values. |
| Can it show live app data while the app is terminated? | It shows the last stored snapshot or scheduled timeline. It does not continuously run the app. |
| Can it update on every transaction? | Yes when a transaction changes while the app is running: publish a new snapshot. WidgetKit still controls actual scheduling and system resource use. |
| Can the widget write transactions directly? | Not safely with the high-level SDK 56 API. Widget button callbacks can update widget props, not Ethos SQLite. Deep-link into the app for financial writes. |
| Can it support multiple sizes? | Yes. Read `environment.widgetFamily` and return a size-specific layout. |
| Can the user configure it? | Yes on iOS 17+, but SDK 56 configuration options are build-time values. Dynamic wallet lists are not a good fit. |
| Are Android widgets included? | The SDK 56 public reference documents `expo-widgets` as iOS. Android scaffolding exists behind an opt-in flag but is not the recommended production path in this research. |
| Does it fit the current project? | Yes. Ethos already uses Expo SDK 56, React Native 0.85.3, React 19.2.3, and `@expo/ui ~56.0.23`. Only `expo-widgets` is missing. |

## Current Ethos Baseline

The repository currently has:

- Expo `~56.0.17`.
- React Native `0.85.3`.
- React `19.2.3`.
- `@expo/ui ~56.0.23`, which `expo-widgets` uses to describe SwiftUI layouts.
- Expo Router with app scheme `ethos`.
- iOS bundle identifier `com.rorez.ethos`.
- App version `1.1.3` and `runtimeVersion.policy = appVersion`.
- EAS development, preview, and production profiles.
- Local-first cashflow data in Expo SQLite.
- `CashflowDataProvider`, which derives `stats` by calling `buildStats(entries)`.
- Existing current-day, current-week, current-month, total, balance, and category aggregates in `buildStats`.

Relevant current code:

- `src/data/cashflow/CashflowDataProvider.tsx` loads active-wallet data and refreshes entries after mutations.
- `src/data/cashflow/repository.ts` contains `buildStats(entries)`.
- `src/app/(cashflow)/(tabs)/summary/index.tsx` is the natural deep-link destination.
- `app.json` declares the `ethos` URL scheme and `com.rorez.ethos` iOS bundle identifier.

The local `ios/` and `android/` directories currently exist as generated working directories, but `.gitignore` excludes both and Git does not track their files. This means app config and config plugins remain the durable source of native configuration. EAS Build's uploaded source should omit these ignored directories and run Prebuild remotely. For local testing, regenerate iOS after changing the plugin instead of editing the generated widget target manually.

## Technology Options

### Option A: First-Party `expo-widgets` Package

This is the recommended option.

Advantages:

- Stable in Expo SDK 56.
- Maintained in the Expo monorepo.
- No custom Swift is needed for standard widgets.
- Generates the Widget Extension target through CNG.
- Generates and applies the shared App Group.
- Registers the extension in EAS app-extension config before credentials are created.
- Uses TypeScript types and Expo UI components.
- Supports snapshots, timelines, responsive families, configurable widgets, interactive controls, images in a shared directory, Lock Screen widgets, and Live Activities.
- Fits Ethos's existing ignored-native-directory workflow.

Constraints:

- iOS only in the stable documented API.
- Requires a development build rather than Expo Go.
- The widget runtime is deliberately restricted.
- The package is stable but young; SDK 56 contains many widget fixes and should be kept on the current compatible patch.
- Advanced WidgetKit features not exposed by Expo may still require custom native work.

### Option B: Hand-Written Swift WidgetKit Target

This uses Xcode to create a Widget Extension and SwiftUI views directly.

Advantages:

- Full WidgetKit and App Intents control.
- Direct access to native-only APIs not yet represented by Expo UI.
- Maximum control over timeline providers, networking, privacy behavior, and per-instance configuration.

Costs:

- Requires Swift and WidgetKit expertise.
- Requires a custom config plugin to reproduce the extension under CNG, or permanent maintenance of native projects.
- Duplicates functionality now provided by Expo SDK 56.
- Increases code signing, target configuration, and upgrade maintenance.
- Risks losing manual Xcode changes after `npx expo prebuild --clean`.

This should be a fallback only if an essential requirement cannot be implemented with `expo-widgets`.

### Option C: Community Widget Packages

Older community solutions generate native targets with custom plugins or bridge to platform-specific widgets. They were important before SDK 56, but a first-party stable package is now a lower-risk default. A community package should only be selected for a concrete missing requirement, such as a production Android widget with equivalent behavior.

## How Expo Widgets Work

### Native Extension Generation

The `expo-widgets` config plugin performs these iOS tasks during Prebuild:

- Creates an `ExpoWidgetsTarget` Widget Extension.
- Defaults its bundle identifier to `<main bundle identifier>.ExpoWidgetsTarget`.
- Defaults the App Group to `group.<main bundle identifier>`.
- Adds the App Group entitlement to the main app and extension.
- Generates extension `Info.plist`, entitlements, WidgetKit Swift files, and widget bundle registration.
- Links the required Expo and React Native pods for the extension runtime.
- Adds an EAS app extension declaration at `extra.eas.build.experimental.ios.appExtensions`.
- Includes the extension bundle identifier and App Group entitlement in that declaration so EAS can prepare credentials before the generated Xcode project exists.
- Uses the app's iOS deployment target, defaulting to iOS 16.4 for SDK 56.

For Ethos, explicit identifiers are clearer than defaults:

```text
Main app:          com.rorez.ethos
Widget extension: com.rorez.ethos.widgets
Shared App Group: group.com.rorez.ethos
Generated target: ExpoWidgetsTarget
```

These identifiers become part of Apple Developer signing configuration. Do not casually rename them after release.

### Isolated Widget Runtime

The component passed to `createWidget` contains a `'widget'` directive. Expo serializes that function into a separate bundle used by the extension. It is not the same runtime as the main Expo Router app.

Inside the widget function:

- Use only `@expo/ui/swift-ui` components and supported modifiers.
- Do not use React Native `View`, `Text`, `StyleSheet`, or NativeWind.
- Do not use hooks such as `useState`, `useEffect`, or context.
- Do not make network requests or perform asynchronous work.
- Do not read Expo SQLite, SecureStore, AsyncStorage, or in-memory providers.
- Do not reference module-scope constants or helper functions. The function body is serialized independently.
- Declare constants and small helper functions inside the widget function.
- Receive all business data in widget props.
- Use `WidgetEnvironment` only for rendering context such as family, color scheme, rendering mode, margins, and configuration.

Imports needed to declare the component remain at module scope, but runtime values used by the component must be represented in the serialized function body or props.

### Data and Timeline Model

`createWidget` returns a `Widget` object with four relevant methods:

| API | Purpose |
| --- | --- |
| `updateSnapshot(props)` | Store one entry for immediate display. Best fit for current Ethos aggregates. |
| `updateTimeline(entries)` | Store dated future entries. Best for predictable changes such as day boundaries or countdowns. |
| `getTimeline()` | Read currently stored past and future entries. Useful for diagnostics and synchronization. |
| `reload()` | Ask WidgetKit to reload this widget kind. Do not call it continuously. |

The widget extension is not continuously alive. WidgetKit launches it on demand and renders stored timeline entries. Apple's scheduler controls exact refresh timing to preserve battery life.

Apple states that:

- Frequently viewed widgets commonly receive approximately 40 to 70 refresh opportunities in a 24-hour period.
- This roughly corresponds to intervals of 15 to 60 minutes, but is dynamic.
- Timeline entries should generally be at least about five minutes apart.
- The system may coalesce or delay refreshes.
- Apps should create future timeline entries when changes are predictable.
- Apps should request reloads only when displayed information actually changes.

For Ethos, transaction totals are event-driven, not naturally periodic. Publish a snapshot after the app finishes loading or mutating cashflow data. Do not poll every minute.

## Recommended Product Scope

### MVP: Current Month Home Screen Widget

Display:

- Active wallet name.
- Current month label.
- Current-month net cashflow as the primary value.
- Current-month income and expenses in the medium family.
- Last-updated text.
- A deep link to `/summary`.

Families:

- `systemSmall`.
- `systemMedium`.

Do not initially enable:

- `accessoryCircular`, `accessoryRectangular`, or `accessoryInline`.
- Interactive transaction creation.
- Wallet selection in widget configuration.
- Background network requests from the extension.
- Widget push notifications.
- Live Activities.

### Why Not a Lock Screen Financial Widget First

Lock Screen content is designed to be glanceable and can remain visible while the device is locked. Apple allows users to control whether widgets are redacted, but the app should not assume that monetary data is hidden by default. `@expo/ui` exposes `privacySensitive()`, but platform privacy settings still determine when WidgetKit applies privacy redaction.

The safer initial product policy is:

- Home Screen only.
- A user-facing "Show amounts in widget" setting, defaulting conservatively according to product policy.
- Masked labels such as `****` when privacy is enabled.
- No transaction names, notes, category details, member names, or account identifiers in widget props.
- Clear the snapshot on sign-out or local-data reset.

Lock Screen support can be evaluated later with dedicated privacy tests.

### Why Not a "Quick Add" Button That Writes Directly

Expo supports interactive widget `Button` controls on iOS 17+. The callback returns new widget props, which the extension persists without launching the app. That state is local to the widget timeline; it is not a safe database transaction path.

`addUserInteractionListener` can notify the main app about a target, but only while the app process is alive. It cannot guarantee that an Ethos entry is created while the app is terminated. Therefore:

- Use a `Link` to open `ethos://entry-form` or another Expo Router destination.
- Let the normal form, authentication, validation, SQLite write, and sync path create the entry.
- Never display a successful transaction state before the app has actually persisted it.

## Proposed Implementation

The following is a detailed example, not a change already applied to Ethos.

### 1. Install the SDK-Compatible Package

```sh
npx expo install expo-widgets
```

`@expo/ui` is already installed. Use `npx expo install` instead of selecting a package version manually so Expo resolves the compatible SDK 56 release. As of this research, the SDK 56 branch identifies `expo-widgets` version `56.0.24` and depends on `@expo/ui ~56.0.23`.

### 2. Configure the Widget Target

Add this plugin entry to the existing `app.json` `plugins` array:

```json
[
  "expo-widgets",
  {
    "bundleIdentifier": "com.rorez.ethos.widgets",
    "groupIdentifier": "group.com.rorez.ethos",
    "enablePushNotifications": false,
    "widgets": [
      {
        "name": "EthosMonthlyWidget",
        "displayName": "Monthly Cashflow",
        "description": "See this month's cashflow for your active Ethos wallet.",
        "ios": {
          "supportedFamilies": ["systemSmall", "systemMedium"]
        }
      }
    ]
  }
]
```

Important rules:

- `EthosMonthlyWidget` must be a valid Swift identifier.
- The same exact name must be passed to `createWidget`.
- Keep `contentMarginsDisabled` at its default `false` initially and let iOS provide appropriate widget margins.
- Keep `enablePushNotifications` false. It is intended for Live Activity push support and is unnecessary for a local summary widget.
- Do not manually duplicate `extra.eas.build.experimental.ios.appExtensions`; the SDK 56 plugin adds it. Verify the introspected config instead.
- Do not set `enableAndroid: true` for this project until Expo documents Android widget support as production-ready for the target SDK.

Expected generated EAS declaration conceptually resembles:

```json
{
  "targetName": "ExpoWidgetsTarget",
  "bundleIdentifier": "com.rorez.ethos.widgets",
  "entitlements": {
    "com.apple.security.application-groups": ["group.com.rorez.ethos"]
  }
}
```

### 3. Suggested File Layout

```text
src/
|-- widgets/
|   |-- EthosMonthlyWidget.tsx
|   `-- publishMonthlyWidget.ts
`-- data/
    `-- cashflow/
        `-- CashflowDataProvider.tsx
```

Keep the widget component small and self-contained. Keep data selection, currency formatting, localization, privacy policy, and update timing in the normal app runtime.

### 4. Define Serializable Props

Pass presentation-ready values instead of raw app models:

```ts
export type EthosMonthlyWidgetProps = {
  walletName: string;
  periodLabel: string;
  netLabel: string;
  incomeLabel: string;
  expenseLabel: string;
  updatedLabel: string;
  isPrivate: boolean;
  isEmpty: boolean;
};
```

Reasons to preformat values:

- The widget function stays pure and deterministic.
- Locale and currency behavior remains aligned with the app's `CurrencyProvider` and i18n state.
- The extension does not need access to app context.
- Props avoid exposing complete entry or wallet records in the shared group.
- A versioned, narrow payload is easier to migrate.

Only pass JSON-serializable values. Avoid functions, class instances, database rows, `BigInt`, and nonessential private fields.

### 5. Example Widget Component

```tsx
import { HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  padding,
  privacySensitive,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type EthosMonthlyWidgetProps = {
  walletName: string;
  periodLabel: string;
  netLabel: string;
  incomeLabel: string;
  expenseLabel: string;
  updatedLabel: string;
  isPrivate: boolean;
  isEmpty: boolean;
};

const EthosMonthlyWidget = (
  props: EthosMonthlyWidgetProps,
  environment: WidgetEnvironment,
) => {
  'widget';

  const backgroundColor = environment.colorScheme === 'dark' ? '#17181A' : '#F4F1EA';
  const primaryColor = environment.colorScheme === 'dark' ? '#F7F4ED' : '#17181A';
  const secondaryColor = environment.colorScheme === 'dark' ? '#B7B3AB' : '#65615A';
  const incomeColor = environment.widgetRenderingMode === 'fullColor' ? '#2E8B57' : primaryColor;
  const expenseColor = environment.widgetRenderingMode === 'fullColor' ? '#C45545' : primaryColor;
  const hiddenValue = '****';
  const netLabel = props.isPrivate ? hiddenValue : props.netLabel;
  const incomeLabel = props.isPrivate ? hiddenValue : props.incomeLabel;
  const expenseLabel = props.isPrivate ? hiddenValue : props.expenseLabel;

  if (environment.widgetFamily === 'systemSmall') {
    return (
      <Link destination="ethos://summary">
        <VStack
          alignment="leading"
          spacing={6}
          modifiers={[
            padding({ all: 4 }),
            containerBackground(backgroundColor, 'widget'),
          ]}
        >
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(secondaryColor)]}>
            {props.walletName}
          </Text>
          <Text modifiers={[font({ size: 11, weight: 'regular' }), foregroundStyle(secondaryColor)]}>
            {props.periodLabel}
          </Text>
          <Spacer />
          <Text
            modifiers={[
              font({ size: 22, weight: 'bold', design: 'rounded' }),
              foregroundStyle(primaryColor),
              privacySensitive(),
            ]}
          >
            {props.isEmpty ? 'No entries' : netLabel}
          </Text>
          <Text modifiers={[font({ size: 10, weight: 'regular' }), foregroundStyle(secondaryColor)]}>
            Net cashflow
          </Text>
        </VStack>
      </Link>
    );
  }

  return (
    <Link destination="ethos://summary">
      <VStack
        alignment="leading"
        spacing={8}
        modifiers={[
          padding({ all: 4 }),
          containerBackground(backgroundColor, 'widget'),
        ]}
      >
        <HStack>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(primaryColor)]}>
              {props.walletName}
            </Text>
            <Text modifiers={[font({ size: 11, weight: 'regular' }), foregroundStyle(secondaryColor)]}>
              {props.periodLabel}
            </Text>
          </VStack>
          <Spacer />
          <Text modifiers={[font({ size: 10, weight: 'regular' }), foregroundStyle(secondaryColor)]}>
            {props.updatedLabel}
          </Text>
        </HStack>

        <Text
          modifiers={[
            font({ size: 24, weight: 'bold', design: 'rounded' }),
            foregroundStyle(primaryColor),
            privacySensitive(),
          ]}
        >
          {props.isEmpty ? 'No entries this month' : netLabel}
        </Text>

        <HStack spacing={18}>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 10, weight: 'regular' }), foregroundStyle(secondaryColor)]}>
              Income
            </Text>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(incomeColor), privacySensitive()]}>
              {incomeLabel}
            </Text>
          </VStack>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 10, weight: 'regular' }), foregroundStyle(secondaryColor)]}>
              Expenses
            </Text>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(expenseColor), privacySensitive()]}>
              {expenseLabel}
            </Text>
          </VStack>
        </HStack>
      </VStack>
    </Link>
  );
};

export default createWidget<EthosMonthlyWidgetProps>(
  'EthosMonthlyWidget',
  EthosMonthlyWidget,
);
```

Implementation notes:

- `containerBackground(..., 'widget')` is important for modern WidgetKit background handling.
- `Link` opens the existing app instead of pretending to perform a financial mutation inside the extension.
- `widgetRenderingMode` avoids depending on red and green in monochrome or tinted modes.
- `privacySensitive()` participates in WidgetKit privacy redaction, while `isPrivate` implements the explicit Ethos preference.
- All colors and helper values are declared inside the widget function because module-scope runtime constants are unavailable to the serialized widget body.
- The example uses fixed English labels for clarity. A production implementation should pass localized labels as props or define a minimal locale value and all required strings inside the function.
- Verify each listed Expo UI prop and modifier against the installed SDK 56 TypeScript definitions during implementation; `@expo/ui` remains an evolving API.

### 6. Publish the Snapshot from the App Runtime

```ts
import { Platform } from 'react-native';

import type { CashflowStats } from '@/components/cashflow/CashflowStatsCard';
import EthosMonthlyWidget from '@/widgets/EthosMonthlyWidget';

type PublishMonthlyWidgetInput = {
  walletName: string;
  stats: CashflowStats;
  locale: string;
  currency: string;
  showAmounts: boolean;
};

export function publishMonthlyWidget({
  walletName,
  stats,
  locale,
  currency,
  showAmounts,
}: PublishMonthlyWidgetInput) {
  if (Platform.OS !== 'ios') return;

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  const net = stats.currentMonth.income - stats.currentMonth.expenses;

  EthosMonthlyWidget.updateSnapshot({
    walletName,
    periodLabel: stats.currentMonth.label,
    netLabel: formatter.format(net),
    incomeLabel: formatter.format(stats.currentMonth.income),
    expenseLabel: formatter.format(stats.currentMonth.expenses),
    updatedLabel: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date()),
    isPrivate: !showAmounts,
    isEmpty: stats.currentMonth.income === 0 && stats.currentMonth.expenses === 0,
  });
}
```

Use the app's actual currency formatting helper rather than creating a second policy if one is already available at implementation time. The essential design is to publish formatted strings, not to duplicate app context inside the extension.

### 7. Integrate with `CashflowDataProvider`

The provider already refreshes `entries`, computes `stats`, and knows the active management. A small effect near the provider boundary can publish whenever relevant state changes:

```tsx
useEffect(() => {
  if (!isReady || !activeManagement) return;

  publishMonthlyWidget({
    walletName: activeManagement.name,
    stats: entries.length > 0 ? stats : emptyCashflowStats,
    locale: currentLocale,
    currency: currentCurrency,
    showAmounts: showAmountsInWidget,
  });
}, [
  activeManagement,
  currentCurrency,
  currentLocale,
  entries.length,
  isReady,
  showAmountsInWidget,
  stats,
]);
```

The exact location depends on where currency, locale, and privacy preference are available. If they are above `CashflowDataProvider`, a dedicated `WidgetSync` component mounted inside all required providers may be cleaner than expanding the data provider's dependencies.

Required publication events:

- Initial app data load.
- Entry create, update, delete, move, transfer, recurring materialization, and sync refresh.
- Active wallet change.
- Currency or locale change.
- Widget privacy preference change.
- Sign-out, account removal, or local database reset.

Avoid placing `updateSnapshot` in every repository mutation. Publishing from derived provider state gives one consistent path for local writes, background materialization, and remote sync updates.

### 8. Clear Sensitive Data

On sign-out or database clear, replace the snapshot immediately:

```ts
EthosMonthlyWidget.updateSnapshot({
  walletName: 'Ethos',
  periodLabel: '',
  netLabel: '',
  incomeLabel: '',
  expenseLabel: '',
  updatedLabel: '',
  isPrivate: true,
  isEmpty: true,
});
```

Do not rely on uninstalling the widget or waiting for a later timeline refresh to remove stale financial values.

## Deep Linking

Ethos already declares `"scheme": "ethos"`. A widget can use Expo UI's native `Link` with a destination such as:

```tsx
<Link destination="ethos://summary">
  {/* widget content */}
</Link>
```

Verify the final URL on a physical device because grouped Expo Router routes do not appear in public paths. Expected destinations include:

| Action | Proposed URL | Expected route |
| --- | --- | --- |
| Open monthly summary | `ethos://summary` | `/(cashflow)/(tabs)/summary` |
| Add a transaction | `ethos://entry-form` | Root or cashflow entry form route, depending on final router registration |
| Open active cashflow | `ethos://cashflow` | Cashflow tab route |

Tests must cover cold launch, suspended app, already-running app, authenticated state, and signed-out state. A signed-out deep link should pass through the app's normal auth gate and must not expose widget payload data in URL query parameters.

## Configurable Widgets

Expo SDK 56 supports widget configuration on iOS 17+. Configuration is declared in app config and received through `environment.configuration`.

Example with a static privacy mode:

```json
{
  "name": "EthosMonthlyWidget",
  "displayName": "Monthly Cashflow",
  "description": "See this month's cashflow.",
  "ios": {
    "supportedFamilies": ["systemSmall", "systemMedium"],
    "configuration": {
      "title": "Monthly Cashflow",
      "description": "Choose how this widget displays amounts.",
      "parameters": {
        "visibility": {
          "title": "Amounts",
          "type": "enum",
          "default": "hidden",
          "values": [
            { "name": "Hidden", "value": "hidden" },
            { "name": "Visible", "value": "visible" }
          ]
        }
      }
    }
  }
}
```

This can be typed as:

```ts
type WidgetConfiguration = {
  visibility: 'hidden' | 'visible';
};

const EthosMonthlyWidget = (
  props: EthosMonthlyWidgetProps,
  environment: WidgetEnvironment<WidgetConfiguration>,
) => {
  'widget';
  const hideAmounts = environment.configuration.visibility === 'hidden';
  // Render using props and hideAmounts.
};

export default createWidget<EthosMonthlyWidgetProps, WidgetConfiguration>(
  'EthosMonthlyWidget',
  EthosMonthlyWidget,
);
```

Do not use SDK 56 static enum configuration to list Ethos wallets. Wallets are user-generated and synchronized at runtime, while the enum values in app config are generated at build time. The first widget should always follow the active wallet. A future SDK with dynamic configuration choices, or a custom App Intent implementation, can support per-widget wallet selection.

## Images

The widget cannot access files in the main app sandbox. `expo-widgets` exposes `widgetsDirectory`, a `file://` directory in the shared App Group. If a future widget displays a wallet image:

1. Copy or generate a small widget-optimized image from the main app into `widgetsDirectory`.
2. Give it a stable, sanitized filename.
3. Pass the shared path in widget props.
4. Remove obsolete files after wallet changes or sign-out.
5. Never copy receipt images or other sensitive attachments into the shared group for decorative use.

The monthly MVP does not need images and should avoid this extra lifecycle.

## Build, Signing, and Release Workflow

### Native Build Requirement

These changes require a new iOS build:

- Adding or upgrading `expo-widgets` native code.
- Adding the plugin configuration.
- Creating or renaming a widget.
- Changing supported widget families.
- Changing extension or App Group identifiers.
- Changing extension entitlements.
- Changing the widget component bundled into the extension.
- Enabling Live Activity push notifications.

Main-app code that only calls an already-shipped native API may be OTA-compatible in principle, but the widget's isolated bundle is built into the app extension during the native build. Treat widget layout changes as binary releases. With `runtimeVersion.policy = appVersion`, any native release also requires a new app version/runtime and corresponding builds.

### Local Generation and Verification

After installing and configuring the package:

```sh
npx expo config --type introspect
npx expo prebuild --clean --platform ios
npx expo run:ios
```

Because `ios/` is generated and ignored, `--clean` is the correct reproducibility check after reviewing that no deliberate manual native work exists there. Do not manually preserve generated widget files as source code.

Inspect the generated project for:

- `ExpoWidgetsTarget`.
- Extension bundle identifier `com.rorez.ethos.widgets`.
- Main app and extension App Group `group.com.rorez.ethos`.
- `ExpoWidgetsTarget.entitlements`.
- Generated WidgetKit source for `EthosMonthlyWidget`.
- Widget extension embedded in the Ethos application target.
- Extension deployment target matching the app's iOS target.

### EAS Build

The first build should be interactive so EAS can create or repair extension credentials and synchronize Apple capabilities:

```sh
eas build --profile development --platform ios
```

Then test preview and production profiles:

```sh
eas build --profile preview --platform ios
eas build --profile production --platform ios
```

EAS needs credentials for both bundle identifiers. The SDK 56 plugin declares the extension before the build so EAS CLI can generate and validate its provisioning profile. App Groups are a capability on Apple's servers and must be associated with both the main App ID and widget extension App ID.

If code signing fails with a message that the provisioning profile does not support `group.com.rorez.ethos`:

1. Inspect the introspected app config and generated extension entitlements.
2. Open Apple Developer Console and confirm that `group.com.rorez.ethos` exists.
3. Confirm the App Group is enabled and assigned to both `com.rorez.ethos` and `com.rorez.ethos.widgets`.
4. Run `eas credentials -p ios` and regenerate the widget extension provisioning profile.
5. Rebuild with `EXPO_DEBUG=1` if capability synchronization remains unclear.

An App Group synchronization issue was reported during the SDK 55 alpha period. SDK 56's plugin includes explicit EAS extension entitlements, but the manual checks above remain useful for existing Apple accounts and stale profiles.

## Testing Plan

### Build and Installation

- Clean iOS prebuild succeeds.
- iOS simulator build succeeds.
- Physical-device development build succeeds.
- EAS preview archive includes the `.appex` widget extension.
- App and extension profiles contain the App Group entitlement.
- The widget appears in the iOS widget gallery under Ethos.
- Display name and description are correct.

### Rendering

- `systemSmall` layout at supported display scales.
- `systemMedium` layout at supported display scales.
- Light appearance.
- Dark appearance.
- iOS 18+ tinted/accented rendering.
- Increased Contrast and Reduce Transparency settings.
- Larger Dynamic Type and accessibility text sizes.
- Long Indonesian wallet names.
- Long English wallet names.
- IDR, USD, and currencies with decimal minor units.
- Negative, zero, and very large net values.
- Empty current month.
- Fresh install before any snapshot has been published.
- Widget gallery preview state.
- Low-luminance or Always-On rendering where applicable.

### Data Correctness

- Initial snapshot matches the active wallet.
- Create income updates income and net.
- Create expense updates expense and net.
- Edit, delete, bulk delete, and move update values.
- Transfer behavior matches app totals.
- Due recurring entries update values.
- Remote sync refresh updates values.
- Active wallet switch replaces the snapshot.
- Month boundary shows the new current-month aggregate after the app next processes data.
- Currency and locale changes reformat all labels.
- No stale values remain after sign-out or database reset.

### Lifecycle

- App foregrounded.
- App backgrounded.
- App terminated.
- Device rebooted.
- Widget removed and re-added.
- App upgraded from a build without the widget.
- App upgraded between two widget-enabled builds.
- Widget retains a valid last snapshot while offline.

### Navigation

- Tap from Home Screen cold-launches Ethos summary.
- Tap while Ethos is suspended opens summary.
- Tap while Ethos is active navigates once without duplicate screens.
- Signed-out user is routed through authentication.
- Deep link does not bypass local biometric or app-lock behavior.
- No sensitive amounts or wallet IDs are placed in the URL.

### Privacy and Security

- Amounts are masked when the Ethos preference is disabled.
- `privacySensitive()` behavior is tested with device Lock Screen privacy settings.
- Snapshot is cleared on sign-out.
- Snapshot is cleared when all local data is deleted.
- Shared App Group contains only the minimal timeline and optional widget assets.
- No auth cookie, bearer token, SecureStore secret, receipt image, note, or individual transaction is copied into widget props.
- Screenshots and screen recordings are reviewed as part of the product privacy decision.

## Operational Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stale financial values | User sees outdated totals | Show an updated label; republish after every derived-state change; never imply real-time accuracy. |
| Widget visible while device is locked | Financial privacy exposure | Home Screen only for MVP, explicit amount-visibility preference, masking, `privacySensitive()`, clear on sign-out. |
| Widget code uses unsupported imports or hooks | Build error, runtime RedBox, or blank widget | Keep the `'widget'` function pure and self-contained; use only Expo UI SwiftUI components. |
| Module-scope constant referenced in widget | Runtime "Can't find variable" failure | Declare runtime constants and helpers inside the widget function or pass values in props. |
| Native target differs from app config | Non-reproducible local/EAS builds | Never edit generated target manually; regenerate with clean Prebuild. |
| App Group profile is stale | EAS/Xcode signing failure | Verify both App IDs, regenerate extension profile, use EAS capability debug logs. |
| Deep link path is wrong | Tap opens app but not intended screen | Test custom-scheme links for cold, warm, auth, and grouped-route cases. |
| Update called too often | Battery cost and WidgetKit throttling | Publish only when visible aggregate data changes; avoid timers and polling. |
| Interactive button appears to save but app is dead | Data loss or misleading UI | Use deep links for writes; reserve widget-local interactions for presentation state. |
| OTA assumed to replace extension bundle | Old widget layout remains | Ship widget layout and native configuration in a new binary. |
| Package regressions | Build or rendering failures | Stay on SDK-compatible latest patch, review SDK 56 changelog, test clean prebuild and physical device before production. |
| Long formatted currency clips | Unreadable widget | Test realistic IDR values; use size-specific typography and conservative labels. |

## Future Enhancements

### Lock Screen Summary

Add `accessoryRectangular` only after privacy tests. Prefer a qualitative value such as "On budget" or a masked trend over an exact balance.

### Quick Entry Deep Link

Add a second widget focused on opening the entry form. It should be an action surface, not a background database writer.

### Scheduled Timeline

Publish future entries around predictable local boundaries, such as the next day or month, if product behavior needs the label to change while the app remains closed. Future entries must contain values that can be calculated safely in advance.

### Configurable Wallets

Revisit when Expo exposes runtime-driven dynamic widget configuration for the supported SDK, or implement a custom App Intent if per-widget wallet selection becomes a high-value requirement.

### Live Activities

Live Activities are suitable for an in-progress, time-bounded event. Ordinary monthly cashflow is not such an event. Potential future fits might include a temporary spending session or time-boxed budget challenge, but this should not be conflated with a persistent Home Screen widget.

### Android Widget

Research Android separately when Expo's Android implementation is documented as stable. Do not enable an unfinished SDK 56 Android plugin path merely to claim parity.

## Recommended Delivery Sequence

1. Install the SDK-compatible `expo-widgets` package.
2. Add one explicit `EthosMonthlyWidget` config for small and medium Home Screen families.
3. Implement a self-contained, read-only widget with masked-value support and a summary deep link.
4. Add a dedicated publisher at the provider boundary using existing `buildStats` output.
5. Clear the widget on sign-out and local data reset.
6. Run config introspection and a clean iOS prebuild.
7. Build a new development client and test on a physical iPhone.
8. Validate App Group and extension credentials through EAS.
9. Test privacy, lifecycle, localization, large IDR values, deep links, and stale-data behavior.
10. Ship through preview before creating a new production binary.
11. Consider Lock Screen, per-wallet configuration, and interactivity only after the read-only widget is reliable.

## Official Sources

- [Expo SDK 56 reference](https://docs.expo.dev/versions/v56.0.0/)
- [Expo SDK 56 Widgets reference](https://docs.expo.dev/versions/v56.0.0/sdk/widgets/)
- [Expo UI SwiftUI reference](https://docs.expo.dev/versions/v56.0.0/sdk/ui/swift-ui/)
- [Expo UI Link](https://docs.expo.dev/versions/v56.0.0/sdk/ui/swift-ui/link/)
- [Expo UI modifiers](https://docs.expo.dev/versions/v56.0.0/sdk/ui/swift-ui/modifiers/)
- [Expo iOS widgets and Live Activities are stable in SDK 56](https://expo.dev/blog/ios-widgets-and-live-activities-in-expo)
- [Expo Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
- [Expo config plugins](https://docs.expo.dev/config-plugins/introduction/)
- [Expo iOS App Extensions](https://docs.expo.dev/build-reference/app-extensions/)
- [Expo iOS capabilities](https://docs.expo.dev/build-reference/ios-capabilities/)
- [Expo local credentials for multi-target apps](https://docs.expo.dev/app-signing/local-credentials/)
- [Expo `expo-widgets` SDK 56 source](https://github.com/expo/expo/tree/sdk-56/packages/expo-widgets)
- [Expo `expo-widgets` SDK 56 changelog](https://github.com/expo/expo/blob/sdk-56/packages/expo-widgets/CHANGELOG.md)
- [Apple WidgetKit](https://developer.apple.com/documentation/widgetkit)
- [Apple Creating a widget extension](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension)
- [Apple Developing a WidgetKit strategy](https://developer.apple.com/documentation/widgetkit/developing-a-widgetkit-strategy)
- [Apple Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
- [Apple TimelineProvider](https://developer.apple.com/documentation/widgetkit/timelineprovider)
- [Apple WidgetCenter](https://developer.apple.com/documentation/widgetkit/widgetcenter)
- [Apple Configuring App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)
- [Apple Making network requests in a widget extension](https://developer.apple.com/documentation/widgetkit/making-network-requests-in-a-widget-extension)

## Source Notes

- Expo's exact SDK 56 documentation was used rather than "latest" examples because widget APIs changed between the SDK 55 alpha and SDK 56 stable release.
- Apple documentation establishes the platform scheduling, timeline, App Group, and privacy model. Exact refresh timing is controlled by WidgetKit and is never guaranteed.
- GitHub issue reports were considered only for troubleshooting context. The recommended implementation is based on released SDK 56 documentation and source, not alpha-era workarounds.
- Code in this paper is an implementation design. It must be type-checked against the exact installed SDK 56 patch and tested in a generated iOS extension before production use.
