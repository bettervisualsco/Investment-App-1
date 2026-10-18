// Hook for the Inflation settings' "Use historical average" button.
//
// The average needs Australian CPI history, which arrives with stage 2's data
// files. Until then nothing passes it in and the button stays disabled. When
// the branches are merged, work out the average from the CPI data and pass it
// to <PlannerPage historicalInflation={...} /> (from App.tsx).

export interface HistoricalInflation {
  /** Average yearly inflation, % (e.g. 2.6). */
  rate: number
  /** Shown next to the button, e.g. "Australian CPI, average of 1990–2025 (ABS)". */
  label: string
}
