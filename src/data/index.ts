// Market data for the app: types for every file in /data, the loader that keeps the device's copy
// up to date (and works offline), and helpers to read the compact files. See docs/DATA_FORMAT.md.

export * from './types'
export { alignedMonths, decodeDaily, monthValue, monthNumber, monthFromNumber, type AlignedMonths, type DailyRows } from './decode'
export { asOfText, freshnessLabel, isStale, timeAgo } from './freshness'
export { readDataFile, readSavedMeta, syncData, type SyncOptions, type SyncResult } from './loader'
export { getDataState, onDataChanged, refreshData, startDataSync, subscribeData, type DataState } from './sync'
export { useDataFile, useDataState, useFreshness } from './hooks'
