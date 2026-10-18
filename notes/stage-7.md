# Stage 7: Saved tab (part 1 of stage 7)

Built 18 Oct 2026 on branch `claude/stage-7-saved-a7d5df`. "Polish" and the "final accuracy check" are left for the very end, after every stage is merged.

## What's done

- **Saved plans** on the device (IndexedDB, a new `plans` table).
  - Save the plan you're working on, save changes, or "Save as a new plan" (keeps the old one too).
  - Rename, duplicate, delete (asks first), back up a single plan.
  - Open a saved plan in the Planner. If the plan in the Planner has unsaved work, the app asks first: save it, don't save, or cancel. Nothing is lost by accident.
  - "Undo changes" takes the Planner's plan back to its last saved version (asks first).
  - "New plan" starts a fresh, nearly empty plan.
  - Each saved plan shows its end balance and end date, so you can tell them apart.
- **Save bar** at the top of the Planner: "✓ Saved", or a Save button when the plan isn't saved or has changed.
- **Compare** up to 3 saved plans: one chart with a line per plan (balance over time) and a table of key numbers (end balance, end date, length, put in, taken out, your money, growth, goal). Uses the same Manual-mode engine as the Planner. Plans that can't be worked out yet say so instead of breaking. Mixed AUD/USD plans get a warning.
- **Backup file** (export/import), to move plans between the iPhone and the Mac:
  - iPhone: "Back up all plans" opens the share sheet → "Save to Files" or AirDrop to the Mac.
  - Mac: the file goes to Downloads.
  - Import: pick the file. The app checks it first and shows what will happen (new / already here / different) before anything is saved.
  - If a plan in the file is different from one with the same identity on this device, you choose: keep both (default), replace, or skip. Never overwritten silently.
  - Importing the same file twice adds nothing the second time.
  - Damaged plans in a file are skipped and listed; the rest still import. Files that aren't backups, are cut off, or come from a newer version of the app are refused with a plain message, and nothing changes.
- **Settings**: a "Your plans" section (plans stay on the device; back up from the Saved tab). Theme and disclaimer unchanged.

## How Soham can try it (Mac)

1. Start the app as usual (double-click `Start app.command`), or ask Claude to start the preview.
2. In the Planner, look at the top right: tap **Save**. It changes to "✓ Saved".
3. Change something (e.g. the starting balance). The top now says "Changed since you saved it". Go to the **Saved** tab and try **Save as a new plan**, so you have two plans.
4. In **Saved**, tick both plans and tap **Compare**. You should see two lines and a table.
5. Tap **⋯** on a plan to rename, duplicate, back it up, or delete it.
6. Tap **Back up all plans**. A file called "Plans backup (date).json" lands in Downloads.
7. Delete a plan, then tap **Import a backup** and pick that file. The plan comes back ("New"); the others show "Already here".

## Later, on the iPhone (after stage 2 puts the app online)

1. On the Mac, tap **Back up all plans**, then AirDrop the file from Downloads to the iPhone (it goes into Files → Downloads), or save it to iCloud Drive.
2. On the iPhone, open the app from the home screen → **Saved** → **Import a backup** → pick the file in Files.
3. Going the other way: on the iPhone tap **Back up all plans** → choose **Save to Files** (or AirDrop to the Mac). On the Mac, Import that file.

## Tests

- `src/saved/backup.test.ts`: round trip (including fields the app doesn't know yet), bad files (not JSON, wrong app, cut off, too big, newer version, damaged version/list), damaged plans skipped, duplicates (same / different / twice in one file / importing twice), keep both / replace / skip.
- `src/state/db.test.ts`: the database upgrade from stage 1 (version 1 → 2) keeps the current plan exactly, adds an empty plans table, and autosave still works; save/rename/duplicate/delete/import.
- `src/saved/compare.test.ts`: chart lines use the engine's exact numbers; 10 years at 7% matches the compound-interest formula.
- Also checked in the browser: the real upgrade (made a stage-1 style database, reloaded, plan still there), save/open/compare/rename/duplicate, export → import with a changed plan, a new plan, a damaged plan and a plan that's already there; a bad file; the iPhone share sheet path (simulated, since the preview browser has no share sheet: the app hands over a `.json` file, and cancelling the share sheet does nothing); phone-size and dark-mode layouts.
- `npm test` (63 tests), `npm run build` and `npm run lint` all pass.

## Decisions

- **Saving is a choice; the current plan still saves itself.** The Planner always remembers what you're working on (as in stage 1). The Saved tab keeps copies you choose to save, so you can experiment in the Planner and still go back.
- **Backup format** (`src/saved/backup.ts`): JSON with `app`, `kind`, `formatVersion: 1`, `exportedAt`, and `plans: [{ plan, createdAt, updatedAt }]`. Plans are written whole, so fields added by later stages travel with them.
- **"Same plan"** means the same id. Content is compared ignoring key order. "Keep both" gives the imported copy a new id and adds "(from backup)" to its name.
- **Compare uses saved plans only** (not unsaved edits in the Planner): save first to include them.
- **Compare colours**: blue, orange, green, checked with a colour-blindness simulator in light and dark mode (in `src/saved/saved.css`).
- **Chart tooltip** says "Around Dec 2041": each line's points are a few weeks apart, and the tooltip shows the engine's own number from the nearest earlier point rather than a made-up in-between value.
- **Storage**: the app asks the browser to keep its storage ("persistent storage") when a plan is saved. Browsers can still say no, which is why backups matter. On iPhone, use the app from the home screen; Safari can clear website data that isn't used for a while, and home-screen apps are treated better.

## Notes for merging (for the coordinating session)

- `src/state/db.ts` is now **Dexie version 2** (adds `plans: 'id, updatedAt'`). If another stage adds tables to this database, it should use **version 3** and repeat all tables.
- `PlannerPage` is now rendered with `key={plan.id}` in `App.tsx`, so it starts fresh when a different plan is opened. No changes inside `src/planner`.
- New dev dependency: `fake-indexeddb` (tests only). After merging, re-run `npm install` if `package-lock.json` conflicts.
- Stage 4 (fees/tax/inflation): plans are stored and exported whole, so new Plan fields are kept. Two follow-ups once stage 4 is in:
  1. `planShapeProblem` in `src/saved/backup.ts` only checks fields that existed in stage 1. Stage 4 should add checks for its new fields there if the Planner would crash on damaged values.
  2. Compare runs `runManual(plan)` / `validatePlan(plan)` through `src/saved/compare.ts`. If stage 4 changes how results are worked out (switches on/off), update `runPlan` there so Compare matches the Planner.
- The Saved tab has its own ⓘ texts in `src/saved/words.ts` and a copy of the ⓘ button (`HelpTip` in `src/saved/ui.tsx`), to avoid clashing with other stages' edits to `src/components/glossary.ts`. They can be folded into the shared glossary during polish.

## Problems / not done

- The iPhone share sheet and the iPhone file picker can't be fully tested until the app is on the iPhone (stage 2 hosting). The import file picker accepts `.json` files; if iPhone greys out the backup file, the fix is to drop the file-type filter on the picker (one line in `src/saved/BackupSection.tsx`).
- Polish and the final accuracy check are for the end of the build, as planned.
