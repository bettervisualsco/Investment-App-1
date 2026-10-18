// Plain-English explanations behind Prediction mode's ⓘ buttons. Kept here (not in the shared
// glossary) so the stages built at the same time don't edit the same file; they can be merged later.

export const predictWords = {
  predictionMode: {
    title: 'Prediction mode',
    body: 'Replays your exact plan through real market history thousands of times. Your phases, deposits and events stay exactly as you typed them; only the returns, inflation and exchange rates change, following real months from the past picked in random chunks. You get a range (worst, likely and best) instead of one line. It’s an estimate based on history, not a promise: the future can be different.',
  },
  investment: {
    title: 'What it’s invested in',
    body: 'Pick one ETF from the watchlist, a mix of ETFs, a savings account, or describe your own investment. Picking an ETF fills in its management fee, distribution yield and franking from its fact sheet (you can change them). Manual mode still uses the return rate you type; Prediction mode replays this investment’s real history.',
  },
  mix: {
    title: 'A mix of ETFs',
    body: 'Your money is split between the ETFs in these shares. During the year the shares drift as each ETF goes up or down; once a year they’re put back to your chosen shares (rebalancing). The app doesn’t charge brokerage or tax on those yearly rebalances, so real life costs a little more.',
  },
  cash: {
    title: 'Cash / savings account',
    body: 'Money in a savings account: no management fee or brokerage, and all of the return is interest, taxed as income. Manual mode uses the savings rate you type. Prediction mode uses the Reserve Bank cash rate from the same historical month as everything else, which savings accounts have roughly followed.',
  },
  custom: {
    title: 'Custom asset',
    body: 'An investment you describe yourself. Average return is the typical yearly growth over the long run (before fees). Volatility is how bumpy it is. Prediction mode makes up random months with “fat tails”: big rises and falls happen more often than a smooth bell curve would allow, like real markets.',
  },
  volatility: {
    title: 'Volatility',
    body: 'How far a typical year’s return strays from the average (its standard deviation). Shares have usually been around 15–20% a year, bonds around 5%, cash about 1%. Higher means a bumpier ride and a wider range of outcomes.',
  },
  crashes: {
    title: 'Crashes',
    body: 'Adds sudden one-month falls now and then, on top of the normal ups and downs. The average return and the volatility stay as you typed them, so crashes change the shape of the bumps (more sudden big falls), not the average.',
  },
  percentiles: {
    title: 'Worst, likely and best',
    body: 'Line up all the simulations from lowest to highest. “Worst” is the 10th percentile: 9 in 10 simulations did better. “Likely” is the middle one (the median). “Best” is the 90th percentile: only 1 in 10 did better. Real outcomes can be outside this range.',
  },
  history: {
    title: 'Which history',
    body: 'Full history uses every month where all the data your plan needs exists (for Australian shares, from 1975). A shorter, more recent window may look more like today’s markets, but has fewer crashes and booms to learn from.',
  },
  block: {
    title: 'Chunks of history',
    body: 'Each simulation is built from random chunks of real history joined end to end. Inside a chunk the months stay in their real order, so streaks like a crash and its slow recovery stay together. Longer chunks keep longer streaks; shorter ones mix things up more. 12 months is the usual choice.',
  },
  simulations: {
    title: 'Simulations',
    body: 'How many times your plan is replayed through history. More gives steadier numbers but takes longer. 2,000 is plenty for most plans.',
  },
  seed: {
    title: 'Random seed',
    body: 'The starting number for the random choices. The same seed always gives the same results, so the numbers only change when your plan or the market data changes. “Re-roll” picks a new seed, which shows how much the results move just by chance.',
  },
  goalChance: {
    title: 'Chance of reaching your goal',
    body: 'The share of simulations where your balance on the goal date was at least your goal. History doesn’t repeat exactly, so treat it as a rough guide, not a promise.',
  },
  belowPutIn: {
    title: 'Ending below what you put in',
    body: 'The share of simulations that finished with less than the money you put in: your starting balance plus deposits, minus withdrawals. With Inflation on, both are in today’s dollars.',
  },
  drawdown: {
    title: 'Biggest drop along the way',
    body: 'The largest fall from a high point to a later low point in the middle (likely) simulation. It’s measured on what each dollar invested was worth (before fees), so new deposits don’t hide it. Real drops can be bigger.',
  },
  historyFees: {
    title: 'Fees in replayed history',
    body: 'ETF prices in history already have the fund’s fee taken out. The app adds it back, then the Fees switch takes off the fee in your phase, so it’s never counted twice. With Fees off, returns are before the fund’s fee.',
  },
} as const

export type PredictWord = keyof typeof predictWords
