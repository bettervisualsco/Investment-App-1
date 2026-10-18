import { describe, expect, it } from 'vitest'
import { bracketTax, extraTax, frankingCredit, incomeTax, litoFor, medicareLevy, minorEligibleTax, minorTax, netCapitalGain, tableFor, workingOffset, yearTax, emptyYearIncome, type CapitalGains, type TaxYearContext } from './tax'
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
  const gains = (g: Partial<CapitalGains>): CapitalGains => ({ deferredDiscountable: 0, deferredOther: 0, other: 0, indexed: 0, discountable: 0, ...g })

  it('before 2027–28: losses come off undiscounted gains first, then the 50% discount applies', () => {
    // $10,000 long-term + $2,000 short-term − $3,000 losses → (10,000 − 1,000) × 50%
    expect(netCapitalGain(gains({ discountable: $(10_000), other: $(2_000) }), $(3_000))).toEqual({ net: $(4_500), minimumTaxBase: $(2_000 - 2_000), lossesLeft: 0 })
  })
  it('unused losses are carried forward', () => {
    expect(netCapitalGain(gains({ discountable: $(10_000), other: $(2_000) }), $(20_000))).toEqual({ net: 0, minimumTaxBase: 0, lossesLeft: $(8_000) })
  })
  it('from 2027–28 (s102-5(1) Step 1): losses reduce the deferred gains up to 30 June 2027 first, then the newer gains', () => {
    // Deferred: $600 short-term and $1,000 discountable. New: $500 short-term and $2,000 indexed. Losses $800.
    // The $600 deferred short-term gain goes first (your choice within the group), then $200 of the deferred discountable
    // gain: $800 left, halved = $400. The newer gains are untouched: $500 + $2,000 = $2,500, all of it in the minimum-tax base.
    expect(netCapitalGain(gains({ deferredOther: $(600), deferredDiscountable: $(1_000), other: $(500), indexed: $(2_000) }), $(800))).toEqual({
      net: $(400 + 2_500),
      minimumTaxBase: $(2_500),
      lossesLeft: 0,
    })
  })
  it('Supplementary EM Example 1.9: $600,000 deferred gain − $200,000 losses, halved, plus $412,000 newer gains', () => {
    // Asher's non-residential gains (his residential ones are out of scope for ETFs): a $600,000 deferred
    // discount gain, a $400,000 gain on the same rights from 1 July 2027 and a $12,000 short-term ASX share gain.
    const r = netCapitalGain(gains({ deferredDiscountable: $(600_000), indexed: $(400_000), other: $(12_000) }), $(200_000))
    expect(r.net).toBe($(200_000 + 412_000))
    expect(r.minimumTaxBase).toBe($(412_000)) // the short-term share gain counts too
  })
  it('losses beyond the deferred gains come off the newer (short-term and indexed) gains', () => {
    expect(netCapitalGain(gains({ deferredDiscountable: $(1_000), other: $(500), indexed: $(2_000) }), $(1_800))).toEqual({ net: $(1_700), minimumTaxBase: $(1_700), lossesLeft: 0 })
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

  it('under 18: $1,000 of distributions → $385.44, plus the Medicare levy only when their income is above its threshold', () => {
    // No job: $1,000 is far below the $28,011 Medicare threshold, so no levy.
    expect(extraTax(ctx({ basis: 'income', medicare: true, minorRates: true }), $(1_000))).toBeCloseTo($(385.44), 6)
    // A $40,000 job (above the $35,013 upper threshold): 2% of the extra $1,000 = $20 on top.
    // (30% as the top slice would be $300, less than $385.44, so the special rate stands.)
    expect(extraTax(ctx({ basis: 'income', medicare: true, minorRates: true, otherIncome: $(40_000) }), $(1_000))).toBeCloseTo($(405.44), 6)
  })

  it('under 18: the special rate, or if greater the tax on that income as the top slice at the general rates', () => {
    // ATO under-18 rates, note to the 66% band. A $30,000 job plus $500 from family money in 2025–26:
    // 66% × ($500 − $416) = $55.44, but as the top slice: 16% × $500 = $80. $80 applies (no LITO either way).
    const job = ctx({ year: fy(2026), basis: 'income', minorRates: true, otherIncome: $(30_000) })
    expect(minorTax(job, $(500))).toBeCloseTo($(80), 6)
    expect(extraTax(job, $(500))).toBeCloseTo($(80), 6)
    // With a marginal rate instead: 30% × $500 = $150 beats $55.44; on $2,000, 45% ($900) beats 30% ($600).
    expect(minorTax(ctx({ minorRates: true, marginalRate: 30 }), $(500))).toBeCloseTo($(150), 6)
    expect(minorTax(ctx({ minorRates: true, marginalRate: 30 }), $(2_000))).toBeCloseTo($(900), 6)
    // Up to $416 only the general rates apply: with no job that's $0.
    expect(minorTax(ctx({ basis: 'income', minorRates: true }), $(400))).toBe(0)
  })

  it('the minimum 30% tax tops up gains from 1 July 2027 when your own rate is lower', () => {
    const income = { ...emptyYearIncome(), indexedGains: $(10_000) }
    const low = yearTax(ctx({ year: fy(2028), basis: 'income', cgtMinimumPct: 30 }), income) // $10,000 alone is under the tax-free threshold
    expect(low.minimumTaxTopUp).toBeCloseTo($(3_000), 6)
    expect(low.tax).toBeCloseTo($(3_000), 6)
    // Supplementary Explanatory Memorandum (JC018520), Example 1.17 (Genevieve): a $50,000 minimum tax capital gain on
    // top of $40,000 other income. Tax on $90,000 is $17,252 and on $40,000 $3,052, so $14,200 is on the gain; 30% would
    // be $15,000 → $800 top-up.
    const em = yearTax(ctx({ year: fy(2028), basis: 'income', otherIncome: $(40_000), cgtMinimumPct: 30 }), { ...emptyYearIncome(), indexedGains: $(50_000) })
    expect(em.minimumTaxTopUp).toBeCloseTo($(800), 6)
    const high = yearTax(ctx({ year: fy(2028), marginalRate: 45, cgtMinimumPct: 30 }), income)
    expect(high.minimumTaxTopUp).toBe(0)
    expect(high.tax).toBeCloseTo($(4_500), 6)
  })
})

describe('the minimum tax (s119-10(2))', () => {
  it('the shortfall is rounded down to whole dollars (Step 6)', () => {
    // $10,000.50 of gains with no other income: 30% = $3,000.15, basic tax $0 → $3,000 top-up.
    const t = yearTax(ctx({ year: fy(2028), basis: 'income', cgtMinimumPct: 30 }), { ...emptyYearIncome(), indexedGains: $(10_000.5) })
    expect(t.minimumTaxTopUp).toBe($(3_000))
  })

  it('counts short-term gains made from 1 July 2027, but not the deferred gain up to 30 June 2027', () => {
    // $488.09 short-term gain at a 10% rate: 10% = $48.81, plus the 20% gap ($97.62) rounded down to $97.
    const short = yearTax(ctx({ year: fy(2028), marginalRate: 10, cgtMinimumPct: 30 }), { ...emptyYearIncome(), otherGains: $(488.09) })
    expect(short.minimumTaxTopUp).toBe($(97))
    expect(short.tax).toBeCloseTo($(48.809 + 97), 6)
    // A deferred (pre-July 2027) gain isn't part of the minimum tax capital gain.
    const deferred = yearTax(ctx({ year: fy(2028), marginalRate: 10, cgtMinimumPct: 30 }), { ...emptyYearIncome(), deferredOtherGains: $(488.09) })
    expect(deferred.minimumTaxTopUp).toBe(0)
  })
})

describe('Working Australians tax offset (from 2027–28)', () => {
  it('the lesser of $250 and the basic tax on labour income, only above the tax-free threshold', () => {
    expect(workingOffset(fy(2028), $(20_000), 250)).toBeCloseTo($(250), 6) // 14% × $1,800 = $252 → $250
    expect(workingOffset(fy(2028), $(19_000), 250)).toBeCloseTo($(112), 6) // 14% × $800
    expect(workingOffset(fy(2028), $(18_200), 250)).toBe(0) // not above the threshold
    expect(workingOffset(fy(2028), $(60_000), 0)).toBe(0) // not available (before 2027–28)
  })

  it('it can absorb tax on investment income: $22,000 job + $3,000 unfranked distributions in 2028–29 → $2', () => {
    // Tax on $25,000: 14% × $6,800 = $952 − $700 LITO − $250 offset = $2. On $22,000 alone: $532 − $950 → $0.
    const income = { ...emptyYearIncome(), distributions: $(3_000) }
    const withOffset = yearTax(ctx({ year: fy(2028), basis: 'income', otherIncome: $(22_000), workingOffsetMax: 250 }), income)
    expect(withOffset.tax).toBeCloseTo($(2), 6)
    // Without it (e.g. 2026–27's rules but the same brackets): $952 − $700 = $252.
    expect(yearTax(ctx({ year: fy(2028), basis: 'income', otherIncome: $(22_000) }), income).tax).toBeCloseTo($(252), 6)
    // Job income below the tax-free threshold: no offset. $15,000 + $10,000: 14% × $6,800 − $700 = $252.
    const lowJob = yearTax(ctx({ year: fy(2028), basis: 'income', otherIncome: $(15_000), workingOffsetMax: 250 }), { ...emptyYearIncome(), distributions: $(10_000) })
    expect(lowJob.tax).toBeCloseTo($(252), 6)
  })
})

describe('foreign income tax offset limit', () => {
  it('with "other income", it can cancel tax on your job too, so a 14% rate still gets the full 15% back', () => {
    // 2028–29, $30,000 job: $100 grossed-up US income ($85 + $15 US tax) adds 14% = $14. The $15 offset cancels that
    // and $1 of the tax on the job ($1,652 − $700 − $250 = $702), so the investment's tax is −$1.
    const income = { ...emptyYearIncome(), distributions: $(85), foreignTax: $(15) }
    const t = yearTax(ctx({ year: fy(2028), basis: 'income', otherIncome: $(30_000), workingOffsetMax: 250 }), income)
    expect(t.foreignTaxOffset).toBeCloseTo($(15), 6)
    expect(t.tax).toBeCloseTo(-$(1), 6)
    // With no other income there's no tax to cancel: nothing back.
    expect(yearTax(ctx({ year: fy(2028), basis: 'income' }), income).tax).toBe(0)
  })
})
