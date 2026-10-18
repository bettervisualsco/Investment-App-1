// Plain-English explanations behind the Inflation tab's ⓘ buttons (kept here so stages don't edit
// the same glossary file at once; can be folded into src/components/glossary.ts during polish).

export const inflationWords = {
  cpi: {
    title: 'CPI (Consumer Price Index)',
    body: 'A measure of how much a typical basket of things people buy (food, rent, petrol, health…) costs. If the CPI rises 3% in a year, prices rose 3% on average: that’s inflation. Australia’s comes from the ABS, the US’s from the BLS.',
  },
  yearlyInflation: {
    title: 'Yearly inflation',
    body: 'How much prices rose over the 12 months to that date. This is the figure you hear on the news. A few older figures here can differ by about 0.1 from the ones first announced, because the ABS has since re-based its index (Sep 2025 = 100): for example, the year to December 2022 was announced as 7.8% and works out to 7.9% from today’s index.',
  },
  quarterlyMonthly: {
    title: 'Quarterly or monthly CPI',
    body: 'Australia measured prices only every 3 months (each quarter) from 1948. A full monthly CPI started in April 2024, and since November 2025 it’s the main figure. Its yearly figures start in April 2025, because it needs a year of history to compare with. The long chart uses the quarterly figures.',
  },
  compoundAverage: {
    title: 'Average a year (compounded)',
    body: 'The steady yearly rate that gives the same total rise in prices. If prices rise 10% one year and 0% the next, the total is 10%, which is 4.88% a year compounded (1.0488 × 1.0488 = 1.10), not 5%. It’s worked out from the CPI at the start and end of the period.',
  },
  highlight: {
    title: 'Highlight a period',
    body: 'Drag across the chart with your finger or mouse to pick any period, or choose the years below it. The app works out how much prices rose from the start to the end, and the average a year.',
  },
  prediction: {
    title: 'How the prediction works',
    body: 'The app builds 2,000 possible futures by picking random 12-month chunks of real past inflation (from the years you choose) and joining them together. Worst, likely and best are the 90th, 50th and 10th percentiles of those futures. It’s an estimate based on history: it doesn’t know about today’s interest rates, wages or world events.',
  },
  percentiles: {
    title: 'Worst, likely and best',
    body: 'For inflation, worst means high (your money buys less): 1 in 10 of the simulated futures was higher than this line. Likely is the middle: half were higher, half lower. Best means low: 1 in 10 was lower.',
  },
  rbaTarget: {
    title: 'The RBA’s 2–3% target',
    body: 'Since 1993 the Reserve Bank of Australia has aimed to keep inflation between 2% and 3% a year on average, mainly by raising or cutting interest rates. The US Federal Reserve aims for 2% (officially since 2012).',
  },
  historyWindow: {
    title: 'Which years to learn from',
    body: 'Since 1993 is the default because that’s when the RBA started targeting 2–3% inflation, and the US has had similar low inflation since then. Earlier decades (prices rose 10–17% a year in the 1970s) happened under a different system. Pick “Full history” to include them, and see how much the answer changes.',
  },
  purchasingPower: {
    title: 'Buying power',
    body: 'What an amount of money could buy at one time, expressed in another year’s dollars. Past years use the real CPI (each year’s average). Future years use the prediction, so they’re a likely value with a range, measured from the latest CPI figure.',
  },
  realReturn: {
    title: 'Return after inflation (real return)',
    body: 'How much more your money could actually buy. It’s (1 + return) ÷ (1 + inflation) − 1, so a 10% return with 3% inflation is 6.8% after inflation. Returns here include distributions and have the ETF’s fee taken off.',
  },
  proxy: {
    title: 'Index history before the ETF',
    body: 'Most ETFs are young. For years before an ETF existed, the app uses the index it tracks (or a close match), with the ETF’s fee taken off. Rows marked * include some of these years.',
  },
  currencyView: {
    title: 'US ETFs in A$ or US$',
    body: 'In A$: what an Australian investor got, counting the exchange rate, after Australian inflation. In US$: what an American investor got, after US inflation.',
  },
} as const

export type InflationWord = keyof typeof inflationWords
