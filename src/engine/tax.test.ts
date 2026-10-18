import { describe, expect, it } from 'vitest'
import { bracketTax, extraTax, frankingCredit, incomeTax, litoFor, medicareLevy, minorEligibleTax, netCapitalGain, tableFor, yearTax, emptyYearIncome, type TaxYearContext } from './tax'
import { ATO_TAX_YEARS } from './taxTables'

const $ = (dollars: number) => dollars * 100
const fy = (year: number) => tableFor(ATO_TAX_YEARS, year)

describe('tax brackets match the ATO tables', () => {
  // "$X plus Yc for each $1 over $Z" figures copied from ato.gov.au (checked 18 Oct 2026).
  it('2025–26: $4,288 at $45,000, $31,288 at $135,000, $51,638 at $190,000', () => {
    expect(bracketTax(fy(2026), $(18_200))).toBe(0)
    expect(bracketTax(fy(2026), $(45_000))).toBeCloseTo($(4_288), 6)
    expect(bracketTax(fy(2026), $(135_000))).toBeCloseTo($(31_288), 6)
    expect(bracketTax(fy(2026), $(190_000))).toBeCloseTo($(51_638), 6)
    expect(bracketTax(fy(2026), $(50_000))).toBeCloseTo($(5_788), 6) // 4,288 + 30% × 5,000
  })

  it('2026–27 (15%): $4,020, $31,020 and $51,370', () => {
    expect(bracketTax(fy(2027), $(45_000))).toBeCloseTo($(4_020), 6)
    expect(bracketTax(fy(2027), $(135_000))).toBeCloseTo($(31_020), 6)
    expect(bracketTax(fy(2027), $(190_000))).toBeCloseTo($(51_370), 6)
    expect(bracketTax(fy(2027), $(200_000))).toBeCloseTo($(51_370 + 4_500), 6)
  })

  it('2027–28 and later (14%, already law): $3,752 at $45,000', () => {
    expect(bracketTax(fy(2028), $(45_000))).toBeCloseTo($(3_752), 6)
    expect(fy(2040).fy).toBe(2028) // later years use the latest table
    expect(fy(2000).fy).toBe(2025) // earlier years use the earliest we have
  })

  it('"brackets rise with inflation" moves every threshold up', () => {
    // At 10% higher thresholds, $49,500 is where 14% ends: 14% × (49,500 − 20,020)
    expect(bracketTax(fy(2028), $(49_500), 1.1)).toBeCloseTo($(0.14 * (49_500 - 20_020)), 6)
  })
})

describe('low income tax offset (LITO)', () => {
  it('$700 up to $37,500, $325 at $45,000, gone by $66,667', () => {
    expect(litoFor(fy(2027), $(30_000))).toBe($(700))
    expect(litoFor(fy(2027), $(37_500))).toBe($(700))
    expect(litoFor(fy(2027), $(40_000))).toBeCloseTo($(575), 6) // 700 − 5% × 2,500
    expect(litoFor(fy(2027), $(45_000))).toBeCloseTo($(325), 6)
    expect(litoFor(fy(2027), $(60_000))).toBeCloseTo($(100), 6) // 325 − 1.5% × 15,000
    expect(litoFor(fy(2027), $(66_667))).toBe(0)
  })

  it('with LITO, nobody pays income tax below about $22,867 in 2026–27', () => {
    expect(incomeTax(fy(2027), $(22_866), { medicare: false })).toBe(0)
    expect(incomeTax(fy(2027), $(23_000), { medicare: false })).toBeGreaterThan(0)
  })

  it('$60,000 in 2026–27: $8,520 − $100 LITO + $1,200 Medicare = $9,620', () => {
    expect(incomeTax(fy(2027), $(60_000), { medicare: true })).toBeCloseTo($(9_620), 6)
    expect(incomeTax(fy(2027), $(60_000), { medicare: false })).toBeCloseTo($(8_420), 6)
  })
})

describe('Medicare levy', () => {
  it('matches the ATO example: $29,000 in 2025–26 pays $98.90', () => {
    expect(medicareLevy(fy(2026), $(29_000))).toBeCloseTo($(98.9), 6)
  })
  it('nothing at the lower threshold, the full 2% above the upper one', () => {
    expect(medicareLevy(fy(2026), $(28_011))).toBe(0)
    expect(medicareLevy(fy(2026), $(35_013))).toBeCloseTo($(700.2), 6) // 10% of $7,002, just under 2% of $35,013
    expect(medicareLevy(fy(2026), $(40_000))).toBeCloseTo($(800), 6)
  })
})

describe('under-18 rates on investment income', () => {
  it('nil to $416, 66% of the excess to $1,307, then 45% of the whole amount', () => {
    expect(minorEligibleTax(fy(2027), $(416))).toBe(0)
    expect(minorEligibleTax(fy(2027), $(1_000))).toBeCloseTo($(385.44), 6) // 66% × 584
    expect(minorEligibleTax(fy(2027), $(1_307))).toBeCloseTo($(588.06), 6) // 66% × 891
    expect(minorEligibleTax(fy(2027), $(2_000))).toBeCloseTo($(900), 6) // 45% × 2,000
  })
})

describe('capital gains', () => {
  it('losses come off undiscounted gains first, then the 50% discount applies', () => {
    // $10,000 long-term + $2,000 short-term − $3,000 losses → (10,000 − 1,000) × 50%
    expect(netCapitalGain($(10_000), $(2_000), $(3_000))).toEqual({ net: $(4_500), indexedNet: 0, lossesLeft: 0 })
  })
  it('unused losses are carried forward', () => {
    expect(netCapitalGain($(10_000), $(2_000), $(20_000))).toEqual({ net: 0, indexedNet: 0, lossesLeft: $(8_000) })
  })
  it('indexed gains (from 1 July 2027) are taxed in full, after short-term gains take the losses', () => {
    expect(netCapitalGain($(1_000), $(500), $(800), $(2_000))).toEqual({ net: $(1_700 + 500), indexedNet: $(1_700), lossesLeft: 0 })
  })
})

const ctx = (c: Partial<TaxYearContext> = {}): TaxYearContext => ({
  year: fy(2027),
  index: 1,
  basis: 'rate',
  medicare: false,
  otherIncome: 0,
  marginalRate: 30,
  minorRates: false,
  cgtMinimumPct: 0,
  ...c,
})

describe('distributions, franking credits and foreign tax', () => {
  it('a franking credit is the 30% company tax already paid: $70 franked → $30', () => {
    expect(frankingCredit($(70))).toBeCloseTo($(30), 6)
  })

  it('$700 fully franked at a 30% rate: tax $300 on $1,000 grossed up, less the $300 credit = $0', () => {
    const t = yearTax(ctx(), { ...emptyYearIncome(), distributions: $(700), frankingCredits: $(300) })
    expect(t.assessable).toBeCloseTo($(1_000), 6)
    expect(t.tax).toBeCloseTo(0, 6)
  })

  it('at 45% + 2% Medicare you pay $170; with no other tax the $300 credit comes back as a refund', () => {
    expect(yearTax(ctx({ marginalRate: 45, medicare: true }), { ...emptyYearIncome(), distributions: $(700), frankingCredits: $(300) }).tax).toBeCloseTo($(170), 6)
    expect(yearTax(ctx({ marginalRate: 0 }), { ...emptyYearIncome(), distributions: $(700), frankingCredits: $(300) }).tax).toBeCloseTo(-$(300), 6)
  })

  it('foreign tax offset: $85 received after $15 US tax, at 30% → $30 − $15 = $15; never refunded', () => {
    const income = { ...emptyYearIncome(), distributions: $(85), foreignTax: $(15) }
    expect(yearTax(ctx(), income).tax).toBeCloseTo($(15), 6)
    expect(yearTax(ctx({ marginalRate: 0 }), income).tax).toBe(0)
  })

  it('income basis: extra tax on $100 on top of $48,000 (2027–28): 30% + 1.5% LITO taper + 2% Medicare', () => {
    expect(extraTax(ctx({ year: fy(2028), basis: 'income', medicare: true, otherIncome: $(48_000) }), $(100))).toBeCloseTo($(33.5), 6)
    // Thresholds 10% higher: 14% bracket, 5% LITO taper, 2% Medicare
    expect(extraTax(ctx({ year: fy(2028), basis: 'income', medicare: true, otherIncome: $(48_000), index: 1.1 }), $(100))).toBeCloseTo($(21), 6)
  })

  it('under 18 with no job: $1,000 of distributions → $385.44, and Medicare only if above its threshold', () => {
    expect(extraTax(ctx({ basis: 'income', medicare: true, minorRates: true }), $(1_000))).toBeCloseTo($(385.44), 6)
  })

  it('the minimum 30% tax tops up gains from 1 July 2027 when your own rate is lower', () => {
    const income = { ...emptyYearIncome(), indexedGains: $(10_000) }
    const low = yearTax(ctx({ year: fy(2028), basis: 'income', cgtMinimumPct: 30 }), income) // $10,000 alone is under the tax-free threshold
    expect(low.minimumTaxTopUp).toBeCloseTo($(3_000), 6)
    expect(low.tax).toBeCloseTo($(3_000), 6)
    // Worked example from the law's explanatory memorandum: a $50,000 gain on top of $40,000 other income.
    // Tax on $90,000 is $17,252 and on $40,000 $3,052, so $14,200 is on the gain; 30% would be $15,000 → $800 top-up.
    const em = yearTax(ctx({ year: fy(2028), basis: 'income', otherIncome: $(40_000), cgtMinimumPct: 30 }), { ...emptyYearIncome(), indexedGains: $(50_000) })
    expect(em.minimumTaxTopUp).toBeCloseTo($(800), 6)
    const high = yearTax(ctx({ year: fy(2028), marginalRate: 45, cgtMinimumPct: 30 }), income)
    expect(high.minimumTaxTopUp).toBe(0)
    expect(high.tax).toBeCloseTo($(4_500), 6)
  })
})
