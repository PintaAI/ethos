# LifeFlow Unified Items Plan

Status: Implemented in client, server, and MCP on August 8, 2026. Production reset and rollout are not executed.

## Implementation Record

The architecture in this document is implemented across:

- Expo client: `/root/projects/ethos`
- API and persistence server: `/root/projects/cashflow-notion`
- MCP tools hosted by the server

Implemented verification:

- Client: 38 tests pass across 14 files, including destructive migration rollback and optional Journal behavior.
- Client: `npx tsc --noEmit` passes.
- Client: `npm run lint` passes with no errors and eight unrelated pre-existing warnings.
- Client: iOS production export succeeds.
- Server and MCP: 12 focused tests pass.
- Server: `npx tsc --noEmit` and focused ESLint pass.
- Server: production Next.js build succeeds, including all 69 static pages.
- Both repositories: `git diff --check` passes.

Not executed as part of implementation:

- Production deletion of old LifeFlow entities.
- Server deployment or Expo OTA/native release.
- Physical-device interaction and visual regression testing.
- Web static export remains blocked by the existing SSR errors `window is not defined` and `this.validatePath is not a function`; the native iOS export is successful.

## Objective

Replace the separate Habit, Time Box, and Day Preset definitions with one shared `Item` model.

An Item is explicitly one of two kinds:

- `habit`: repeatable and loggable once per local calendar date.
- `event`: a normal calendar item that may be one-off or repeating and is not loggable.

Time and Item kind are independent. A habit may be timed or untimed, and an event may be timed or all-day. Recurring occurrences are calculated for the requested date range and are not stored as an unbounded set of rows.

## Confirmed Product Decisions

- The shared entity is named `Item` in code and API responses.
- Use `kind: "habit" | "event"`, not `isHabit`.
- Item kind is immutable after creation; changing semantics requires creating a new Item.
- Every habit requires recurrence. New habits default to daily recurrence.
- Events may be one-off or recurring.
- Initial recurrence frequencies are daily, weekly, monthly, and yearly.
- Recurrences continue indefinitely by default but may have an optional inclusive end date.
- Recurrence uses floating local time. A 7 PM Item remains at 7 PM in the user's current timezone.
- Habit logging is completion-only. The absence of a log means incomplete.
- Changing an Item's recurrence deletes that Item's previous logs and occurrence exceptions.
- Recurring events support full single-occurrence overrides, including cancellation and rescheduling.
- Overlapping timed Items are allowed, matching normal calendar behavior.
- Existing focus break durations remain supported on timed Items.
- Day Presets and preset blocks are removed without migration.
- The existing LifeFlow API contract may be replaced without backward compatibility.
- All existing LifeFlow data may be deleted during migration.
- Cashflow data must never be deleted or modified by the LifeFlow reset.
- App Check-in is created by default as a protected daily habit and is shown only on the LifeFlow Home screen.
- Daily Journal is an optional protected daily habit. Users may enable it during onboarding or from Journal settings.

## Non-Goals

- Migrating old habits, habit logs, time boxes, Day Presets, or preset blocks.
- Supporting fixed-timezone Items in the first version.
- Supporting occurrence-count recurrence limits. Ending on a specific date is supported.
- Supporting skipped, failed, partial, or quantity-based habit logs.
- Storing generated rows for every recurring occurrence.
- Preventing or warning about overlapping calendar Items.
- Preserving old LifeFlow sync payloads, MCP commands, or client provider methods.
- Changing cashflow managements, entries, categories, budgets, recurring entries, or any other cashflow records.

## Current Architecture Being Replaced

The Expo client currently stores six LifeFlow entity types:

- `habits`
- `habit_logs`
- `time_boxes`
- `day_presets`
- `day_preset_blocks`
- `day_preset_schedules`

The current model links habits to dated time boxes and synchronizes completion in both directions. Recurring schedules are represented through Day Presets, blocks, schedules, and virtual Time Box occurrences. App Check-in and Daily Journal are automatically created as special habits.

The server currently stores these entities as JSON payloads in the generic Prisma `LifeFlowEntity` model. The `/api/v1/lifeflow/sync` endpoint performs last-write-wins reconciliation and validates parent references. MCP exposes separate habit and schedule tools over the same storage.

The redesign removes the linked Habit/Time Box completion model. Habit completion will exist only in `habit_logs`; events will not have completion state.

## Target Domain Model

### Item

```ts
type ItemKind = "habit" | "event";
type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
type SystemItemType = "app_check_in" | "journal";

type Recurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: Weekday[];
  endsOn: string | null;
};

type Item = {
  id: string;
  managementId: string;
  kind: ItemKind;
  name: string;
  color: string;

  // For a one-off event this is its occurrence date. For a recurrence this
  // is the hidden calculation anchor and first eligible local date.
  startsOn: string;

  // Both are null for an untimed habit or all-day event.
  startTime: string | null;
  endTime: string | null;
  breakDurations: number[];

  // Required for habits, optional for events.
  recurrence: Recurrence | null;

  // Null for user-created Items.
  systemType: SystemItemType | null;
  createdAt: string;
  updatedAt: string;
};
```

`startsOn` is not presented as a required specific date when creating a habit. The client supplies the current local date automatically. It is required internally so interval calculations are deterministic across devices.

### Habit Log

```ts
type HabitLog = {
  itemId: string;
  date: string;
  completedAt: string;
  updatedAt: string;
};
```

There is at most one completion log for an Item and local date. Removing that row marks the habit incomplete. Missed days are derived from recurrence and the absence of a log; they are not persisted.

### Event Exception

```ts
type ItemException = {
  itemId: string;
  originalDate: string;
  replacementDate: string | null;
  cancelled: boolean;
  replacement: ItemOccurrenceSnapshot | null;
  createdAt: string;
  updatedAt: string;
};
```

An exception belongs only to a recurring event. Its identity is the Item ID plus the original virtual occurrence date. A non-cancelled exception stores a complete replacement snapshot rather than a sparse patch. This avoids ambiguous null values when changing a timed event into an all-day event.

Examples:

- Cancel one Saturday occurrence: `cancelled = true`.
- Move one occurrence from Saturday to Sunday: retain Saturday as `originalDate` and set Sunday as `replacementDate`.
- Rename or recolor one occurrence: keep the same replacement date and store the complete replacement snapshot.

## Local SQLite Schema

The exact migration may adjust constraint syntax for SQLite compatibility, but the intended schema is:

```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY NOT NULL,
  management_id TEXT NOT NULL REFERENCES managements(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('habit', 'event')),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  break_durations_json TEXT NOT NULL DEFAULT '[]',
  recurrence_frequency TEXT CHECK (
    recurrence_frequency IS NULL OR
    recurrence_frequency IN ('daily', 'weekly', 'monthly', 'yearly')
  ),
  recurrence_interval INTEGER NOT NULL DEFAULT 1 CHECK (recurrence_interval >= 1),
  recurrence_weekdays_json TEXT NOT NULL DEFAULT '[]',
  recurrence_ends_on TEXT,
  system_type TEXT CHECK (
    system_type IS NULL OR system_type IN ('app_check_in', 'journal')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (management_id, id),
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (start_time IS NOT NULL OR break_durations_json = '[]'),
  CHECK (kind = 'event' OR recurrence_frequency IS NOT NULL),
  CHECK (recurrence_frequency IS NOT NULL OR recurrence_ends_on IS NULL),
  CHECK (kind = 'habit' OR system_type IS NULL)
);

CREATE TABLE habit_logs (
  management_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (management_id, item_id, date),
  FOREIGN KEY (management_id, item_id)
    REFERENCES items(management_id, id) ON DELETE CASCADE
);

CREATE TABLE item_exceptions (
  management_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  original_date TEXT NOT NULL,
  replacement_date TEXT,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
  replacement_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (management_id, item_id, original_date),
  FOREIGN KEY (management_id, item_id)
    REFERENCES items(management_id, id) ON DELETE CASCADE,
  CHECK (
    (cancelled = 1 AND replacement_date IS NULL AND replacement_json IS NULL) OR
    (cancelled = 0 AND replacement_date IS NOT NULL AND replacement_json IS NOT NULL)
  )
);

CREATE INDEX items_management_kind_idx
ON items(management_id, kind, starts_on);

CREATE UNIQUE INDEX items_management_system_idx
ON items(management_id, system_type)
WHERE system_type IS NOT NULL;

CREATE INDEX habit_logs_management_date_idx
ON habit_logs(management_id, date);

CREATE INDEX item_exceptions_original_date_idx
ON item_exceptions(management_id, original_date);

CREATE INDEX item_exceptions_replacement_date_idx
ON item_exceptions(management_id, replacement_date)
WHERE replacement_date IS NOT NULL;
```

Application and server validation must enforce rules that are awkward to express as SQLite checks:

- Names are non-empty and colors are valid supported color values.
- Dates use `YYYY-MM-DD` and times use `HH:mm`.
- A habit always has recurrence.
- A one-off event has `recurrence = null`; `startsOn` is its event date.
- Weekly recurrence has at least one unique weekday.
- Daily, monthly, and yearly recurrence have no weekday list.
- `interval` is a positive integer.
- `endsOn` is optional, applies only to recurring Items, and must be on or after `startsOn`.
- The `endsOn` date is inclusive: an otherwise matching occurrence may appear on that date, but never after it.
- `startTime` and `endTime` are either both present or both absent.
- Equal start and end times are invalid. An end earlier than the start is an overnight Item.
- Break durations are empty for untimed Items.
- Break durations are positive multiples of five and fit inside the timed duration using the existing focus-segment rules.
- Habit logs can reference only habit Items and only dates on which recurrence applies.
- Item exceptions can reference only recurring event Items.
- System Items are habits, use daily recurrence, and cannot be renamed, manually rescheduled, or deleted through normal Item actions.

## Server Storage and Sync Contract

The Prisma `LifeFlowEntity` table can remain the physical server store. Its generic `(managementId, kind, entityId)` identity already supports the target architecture. Replace the old six sync kinds with:

```ts
type LifeFlowKind = "item" | "habit_log" | "item_exception";
```

No Prisma schema change is required for recurrence fields because `LifeFlowEntity.payload` is JSON. The new server Item payload contract should be explicit rather than accepting arbitrary JSON:

```ts
type ItemPayload = {
  id: string;
  kind: "habit" | "event";
  name: string;
  color: string;
  starts_on: string;
  start_time: string | null;
  end_time: string | null;
  break_durations_json: string;
  recurrence_frequency: "daily" | "weekly" | "monthly" | "yearly" | null;
  recurrence_interval: number;
  recurrence_weekdays_json: string;
  recurrence_ends_on: string | null;
  system_type: "app_check_in" | "journal" | null;
  created_at: string;
};
```

The server Zod schema must validate `recurrence_ends_on` as a local `YYYY-MM-DD` date when present, reject it for one-off events, and require it to be on or after `starts_on`. The field remains `null` for an indefinite recurrence.

The sync endpoint remains:

```text
POST /api/v1/lifeflow/sync
```

Its payload format remains a snapshot of live entities and tombstones, but old kinds and old payload schemas are rejected. This is a deliberate breaking contract replacement.

Identity rules:

- Item: `entityId = item.id`.
- Habit log: `entityId = item_id + "|" + date`.
- Item exception: `entityId = item_id + "|" + original_date`.

Dependency order:

1. Apply Item entities.
2. Apply habit logs and Item exceptions.
3. Apply child deletions.
4. Apply Item deletions.

Server validation must build the effective post-sync snapshot before committing and enforce parent kind, recurrence, system Item uniqueness, log eligibility, and exception eligibility. A recurrence change is rejected while any live log or exception remains, so sync clients must send child tombstones with the Item update. Last-write-wins behavior can remain based on `updatedAt`.

The server day/range resolver must apply the same inclusive boundary as the client:

```ts
if (item.recurrence_ends_on && occurrenceDate > item.recurrence_ends_on) {
  return false;
}
```

This check happens before the server resolver returns an occurrence to MCP or any future date-range API. It does not create or delete occurrence rows because occurrences remain virtual.

Tombstones remain necessary for normal post-launch deletion sync. The destructive migration reset is different: old LifeFlow server rows are deleted directly and are not converted into thousands of client-facing tombstones.

## Shared Domain API

The client provider and repositories should expose Item operations instead of separate Habit, Time Box, and Day Preset operations:

```ts
type LifeFlowContextValue = {
  items: Item[];
  habitLogs: HabitLog[];
  exceptions: ItemException[];
  loading: boolean;

  getOccurrencesForDate(date: string): ItemOccurrence[];
  getOccurrencesForRange(startDate: string, days: number): ItemOccurrence[];

  createItem(input: CreateItemInput): Promise<Item>;
  updateItem(id: string, input: UpdateItemInput): Promise<void>;
  deleteItem(id: string): Promise<void>;

  setHabitCompleted(itemId: string, date: string, completed: boolean): Promise<void>;

  overrideEventOccurrence(input: OverrideOccurrenceInput): Promise<void>;
  cancelEventOccurrence(itemId: string, originalDate: string): Promise<void>;
  restoreEventOccurrence(itemId: string, originalDate: string): Promise<void>;
};
```

Both creation forms submit through `createItem`. The Habit form fixes `kind` to `habit`; the calendar form fixes `kind` to `event`. Both use the same name, color, time, breaks, and recurrence inputs.

When `updateItem` changes any recurrence field, it must run one transaction that:

1. Shows and receives confirmation for the destructive history reset.
2. Deletes all habit logs for the Item.
3. Deletes all exceptions for the Item.
4. Updates the recurrence fields, including the optional end date.
5. Reconciles notifications from the new virtual occurrences.

Edits to name, color, time, or breaks do not delete logs. A single recurring event occurrence edit creates or replaces an exception instead of calling `updateItem` on the series.

## Recurrence Semantics

### General

- All recurrence calculations use local date keys, not UTC timestamps.
- Times are floating local wall-clock values. No timezone identifier is stored in the first version.
- `startsOn` is inclusive and anchors interval calculations.
- `endsOn` is optional and inclusive. A date after `endsOn` never produces an occurrence.
- `endsOn = null` means the recurrence continues until the Item is changed or deleted.
- Occurrences are generated only for a bounded requested range.
- An Item can produce at most one base occurrence per local date.

### Daily

An occurrence applies when the number of local calendar days since `startsOn` is non-negative and divisible by `interval`.

### Weekly

Weekly recurrence uses selected weekday codes and Monday-based calendar weeks. An occurrence applies when:

- The date is on or after `startsOn`.
- Its weekday is selected.
- The number of whole calendar weeks since the Monday of the anchor week is divisible by `interval`.

### Monthly

The day of month is derived from `startsOn`. The number of calendar months since the anchor month must be divisible by `interval`. If that day does not exist in a month, such as the 31st in April, the month is skipped rather than clamped.

### Yearly

The month and day are derived from `startsOn`. The number of calendar years since the anchor year must be divisible by `interval`. A February 29 Item is skipped in non-leap years.

### Example

"Coding for one hour every Friday and Saturday at 7 PM" stores one Item:

```json
{
  "kind": "event",
  "name": "Coding",
  "color": "#5B8CFF",
  "startsOn": "2026-08-08",
  "startTime": "19:00",
  "endTime": "20:00",
  "breakDurations": [],
  "recurrence": {
    "frequency": "weekly",
    "interval": 1,
    "weekdays": ["FR", "SA"],
    "endsOn": null
  }
}
```

No future occurrence rows are inserted. Asking for a calendar range calculates only the matching Friday and Saturday occurrences in that range.

To stop the Coding series after August 29, 2026, set `endsOn` to `"2026-08-29"`. The matching occurrence on August 29 remains visible because the boundary is inclusive; no occurrence is produced after that date.

## Occurrence Resolution

`resolveItemOccurrences(startDate, days, items, exceptions, logs)` should be a pure function shared conceptually by the client, server day endpoint, and MCP behavior.

For each bounded date:

1. Include one-off events whose `startsOn` equals the date.
2. Evaluate recurring Items against the date.
3. Build virtual occurrence IDs deterministically from Item ID and original date.
4. Remove recurring event occurrences cancelled by an exception.
5. Replace overridden occurrences with their complete exception snapshots.
6. Include moved exceptions whose replacement date is inside the requested range, even if their original date is outside it.
7. Attach the matching habit log to habit occurrences.
8. Sort all-day Items first, then timed Items by start time, then by stable Item ID.

Suggested occurrence identity:

```ts
type ItemOccurrence = {
  id: string; // `${itemId}|${originalDate}`
  itemId: string;
  originalDate: string;
  date: string;
  kind: ItemKind;
  name: string;
  color: string;
  startTime: string | null;
  endTime: string | null;
  breakDurations: number[];
  completed: boolean; // meaningful only when kind is "habit"
  overridden: boolean;
};
```

Overlapping Items and repeated colors remain in the result. The existing allocation and color-conflict guards must not silently discard occurrences.

## UI Behavior

### Habit Form

- Creates `kind = "habit"` through the shared Item API.
- Requires name and color.
- Defaults recurrence to daily.
- Supports daily, weekly, monthly, and yearly choices.
- Allows an optional inclusive recurrence end date.
- Allows optional start and end time.
- Shows break controls only when time is enabled.
- Hides the internal `startsOn` date unless a later product decision exposes "beginning today/on date."
- Does not offer a non-repeating option.

### Event Form

- Creates `kind = "event"` through the same shared Item API.
- Requires name, color, and `startsOn`.
- Allows an all-day event by leaving both times empty.
- Allows a one-off event with no recurrence.
- Supports the same recurrence and optional time controls as the Habit form.
- Shows an optional recurrence end date when repeat is enabled.
- Shows break controls only for timed events.

### Habit Surfaces

- Show only habit Items whose recurrence applies to the selected date.
- App Check-in is excluded from the normal Habits screen and appears only on LifeFlow Home.
- Daily Journal appears as a protected habit when enabled; pressing it opens Journal instead of manually completing it.
- User-created habits can be manually completed or uncompleted.
- Streaks and heatmaps derive expected dates from recurrence and completed dates from logs.

### Calendar Surfaces

- Show event occurrences and timed habit occurrences.
- Show untimed events in an all-day section.
- Do not show untimed habits as calendar blocks.
- Allow overlapping events visually instead of rejecting them.
- Event occurrences have no completion control.
- Editing a recurring event offers "this occurrence" and "entire series."
- "This occurrence" writes an exception.
- "Entire series" updates the Item. Recurrence changes clear previous exceptions; ordinary field edits preserve them.
- Deleting one occurrence writes a cancellation exception.
- Deleting the series deletes the Item and cascades its exceptions.

### LifeFlow Home

- Resolve today's Items through the same occurrence resolver as the calendar.
- Habit progress counts only habit occurrences and their logs.
- Events contribute to the schedule but not completion progress.
- App Check-in is visible only here and contributes as a daily protected habit.
- Opening LifeFlow for the first time on a local date records App Check-in completion automatically.
- Daily Journal completion is recorded from journal activity, not from a manual checkbox.

## System Items

System Items use the same Item schema and logs, with `systemType` supplying protected behavior.

### App Check-in

- Enabled by default for every LifeFlow management.
- Daily, interval one, untimed, with no end date.
- Uses a deterministic per-management ID to avoid duplicate creation across devices.
- Uses the fixed recurrence anchor `2020-01-01` and created timestamp `2020-01-01T00:00:00.000Z` so independently initialized devices produce identical synchronized payloads.
- Cannot be edited or deleted through normal Item actions.
- Hidden from Habit and Calendar management screens.
- Shown only on LifeFlow Home.
- Completed automatically once per local day when LifeFlow is opened.

### Daily Journal

- Disabled by default unless selected during onboarding.
- Can be enabled or disabled from Journal settings.
- Daily, interval one, untimed, with no end date.
- Uses a deterministic per-management ID.
- Uses the same fixed system Item anchor and created timestamp as App Check-in.
- Cannot be manually completed, renamed, or rescheduled.
- Journal activity creates today's completion log.
- Disabling it deletes the Item and its logs, consistent with the accepted destructive-history policy.

The server effective-snapshot validator must reject more than one live Item of each `systemType` per management.

## Notifications

- Replace Time Box notification reconciliation with Item occurrence reconciliation.
- Schedule notifications only for timed Item occurrences in a bounded future window, retaining the current 14-day approach unless product requirements change.
- Use deterministic occurrence IDs so recalculation updates rather than duplicates notifications.
- Apply cancellation and moved-occurrence exceptions before scheduling.
- Reconcile after Item, recurrence, time, exception, active-management, and local-date changes.
- Floating local times must be recalculated after timezone changes.

## Destructive Migration

The migration deliberately starts LifeFlow fresh. It must be narrowly scoped because LifeFlow tables currently share the same SQLite database and management records as cashflow.

### Server Reset

Delete only `LifeFlowEntity` rows whose kind is one of the old LifeFlow kinds:

```text
habit
habit_log
time_box
day_preset
day_preset_block
day_preset_schedule
```

Do not delete `Management` records or any cashflow model. Run and verify the reset with counts grouped by kind before and after. Deploy the new validation contract at the same coordinated release because old clients are intentionally unsupported.

### Client SQLite Migration

Run a versioned exclusive transaction:

1. Disable or drop the old LifeFlow delete/update triggers so the reset does not create obsolete tombstones.
2. Delete old LifeFlow tombstones.
3. Drop `habit_logs`.
4. Drop `time_boxes`.
5. Drop `day_preset_schedules`.
6. Drop `day_preset_blocks`.
7. Drop `day_presets`.
8. Drop `habits`.
9. Create `items`, the new `habit_logs`, and `item_exceptions`.
10. Create their indexes and sync triggers.
11. Remove obsolete system-habit ID preferences.
12. Create the deterministic App Check-in Item for each active LifeFlow management.
13. Create Daily Journal only where the new enablement preference is true.

The migration must not call `clearCashflowDatabase`, delete `managements`, or issue broad deletes against cashflow tables.

Before and after migration tests must assert unchanged row counts and representative content for at least:

- `managements`
- `management_members`
- `entries`
- `categories`
- `recurring_entries`
- `quick_fills`
- `overall_budgets`
- `audit_snapshots`
- `note_cache`
- `note_drafts`

### Release Coordination

Because compatibility is intentionally breaking, there is no rollout order that keeps both old and new clients functional against one strict server contract. Treat the server deployment, production LifeFlow reset, and client release as one coordinated maintenance release:

1. Back up and count production LifeFlow entities.
2. Deploy the new server contract, resolver, and MCP tools.
3. Delete old server LifeFlow entities only.
4. Immediately publish the new client release or OTA update.
5. Verify a clean client can create, sync, modify, and delete all three new entity kinds.
6. Verify cashflow totals and representative records are unchanged.

Old clients that have not updated will receive contract errors rather than silently reintroducing old entities.

## MCP Plan

Replace separate storage assumptions in `lifeflow_habit` and `lifeflow_schedule` with the unified Item model. A clean breaking design is:

- `lifeflow_today`: returns effective Item occurrences and habit completion state for a local date.
- `lifeflow_item`: creates, updates, or deletes a habit or event series using the shared fields.
- `lifeflow_habit_log`: completes or uncompletes an eligible habit date.
- `lifeflow_event_occurrence`: updates, moves, cancels, or restores one recurring event occurrence.

MCP descriptions must explain that recurrence is virtual, an optional end date is inclusive, habits require recurrence, events are not completable, overlap is allowed, and recurrence updates delete Item history.

### MCP Tool Contracts

`lifeflow_today` remains the primary read tool:

```ts
type LifeFlowTodayInput = {
  date: string;
};

type LifeFlowTodayResult = {
  date: string;
  occurrences: ItemOccurrence[];
};
```

It uses the shared server occurrence resolver, applies event exceptions, attaches habit completion, and excludes every virtual occurrence after an Item's inclusive `endsOn` date. It returns one unified occurrence list rather than separate habit and schedule storage representations.

`lifeflow_item` manages the shared Item definition:

```ts
type LifeFlowItemInput = {
  action: "create" | "update" | "delete";
  id?: string;
  kind?: "habit" | "event";
  name?: string;
  color?: string;
  starts_on?: string;
  start_time?: string | null;
  end_time?: string | null;
  break_durations?: number[];
  recurrence?: {
    frequency: "daily" | "weekly" | "monthly" | "yearly";
    interval: number;
    weekdays: Weekday[];
    ends_on: string | null;
  } | null;
  reset_history?: boolean;
};
```

Creation behavior:

- Creating a habit defaults omitted recurrence to daily, interval one, no weekdays, and no end date.
- Creating an event with `recurrence = null` creates a one-off event on `starts_on`.
- Creating a recurring event accepts the same recurrence object as a habit.
- `system_type` is not exposed through MCP creation or update inputs.

Update behavior:

- Normal name, color, time, and break edits preserve logs and exceptions.
- On a recurring Item, changing frequency, interval, weekdays, `starts_on`, or `ends_on` requires `reset_history = true`.
- Without that explicit flag, a recurrence-changing call fails before writing anything.
- With the flag, the server transaction updates the Item and soft-deletes its logs and exceptions so synced clients receive tombstones.
- Protected App Check-in and Daily Journal Items reject normal update and delete actions.

`lifeflow_habit_log` manages completion only:

```ts
type LifeFlowHabitLogInput = {
  item_id: string;
  date: string;
  completed?: boolean;
};
```

The tool verifies that the parent is a non-system habit and that recurrence applies on the requested local date. `completed` defaults to true. Setting it to false soft-deletes the log for synchronization. Events and protected system habits are rejected.

`lifeflow_event_occurrence` manages one virtual recurring event occurrence:

```ts
type LifeFlowEventOccurrenceInput = {
  action: "update" | "cancel" | "restore";
  item_id: string;
  original_date: string;
  replacement_date?: string;
  name?: string;
  color?: string;
  start_time?: string | null;
  end_time?: string | null;
  break_durations?: number[];
};
```

The server first verifies that `original_date` is a real occurrence under the Item's current recurrence and inclusive end date. Update inherits omitted fields from the base occurrence and writes a complete replacement snapshot, cancel writes a cancellation exception, and restore soft-deletes the exception. One-off events and habits are rejected.

### MCP Implementation Rules

- Keep the existing `lifeflow:read` and `lifeflow:write` OAuth scopes.
- Route MCP operations through shared LifeFlow service functions and Zod schemas rather than writing separate recurrence logic inside tool handlers.
- Continue storing MCP mutations in Prisma `LifeFlowEntity` so mobile sync receives the same entities and tombstones.
- Use one Prisma transaction for recurrence updates and their history deletion.
- Mark Item deletion, log removal, and exception restoration with `deletedAt`; do not hard-delete normal synchronized mutations.
- Allow overlapping timed Items and repeated colors.
- Use destructive MCP annotations for Item deletion, recurrence reset, and occurrence cancellation.
- Remove the old `lifeflow_habit` and `lifeflow_schedule` tools in the coordinated breaking release.

MCP tests must cover validation parity with mobile sync, recurrence end boundaries, destructive reset confirmation, soft-deleted child entities, moved occurrences, protected system Items, and the absence of generated future rows.

## Implementation Phases

### Phase 1: Pure Domain and Recurrence

- Define Item, HabitLog, ItemException, and ItemOccurrence types.
- Implement strict input validation.
- Implement floating-local daily, weekly, monthly, and yearly recurrence.
- Implement bounded occurrence resolution and exception overlays.
- Test recurrence and exception behavior independently of SQLite and React.

### Phase 2: Server Contract and Storage

- Replace old server Zod payload schemas and LifeFlow kinds.
- Update effective-snapshot parent validation.
- Update sync mutation ordering and tests.
- Replace the server day resolver.
- Replace LifeFlow MCP tools and tests.
- Prepare a production-safe old-kind deletion script with dry-run counts.

### Phase 3: Client Database and Repository

- Add the destructive, LifeFlow-only SQLite migration.
- Replace old repository methods with unified Item operations.
- Add sync collection/apply support for the three new kinds.
- Add tombstone triggers and dependency ordering.
- Add deterministic system Item creation.
- Add migration tests proving cashflow preservation.

### Phase 4: Provider and Notifications

- Replace separate habit, time-box, and preset state with Items, logs, and exceptions.
- Expose shared Item actions and occurrence selectors.
- Replace Time Box notification reconciliation with Item occurrence notifications.
- Remove linked completion synchronization.

### Phase 5: UI Replacement

- Replace Habit Add and Schedule Block forms with kind-specific presentations over shared Item inputs.
- Remove Day Preset routes, forms, and actions.
- Update Habits, Schedule, Home, heatmap, timeline, and dial consumers.
- Add recurring event occurrence-versus-series edit actions.
- Add optional Daily Journal onboarding/settings behavior.
- Restrict App Check-in visibility to LifeFlow Home.
- Update translations and accessibility labels.

### Phase 6: Coordinated Release

- Run client TypeScript, unit, integration, migration, and export checks.
- Run server tests, type checks, and production build.
- Back up and reset server LifeFlow rows only.
- Deploy the server and publish the client together.
- Verify sync and cashflow preservation in production.

## Test Plan

### Recurrence

- Daily recurrence resolves years ahead without persisted occurrence rows.
- Every-N-day intervals remain anchored to `startsOn`.
- Weekly recurrence supports multiple selected weekdays and every-N-week intervals.
- Weekly recurrence does not emit dates before `startsOn`.
- Monthly recurrence skips invalid month days.
- Yearly February 29 recurrence skips non-leap years.
- A recurrence may emit an occurrence on its inclusive end date but never after it.
- A null end date continues to resolve in bounded future ranges.
- Recurrence uses local date arithmetic without UTC date shifts.
- Range resolution is deterministic and bounded.

### Items and Logs

- Habit creation without recurrence is rejected.
- Event creation supports one-off and recurring forms.
- Timed and untimed variants work for both kinds.
- Overlapping timed Items are retained.
- Overnight Items and valid breaks are retained.
- Invalid time pairs and break durations are rejected.
- Completing an event is rejected.
- Completing a habit on a non-occurrence date is rejected.
- Completing twice remains one log.
- Uncompleting removes the log.
- Recurrence edits delete that Item's logs and exceptions atomically.
- Non-recurrence edits preserve logs.

### Exceptions

- Cancelling one occurrence does not affect the series.
- Moving an occurrence removes the original and adds the replacement.
- A moved occurrence is returned when only its replacement date is in range.
- Renaming, recoloring, retiming, and changing breaks affect only one occurrence.
- Restoring an occurrence removes its exception.
- Deleting an event cascades exceptions.

### System Items

- App Check-in is created once per management with a deterministic ID.
- App Check-in appears only on LifeFlow Home.
- Opening LifeFlow completes App Check-in once per local date.
- Daily Journal is created only when enabled.
- Journal activity completes the Journal habit.
- System Items reject normal edit, manual completion where prohibited, and delete actions.
- Multi-device sync does not create duplicate system Items.

### Sync and Server

- Item parents apply before logs and exceptions.
- Missing or wrong-kind parents are rejected.
- Old entity kinds are rejected.
- Tombstones delete the intended new entity only.
- Last-write-wins reconciliation remains deterministic.
- A full snapshot round trip preserves recurrence, breaks, system type, and exception data.
- MCP day results match client recurrence results for shared fixtures.

### Migration Safety

- Every old LifeFlow table and old LifeFlow tombstone is removed.
- New tables and triggers are created once and migrations are idempotent.
- No old LifeFlow data is migrated.
- Cashflow and note table counts and fixture values are byte-for-byte unchanged.
- Server reset deletes only old `LifeFlowEntity` rows.
- Reopening and syncing after reset cannot resurrect old kinds.

## Acceptance Criteria

- One shared Item definition represents both habits and calendar events.
- Habits always repeat and can be completed once per eligible local date.
- Events can be one-off or repeat daily, weekly, monthly, or yearly.
- Repeating Items continue indefinitely by default and can optionally stop on an inclusive end date.
- Start and end times are optional for both kinds and must be supplied together.
- A Friday/Saturday recurring Coding event uses one Item row and no generated future rows.
- Single recurring event occurrences can be cancelled, moved, or fully edited.
- Overlapping events remain visible.
- Focus break durations continue to work for timed Items.
- Recurrence edits clear the Item's prior logs and exceptions after confirmation.
- Day Presets are completely removed.
- App Check-in is default, protected, and visible only on LifeFlow Home.
- Daily Journal is optional and completed from journal activity.
- Client sync, server sync, and MCP use the same Item semantics.
- The migration removes all old LifeFlow data while leaving all cashflow data unchanged.
