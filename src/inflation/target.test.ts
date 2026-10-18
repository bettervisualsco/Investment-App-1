import { describe, expect, it } from 'vitest'
import { targetWord } from './target'

describe('RBA target label', () => {
  it('matches the figure as shown (1 decimal place)', () => {
    expect(targetWord(3.04)).toBe('Inside') // shown as 3.0%
    expect(targetWord(3.06)).toBe('Above') // shown as 3.1%
    expect(targetWord(1.96)).toBe('Inside') // shown as 2.0%
    expect(targetWord(1.94)).toBe('Below')
    expect(targetWord(4.0)).toBe('Above')
  })
})
