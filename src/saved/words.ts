// Plain-English explanations behind the Saved tab's ⓘ buttons.

export const savedWords = {
  savedPlans: {
    title: 'Saved plans',
    body: 'The Planner always remembers the plan you’re working on. Saving keeps a copy here too, so you can try changes in the Planner and still come back to it. Open a saved plan to keep working on it.',
  },
  compare: {
    title: 'Comparing plans',
    body: 'Shows up to 3 saved plans together: one line each for the balance over time, plus their key numbers. Each plan uses its own return rates, so it’s only as fair as the rates you typed in.',
  },
  backup: {
    title: 'Backup file',
    body: 'Your plans are stored on this device only. A backup is a small file with copies of your saved plans. Open it on your other device (iPhone or Mac) with “Import a backup” to move them across, or keep it somewhere safe in case this device is lost or reset.',
  },
  importChoices: {
    title: 'Plans that are different',
    body: 'The file has a version of a plan that’s also on this device, but the two aren’t the same (one of them was changed). Keep both adds the file’s version as a separate plan. Replace swaps the one here for the file’s version. Skip leaves the one here as it is.',
  },
} as const

export type SavedWord = keyof typeof savedWords
