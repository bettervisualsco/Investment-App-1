// Is inflation above, below or inside the RBA's 2–3% target?
/** Above / Below / Inside the 2–3% target, judged on the figure as shown (rounded to 1 decimal place). */
export function targetWord(pctValue: number): 'Above' | 'Below' | 'Inside' {
  const shown = Math.round(pctValue * 10) / 10
  return shown > 3 ? 'Above' : shown < 2 ? 'Below' : 'Inside'
}
