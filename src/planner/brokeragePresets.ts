// Brokerage presets for buying ASX-listed ETFs, from each broker's own pricing
// page on the date below. Fees change often and some brokers run special
// offers, so these are labelled "check current fees" in the app.

import type { Brokerage } from '../engine/types'

export const BROKERAGE_CHECKED_ON = '2026-10-18'

export interface BrokeragePreset {
  id: string
  name: string
  brokerage: Brokerage
  /** Currency conversion fee for US shares, % (if the broker publishes one). */
  fxFeePct?: number
  note: string
  source: string
}

export const brokeragePresets: BrokeragePreset[] = [
  {
    id: 'commsec',
    name: 'CommSec',
    brokerage: {
      kind: 'tiered',
      tiers: [
        { upTo: 100_000, fee: 500, pct: 0 },
        { upTo: 300_000, fee: 1_000, pct: 0 },
        { upTo: 1_000_000, fee: 1_995, pct: 0 },
        { upTo: 2_500_000, fee: 2_995, pct: 0 },
        { upTo: null, fee: 0, pct: 0.12 },
      ],
    },
    fxFeePct: 0.55,
    note: '$5 up to $1,000, $10 to $3,000, $19.95 to $10,000, $29.95 to $25,000, then 0.12%. Needs a CommBank account to settle.',
    source: 'https://www.commsec.com.au/products/exchange-traded-funds.html',
  },
  {
    id: 'stake',
    name: 'Stake',
    brokerage: {
      kind: 'tiered',
      tiers: [
        { upTo: 3_000_000, fee: 300, pct: 0 },
        { upTo: null, fee: 0, pct: 0.01 },
      ],
    },
    fxFeePct: 0.55,
    note: '$3 a trade, or 0.01% above $30,000.',
    source: 'https://hellostake.com/au/pricing',
  },
  {
    id: 'pearler',
    name: 'Pearler',
    brokerage: { kind: 'flat', fee: 650 },
    fxFeePct: 0.5,
    note: '$6.50 a trade.',
    source: 'https://pearler.com/pricing',
  },
  {
    id: 'selfwealth',
    name: 'SelfWealth',
    brokerage: { kind: 'flat', fee: 950 },
    note: '$9.50 a trade.',
    source: 'https://www.selfwealth.com.au/pricing',
  },
  {
    id: 'cmc',
    name: 'CMC Invest',
    brokerage: { kind: 'percent', pct: 0.1, min: 1_100 },
    note: '$11 or 0.10%, whichever is more (their first buy under $1,000 of each ETF each day is $0, which isn’t counted here).',
    source: 'https://www.cmcmarkets.com/en-au/stockbroking/pricing',
  },
  {
    id: 'superhero',
    name: 'Superhero',
    brokerage: { kind: 'flat', fee: 200 },
    fxFeePct: 0.5,
    note: 'Advertised “from $2”, so some trades may cost more.',
    source: 'https://www.superhero.com.au/invest/pricing/',
  },
  {
    id: 'vanguard',
    name: 'Vanguard Personal Investor',
    brokerage: { kind: 'flat', fee: 0 },
    note: '$0 to buy Vanguard ETFs. Selling costs $9, which this preset doesn’t count.',
    source: 'https://www.vanguard.com.au/personal/invest-with-us/fees-and-costs',
  },
]
