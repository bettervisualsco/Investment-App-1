// Plain-English explanations behind every ⓘ button.

export const glossary = {
  manualMode: {
    title: 'Manual mode',
    body: 'Uses the return rates you type in, so you get one steady growth line. Real markets go up and down: Prediction mode replays real market history to show a range of outcomes.',
  },
  returnRate: {
    title: 'Return rate',
    body: 'How much your investments grow each year, as a percentage. 7% means $100 becomes $107 after a full year. Growth is added a little each day, and each calendar month counts as exactly 1/12 of a year.',
  },
  compounding: {
    title: 'Growth on growth',
    body: 'Your growth is added to your balance, so later growth is worked out on a bigger amount. That snowball is called compounding.',
  },
  depositTiming: {
    title: 'When deposits land',
    body: 'Each deposit lands at the start of its day and starts growing straight away. The first one lands on the phase’s first day, then every week, month and so on after that. A year has 52 weeks and 1 day, so weekly deposits can add up to 53 in a year.',
  },
  changeOverTime: {
    title: 'Changing over time',
    body: 'Same: one amount the whole phase. Ramp: glides from a start amount to an end amount, so the first deposit is the start amount and the last is the end amount. Steps: jumps by a set amount at regular times, like +$20 every 6 months.',
  },
  curve: {
    title: 'Curve shape',
    body: 'Straight line rises by the same amount each time. Slow then fast starts with small rises and finishes with big ones. Fast then slow is the opposite.',
  },
  changeWindow: {
    title: 'Part of the phase',
    body: 'Choose when the change starts and how long it takes. Before it starts, the starting amount is used. After it finishes, the amount stays where it ended up.',
  },
  events: {
    title: 'One-off events',
    body: 'A single deposit or withdrawal on a set date, like birthday money or buying a car. If a withdrawal is bigger than your balance, only what’s there is taken out and the balance stops at $0.',
  },
  goal: {
    title: 'Goal',
    body: 'An amount you’d like to have by a date. The app checks your balance at the end of that day.',
  },
  yourMoney: {
    title: 'Your money',
    body: 'Your starting balance plus everything you put in, minus anything you took out.',
  },
  growth: {
    title: 'Growth',
    body: 'What your investments earned on top of the money you put in.',
  },
  financialYear: {
    title: 'Financial year',
    body: 'Australia’s tax year runs from 1 July to 30 June. “2026–27” means 1 July 2026 to 30 June 2027. The first and last rows may be part-years.',
  },

  // Stage 4: realism switches
  realism: {
    title: 'Fees, Tax and Inflation switches',
    body: 'Each switch adds one real-world cost on top of the return rates you typed. Turn on any mix. Every change recalculates straight away. Tax is a simplified estimate, not tax advice.',
  },
  showCost: {
    title: 'Show the cost',
    body: 'Shows the result with every switch off as a dashed line, and how much fees, then tax, then inflation each take away. Each one is measured on top of the ones before it.',
  },
  mer: {
    title: 'Management fee (MER)',
    body: 'The yearly fee the fund charges, as a % of what you hold. It comes out a little each month (1/12 of the yearly fee on the last day of each month), so you never see a bill, just slightly lower growth.',
  },
  brokerage: {
    title: 'Brokerage',
    body: 'What your broker charges for each buy or sell. A flat fee hurts small, frequent buys the most. The presets are what brokers’ websites showed on 18 Oct 2026, so check current fees.',
  },
  buyFrequency: {
    title: 'How often you buy',
    body: 'You can deposit weekly but only buy every month or quarter to pay less brokerage. Money waiting to be invested sits as cash and earns the cash rate below. A buy is put off if the brokerage would be as much as the cash.',
  },
  cashRate: {
    title: 'Cash rate',
    body: 'Interest earned by money waiting to be invested, % a year (like a savings account). Use 0 if it just sits in a broker account.',
  },
  fxFee: {
    title: 'Currency conversion fee',
    body: 'For ETFs listed in the US (like VOO), your Australian dollars are changed into US dollars to buy, and back to sell. Brokers charge a % each time. Only phases marked “Listed in the US” pay it.',
  },
  platformFee: {
    title: 'Account / platform fee',
    body: 'A fixed fee some platforms charge just for having an account. Monthly fees come off on the last day of each month; yearly fees on 30 June (part-years pay part).',
  },
  spread: {
    title: 'Buy/sell spread',
    body: 'The small gap between the price you pay to buy and the price you get to sell. It’s charged on each buy and each sale, as a % of the trade.',
  },
  taxBasis: {
    title: 'How tax is worked out',
    body: 'From your other income: the app adds your investment income on top of your job income and uses the real tax brackets, low income tax offset, Working Australians tax offset (from 2027–28) and Medicare levy. Or just pick your marginal rate: the % you pay on your last dollar.',
  },
  otherIncome: {
    title: 'Other taxable income',
    body: 'Your income from everything else (job etc.) for a full year. It decides which tax bracket your investment income lands in. If a financial year covers two phases, each phase counts for its share of the days. From 2027–28 the app treats all of it as job income for the Working Australians tax offset (up to $250 off your tax if it’s above $18,200), which can also cancel a little tax on low earners’ investment income.',
  },
  marginalRate: {
    title: 'Marginal tax rate',
    body: 'The tax rate on your last dollar of income. For 2026–27: 0% up to $18,200, 15% to $45,000, 30% to $135,000, 37% to $190,000, 45% above. The Medicare levy (2%) is added separately if it’s on.',
  },
  medicare: {
    title: 'Medicare levy',
    body: '2% of taxable income, paying for Medicare. People on low incomes pay less or none (no levy up to $28,011 in 2025–26). The thresholds for 2026–27 and later aren’t published yet, so 2025–26’s are used (they usually rise a little each year, so near them the levy may be slightly overstated).',
  },
  brackets: {
    title: 'Future tax brackets',
    body: '“Stay the same”: brackets never change, so as incomes rise with prices you slowly pay more (bracket creep). “Rise with inflation”: every threshold goes up with the inflation rate from 2027–28 on. In real life governments sometimes adjust them.',
  },
  distribution: {
    title: 'Distributions',
    body: 'Cash an ETF pays you from the dividends and interest it earns, usually every 3 or 6 months. The yield is part of your return rate, not extra. Distributions are taxed in the financial year you get them.',
  },
  franking: {
    title: 'Franking credits',
    body: 'Australian companies pay 30% company tax before paying dividends. A franked dividend carries a credit for that tax. You add the credit to your income, then it comes off your tax bill, and any left over is refunded.',
  },
  foreignTax: {
    title: 'Foreign tax offset',
    body: 'The US usually keeps 15% of dividends paid to Australians (with a W-8BEN form). You can claim that as an offset so you aren’t taxed twice, but it can only cancel tax: it’s never refunded.',
  },
  reinvest: {
    title: 'Reinvest or take as cash',
    body: 'Reinvest: the distribution, after its tax, buys more units (no brokerage, like a dividend reinvestment plan). Cash: it’s paid to you and leaves the investment.',
  },
  cgt: {
    title: 'Capital gains tax (CGT)',
    body: 'When you sell for more than you paid (plus buying costs), the profit is a capital gain and is added to your taxable income. Each purchase is tracked separately, and sales use the oldest ones first. A loss can be used against gains, now or in later years.',
  },
  cgtDiscount: {
    title: 'The 50% CGT discount',
    body: 'If you held something at least 12 months (not counting the day you bought or sold), only half the gain is taxed. A new law replaces this from 1 July 2027 for gains made from then on.',
  },
  cgt2027: {
    title: 'CGT changes from 1 July 2027',
    body: 'Now law: for gains from 1 July 2027, instead of halving the gain, the price you paid is raised by inflation (cost base indexation), and a minimum 30% tax applies to those gains. Gains you made before then keep the 50% discount, and capital losses come off those older gains first. One detail, an optional “apportionment method” for valuing what you held on 1 July 2027, is still being made; the app uses the market value. Treat it as an estimate.',
  },
  minimumTax: {
    title: 'Minimum 30% tax on gains',
    body: 'From 1 July 2027, the basic tax (before offsets, without the Medicare levy) on all the capital gains you make from that date must be at least 30% of them, counting them as your last dollars of income. That includes short-term gains and inflation-adjusted ones, but not the part of a gain from before 1 July 2027. Any shortfall is added, rounded down to whole dollars. People getting certain government payments (like JobSeeker or the Age Pension) are exempt; the app doesn’t model that exemption.',
  },
  atEnd: {
    title: 'At the end of the plan',
    body: 'Sell everything: shows what you’d have in cash after brokerage and tax. Don’t sell: shows the value, plus the tax you would owe if you did sell.',
  },
  under18: {
    title: 'Under 18',
    body: 'Under-18s pay special high tax on investment income from money given by family: nothing up to $416, 66% of the amount over $416 up to $1,307, then 45% of all of it, or the normal tax on it if that’s more (counting it as their last dollars of income, e.g. alongside a part-time job). Income from investing their own job earnings is taxed at normal rates. The rules use their age on 30 June.',
  },
  inflation: {
    title: 'Inflation',
    body: 'Prices rise over time, so a dollar later buys less. With Inflation on, results are shown in today’s dollars: what the money would buy at the plan’s start date.',
  },
  todaysDollars: {
    title: 'Today’s dollars',
    body: 'Future money divided by how much prices rose, so you can compare it with prices now. Each deposit, fee and tax is counted at the prices of the day it happened.',
  },
  growWithInflation: {
    title: 'Grow deposits with inflation',
    body: 'Each deposit rises with prices during this phase, so it keeps buying the same amount. The first deposit is the amount you typed. Works with ramps and steps too. Needs the Inflation switch on.',
  },
  // Money you have now
  moneyNow: {
    title: 'Money you have now',
    body: 'What you already own on the plan’s start date. Enter it as one amount, or as a list of holdings if it’s in different things. It’s already invested on day one, with no brokerage. What you paid and when you bought it only matter with the Tax switch on.',
  },
  holding: {
    title: 'Holding',
    body: 'One thing you own now, like $8,000 of VGS or $3,000 in a savings account. Each holding has today’s value, what you paid for it and roughly when you bought it. Your starting balance is the total of your holdings.',
  },
  costBase: {
    title: 'What you paid (cost base)',
    body: 'What you paid for it, including brokerage. Capital gains tax is worked out on what you sell it for minus this. If you bought it over time, add up all the buys. Leave it as today’s value if you don’t know (then only growth from the start date is taxed).',
  },
  boughtWhen: {
    title: 'When you bought it',
    body: 'Used for capital gains tax: something held at least 12 months gets the 50% discount on the gain up to 30 June 2027. The app counts from the 1st of the month you pick. If you bought it over time, pick the month of your first buy (or your biggest one).',
  },
  holdingReturn: {
    title: 'Expected return (Manual mode)',
    body: 'How much this holding grows each year, before fees and tax, in Manual mode. It starts as your first phase’s return rate. Prediction mode replays this investment’s real history instead, using the same months as the rest of the plan.',
  },
  keepOrMove: {
    title: 'Keep them, or move them',
    body: 'Keep them as they are: each holding stays in its own investment for the whole plan, with its own returns, fee and distributions. Your deposits still go into your phases’ investments. Move them into my plan’s investments: they are sold on the start date and the money goes into the first phase’s investment. Selling can mean capital gains tax (Tax switch) and brokerage on the sale and the buy (Fees switch).',
  },
  proRata: {
    title: 'Withdrawals come from everything',
    body: 'When money comes out (a one-off withdrawal, or a sale to pay tax or the platform fee), any cash waiting to be invested is used first. The rest is taken from each investment in proportion to its value. With $6,000 in your plan’s ETF and $4,000 kept in savings, a $1,000 withdrawal sells $600 of the ETF and takes $400 from savings. Each sale pays its own brokerage with Fees on.',
  },
  taxEstimate: {
    title: 'A simplified estimate',
    body: 'Tax is worked out per financial year from the ATO rates (checked 18 Oct 2026), but leaves out many details: deductions, other offsets, the 45-day rule, capital gains inside ETF distributions, and more. Check with the ATO or a tax adviser before acting on it.',
  },
} as const

export type GlossaryKey = keyof typeof glossary
