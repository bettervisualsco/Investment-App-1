// Australian tax rates for residents, as published by the ATO.
// Every number here was checked on the date below against the page listed
// next to it. Rates for years after the last table are taken to stay the
// same (or to rise with inflation, if you choose that).
//
// Shown in Settings as the "rates checked on" date.

import type { TaxYear } from './types'

export const TAX_RATES_CHECKED_ON = '2026-10-18'

export const TAX_SOURCES = {
  rates: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents',
  futureRates: 'https://www.ato.gov.au/law/view/pdf/acts/20250028.pdf', // Treasury Laws Amendment (More Cost of Living Relief) Act 2025 (No. 28 of 2025)
  medicare: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-reduction/medicare-levy-reduction-for-low-income-earners',
  lito: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/low-income-tax-offset',
  minors: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-if-you-re-under-18-years-old',
  minorsIncome: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/income-you-must-declare/your-income-if-you-are-under-18-years-old',
  cgtDiscount: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/calculating-your-cgt/cgt-discount',
  cgtReform: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/capital-gains-tax-reform',
  // Treasury Laws Amendment (Tax Reform No. 1) Act 2026 (Act No. 49 of 2026): the Bill as passed by both Houses
  // (CGT changes, the minimum tax, and the Working Australians tax offset) and the Supplementary Explanatory Memorandum.
  taxReformAct: 'https://parlinfo.aph.gov.au/parlInfo/download/legislation/bills/r7493_aspassed/toc_pdf/26072b01.pdf;fileType=application%2Fpdf',
  taxReformSupplementaryEM: 'https://parlinfo.aph.gov.au/parlInfo/download/legislation/ems/r7493_ems_e5a9c782-fb39-4705-968e-e258fc04c742/upload_pdf/Supplementary%20EM_JC018520.pdf;fileType=application%2Fpdf',
  franking: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/shares-funds-and-trusts/investing-in-shares/refund-of-franking-credits-for-individuals',
  frankingRate: 'https://www.ato.gov.au/businesses-and-organisations/corporate-tax-measures-and-assurance/imputation/paying-dividends-and-other-distributions/allocating-franking-credits',
  fito: 'https://www.ato.gov.au/forms-and-instructions/foreign-income-tax-offset-rules-guide-2026/calculate-your-fito-or-offset-limit',
  usWithholding: 'https://www.irs.gov/pub/irs-lbi/tax-treaty-table-1.pdf',
} as const

// Low income tax offset: $700, minus 5c per $1 over $37,500, then (from $325 at $45,000) minus 1.5c per $1 over $45,000; nothing from $66,667.
const LITO = { max: 700, taper1From: 37_500, taper1Rate: 5, taper2From: 45_000, taper2Rate: 1.5, cutOut: 66_667 }

// Under-18s, income that isn't "excepted" (e.g. from investments bought with family money):
// $0–$416 nil; $417–$1,307 66% of the excess over $416; over $1,307 45% of the whole amount.
// Same in every year from 2020–21 to 2025–26; the ATO hasn't posted a 2026–27 table yet, so we assume no change.
const MINOR = { nilUpTo: 416, shadeRate: 66, fullFrom: 1_307, fullRate: 45 }

const bracketsFrom = (lowRate: number) => [
  { over: 0, rate: 0 },
  { over: 18_200, rate: lowRate },
  { over: 45_000, rate: 30 },
  { over: 135_000, rate: 37 },
  { over: 190_000, rate: 45 },
]

/** Resident individual tax tables, oldest first. */
export const ATO_TAX_YEARS: TaxYear[] = [
  {
    fy: 2025, // 2024–25
    brackets: bracketsFrom(16),
    medicare: { rate: 2, lowerThreshold: 27_222, upperThreshold: 34_027, shadeInRate: 10 },
    lito: LITO,
    minor: MINOR,
  },
  {
    fy: 2026, // 2025–26
    brackets: bracketsFrom(16),
    medicare: { rate: 2, lowerThreshold: 28_011, upperThreshold: 35_013, shadeInRate: 10 },
    lito: LITO,
    minor: MINOR,
  },
  {
    // 2026–27: 16% rate cut to 15%. Medicare thresholds for this year (and later years) aren't published yet, so 2025–26's
    // are used ("frozen"). The government usually raises them each year, so the levy may be a little too high near them.
    fy: 2027,
    brackets: bracketsFrom(15),
    medicare: { rate: 2, lowerThreshold: 28_011, upperThreshold: 35_013, shadeInRate: 10 },
    lito: LITO,
    minor: MINOR,
  },
  {
    fy: 2028, // 2027–28 and later (already law): 15% rate cut to 14%. Medicare thresholds: 2025–26's (see above).
    brackets: bracketsFrom(14),
    medicare: { rate: 2, lowerThreshold: 28_011, upperThreshold: 35_013, shadeInRate: 10 },
    lito: LITO,
    minor: MINOR,
  },
]

/**
 * Capital gains tax changes from 1 July 2027 (Treasury Laws Amendment (Tax Reform No. 1) Act 2026, "now law" per the ATO):
 * the 50% discount is replaced by cost base indexation (CPI) for gains from that date, with a minimum 30% tax on
 * certain net capital gains. Things you already own keep the 50% discount on their gain up to 30 June 2027.
 */
export const CGT_REFORM = {
  /** First day of the new rules. */
  startDate: '2027-07-01',
  minimumRatePct: 30,
} as const

/**
 * Working Australians tax offset (Act No. 49 of 2026, Schedule 3: ITAA 1997 s61-155 and s61-160), from 2027–28:
 * the lesser of $250 and the basic tax on your net labour income alone, if that income is above the tax-free
 * threshold. Not refundable. The $250 is a fixed amount in the law (the app raises it with "brackets rise with
 * inflation", like the low income tax offset).
 */
export const WORKING_OFFSET = {
  /** First financial year (named by the year it ends): 2027–28. */
  fromFy: 2028,
  /** Dollars. */
  max: 250,
} as const

/** Company tax rate used for franking credits on ETF distributions (large companies). */
export const FRANKING_COMPANY_RATE = 30
