// Comparing plans by their content, ignoring the order keys happen to be in.

/** JSON with object keys sorted, so two plans with the same content give the same text. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v === undefined ? null : v)).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** True when two plans have exactly the same content (every field, including ones added by later versions). */
export function samePlan(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}
