// Plain-English explanations behind every ⓘ button.

export const glossary = {
  manualMode: {
    title: 'Manual mode',
    body: 'Uses the return rates you type in, so you get one steady growth line. Real markets go up and down. Prediction mode (coming soon) will replay real market history to show a range of outcomes.',
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
} as const

export type GlossaryKey = keyof typeof glossary
