# Money you have now (holdings)

Built 19 Oct 2026. Not committed yet.

## What's done
- **"Money you have now"** replaces the "Starting balance" box at the top of the Planner, in both Manual and Prediction mode. There are two ways to enter it:
  - **One amount** (simple): the starting balance, plus:
    - **What it's in.** "Same as the first phase" is the default and works exactly as before. You can also pick anything a phase can use: one ETF, a mix, cash/savings or a custom asset.
    - **What you paid** (optional, including brokerage). Default: today's value.
    - **Roughly when you bought it** (month and year, optional). Default: the plan's start date.
  - **My holdings** (detailed): a list of holdings with **Add a holding** and a delete button on each. Each holding has:
    - an optional name
    - today's value
    - what it's in
    - what you paid and roughly when you bought it
    - in Manual mode, its **expected return** (it starts at the first phase's rate)

    The total is shown and becomes the starting balance. You don't type the total.
- **Keep or Move.** This choice appears when some of the money is in something different from the first phase's investment:
  - **Keep them as they are** (default). Each holding keeps its own investment for the whole plan, with its own returns, fund fee and distributions. Deposits and events still follow the phases.
  - **Move into my plan's investments.** The holdings are sold on the start date and the money goes into the first phase's investment:
    - with Tax on: capital gains tax on the gain, paid from the sale
    - with Fees on: brokerage, spread and currency fee on both the sale and the buy

    The card says in words what moving will cost with the switches that are on.
- **A holding kept separately has its own settings.** Its fee and distributions are filled in from the ETF facts and can be edited under "Its fee and distributions". That section shows when Fees or Tax is on.
- **ETF lists are grouped by category** (Australian shares, Global shares, Currency-hedged, Diversified, Bonds, Gold, US-listed) when `data/etfs.json` has a `category` field. If it doesn't, the list is flat. This applies to the phase picker, mixes, holdings and Prediction mode's "use this ETF for those phases" box.
- **ⓘ explanations** for every new term: money you have now, holding, what you paid (cost base), when you bought it, expected return, keep or move, and withdrawals coming from everything (pro-rata).
- **Everything includes holdings:** the final amount, today's dollars, the goal, Show the cost, the year-by-year table, CSV, the fan chart, the biggest drop, Saved → Compare and backups.

## How Soham can try it (Mac)
1. Start the app as usual (or ask Claude to start the preview).
2. In the Planner, look for **Money you have now** under the start date. Type an amount. With "Same as the first phase", nothing changes from before.
3. Change **What it's in** to **One ETF** → **VGS**. A new choice appears: **Keep it as it is** or **Move into my plan's investments**. In Manual mode an **Expected return** box appears. Try 9% and watch the result change.
4. Turn on **Tax**. Set **What you paid** lower than the amount (e.g. $6,000 for $10,000) and **Roughly when you bought it** to a few years ago. Choose **Move**: the tax line goes up, because the gain is taxed on day one. Choose **Keep**: no tax until it's sold.
5. Turn on **Fees**. Open **Its fee and distributions** to see VGS's fee and yield.
6. Tap **My holdings**. Your amount becomes holding 1. Tap **Add a holding**, type $5,000 and choose **Cash / savings account**. The total underneath is your new starting balance.
7. Add a one-off withdrawal (e.g. "Holiday", −$1,000) and read the ⓘ next to "Money taken out…".
8. Tap **Prediction**. The holdings are replayed from the same months of history as everything else. Under Prediction settings, the history note now ends with "It includes the history for what you have now (VGS and the cash rate)…".
9. Save the plan, back it up, and import it again: the holdings come back exactly.

## Decisions (and why)
- **Plans without the new details work exactly as before.** A missing `startingMoney`, "One amount" with nothing filled in, or a holding bought on the start date for its value all give bit-identical results. Before changing the engine, results were snapshotted for 4 plans × 8 switch combinations, plus Show the cost and Prediction. They were identical after every engine change. These also have permanent tests.
- **What counts as "different".** A holding is kept or moved only if its investment is different from the **first phase's** investment (a different ETF, a different mix, a savings account at a different rate, and so on). Anything else simply becomes part of the plan's investment from day one, as lots that keep its own cost base and purchase date. It then follows the phases like the rest of the plan.
- **How a kept holding is modelled.** Each one is its own "sleeve" in `simulate.ts`, with its own units, unit price, distributions and tax lots. Its returns come in on `MarketPath.sleeves`:
  - Manual mode: its typed expected return (a savings account uses its savings rate).
  - Prediction mode: its own history column, read from the **same sampled month** as the phases, inflation and AUD/USD.
  - A custom asset gets its own random months (seed + holding id + run).
  - A mix is rebalanced every 12 months from the start of the plan.
- **Its fee and distributions:**
  - its own MER (Fees on), charged monthly like a phase's
  - its own yield, payout frequency, franking and foreign share (Tax on)
  - distributions reinvested into the same holding (or paid as cash, per the Tax setting)
  - a savings account has no fee or trading costs, and all of its return is interest
- **Withdrawals and money-out events take from every investment in proportion to its value (pro-rata).** So do sales to pay tax or the platform fee.
  - Waiting cash (Fees on) is used first, as before.
  - Each sale pays its own brokerage.
  - If one holding can't cover its share after its selling costs, the rest comes from the others.
- **Deposits and one-off money-in events** always go into the phase's investment.
- **Tax lots:**
  - Each holding is one lot with its real cost base and purchase date.
  - A purchase before the plan starts is fine (the usual case). A purchase after the start date is refused with a message.
  - The 12-month discount counts from the purchase date: held at least 12 months, not counting the day bought or sold. The month you pick counts from the 1st of that month. Picking the plan's start month means the start date.
  - The 1 July 2027 split uses the market value just before 1 July 2027, as for any other lot. The deferred gain keeps the 50% discount; the gain after uses the indexed cost base and the 30% minimum tax.
- **A plan that starts after 1 July 2027 with a holding bought before it.** The value on 30 June 2027 isn't known, so it's estimated as steady (compound) growth from what you paid to today's value. A warning says so.
- **Move:** the sale happens on the start date, before that day's deposits. The tax is paid from the sale proceeds, and the rest is bought straight away. The new lot's cost base is the amount reinvested (including brokerage). The CGT and fees show in the first year's totals. With Fees and Tax both off, Move costs nothing (the same as "Same as the first phase").
- **Biggest drop in Prediction mode.** With holdings kept separately, it's measured on all your investments together: what each invested dollar is worth across them, before fees. Plans without kept holdings measure it exactly as before.
- **The starting balance in "My holdings"** is always the total of the holdings. The app keeps `plan.startingBalance` equal to it, so the Saved list and older code still read the right number. The engine works it out from the holdings anyway.
- **Switching** from One amount to My holdings turns the one amount (and its details) into holding 1. Switching back makes the total the one amount. Both sets of details are remembered.
- **Speed:**
  - Kept holdings grow "lazily": the day-by-day factors are multiplied up, and the holding is brought up to date at each month end and whenever it's touched. This gives exactly the same maths as doing every day separately.
  - The balance is only worked out on days that need it.
  - Prediction mode fills each holding's daily returns a month at a time.

## Speed (this Mac, in the test runner)
- 2,000 runs of a 40-year weekly-deposit plan with every switch on, no holdings: **about 2.4 s** (unchanged; it was 2.5–2.8 s before).
- The same plan with **3 holdings kept separately** (an ETF, a savings account and a mix): **about 3.9 s**.
- Each kept holding adds about 0.5 s per 2,000 runs. On an iPhone, expect 2–4× longer (there's a progress bar).

## Tests (new)
`src/engine/holdings.test.ts` (27 tests), plus additions to `src/saved/backup.test.ts`, `src/saved/compare.test.ts` and `src/predict/predict.test.ts`. Hand-worked examples:
1. **Identical results without new details.** Six ways of entering "nothing new" give `toStrictEqual` results to the plan without `startingMoney`, in all 8 switch combinations and for Show the cost.
2. **One amount kept separately.** $10,000 in savings at 4% plus $100 a month into a 7% ETF for 2 years (1 Jan 2026):
   - savings: $10,000 × 1.04² = $10,816
   - deposits: $100 × (q + … + q²⁴) with q = 1.07^(1/12) = $2,577.21
   - total: $13,393.21
   - A kept ETF holding at 9% gives $10,000 × 1.09² + the same deposits.
   - A kept holding's 1% fee over a year: $9,900.46.
   - A 4% fully franked yearly distribution taxed at 0%: $400 paid, $171.43 franking refund, final $10,571.43.
3. **Tax lots** (flat 30% rate, no Medicare levy, 10% growth):
   - Paid $6,000 on 1 Jul 2022, worth $10,000 at the start (1 Jul 2025), sold for $11,000 on 30 Jun 2026: gain $5,000, discounted to $2,500, tax **$750**, final $10,250. Without the details: $300.
   - Paid on 15 Jan 2025, plan 1 Jul – 30 Sep 2025: no discount, tax = 30% × ($10,000 × 1.1^0.25 − $6,000) = **$1,272.34**. Bought 1 Sep 2024 instead: half that, $636.17.
   - Paid $6,000 on 1 Jul 2023, plan 1 Jul 2026 – 30 Jun 2029 at 0% inflation:
     - deferred gain $5,000, discounted to $2,500
     - gain after 1 July 2027: $13,310 − $11,000 = $2,310
     - tax 30% × $4,810 = **$1,443**, all in 2028–29; final $11,867
   - Plan starts 1 Jul 2028, bought 1 Jul 2026: the value on 1 July 2027 is estimated as $6,000 × (10/6)^(365/731) = $7,743.26.
   - Two holdings: an ETF gain of $1,600 and a $1,000 loss on a kept holding → net gain ($1,600 − $1,000) × 50% = $300 → tax **$90** (both on "sell everything" and "don't sell").
4. **Move.** $10,000 of BBB that cost $6,000 in 2020, moved into AAA on day one, $10 brokerage, 30% tax:
   - sale nets $9,990; gain $3,990, discounted to $1,995; tax **$598.50**
   - $9,391.50 to reinvest; buy brokerage $10; **$9,381.50** invested
   - Fees only: $9,980. Tax only: $9,400. Both off: $10,000.
5. **Pro-rata.** $6,000 in the ETF (10%) and $4,000 in savings at 0%; $1,000 taken out on day one:
   - $600 from the ETF and $400 from savings → $5,400 × 1.1 + $3,600 = **$9,540** after a year
   - with $10 brokerage (the ETF sale only): $9,529
   - a withdrawal bigger than everything empties every investment
6. **Prediction:**
   - A constant history gives the Manual answer to the cent, with 3 holdings (merged, ETF, cash) and switches all on, all off, and Fees + Tax.
   - Every holding reads the same sampled month as the phases and inflation.
   - A savings holding's return is all interest.
   - The biggest drop covers all investments.
   - "Move" needs no history for the holdings it sells.
   - The real-data history includes the holdings' series and says so.
7. **Validation and backups:**
   - Every new field has a plain-English message, e.g. "Holding 2: the date you bought it can't be after the plan starts."
   - `planShapeProblem` rejects damaged shapes of every new field. Backups round-trip them, and old backups still import.
   - Compare includes holdings: $6,000 at 7% + $4,000 at 4% for 10 years.

`npm test`: 355 tests (32 new). 354 pass. The 1 failure is in `src/data/data.test.ts` (real-data checks), from the other helper's ETF and data work in progress. Type-check, lint and build are clean.

## Limitations
- **A holding's history in Prediction mode.** Its ETF must have history in `data/monthly.json`. A kept holding can make the history window start later (the note says why). "Move" holdings don't need history.
- **Rough purchase dates.** A purchase is counted from the 1st of the month picked, so near the 12-month mark the discount may be a month off. If you bought over time, the app treats it as one purchase; put the total paid in "What you paid".
- **No holdings outside the plan's currency.** A US-listed holding in an A$ plan uses the currency fee on its sale (Fees on), like a phase.
- **Kept holdings never switch investments.** They stay in their own investment for the whole plan. To change one later, use "Move" (it moves on day one only).
- **No CGT exemptions.** Moving or selling a holding counts as an ordinary sale for capital gains tax. The tax estimate's existing limits (notes/stage-4.md) still apply.
- **Prediction-mode Compare** still uses Manual numbers (as before), now including holdings.

## Files changed
- Engine:
  - `src/engine/types.ts`: `Plan.startingMoney`, `StartingMoney`, `Holding`, `HoldingDetails`
  - `src/engine/holdings.ts`: new
  - `src/engine/defaults.ts`: `resolveHoldingSettings`
  - `src/engine/compile.ts`: holdings and their tax lots
  - `src/engine/path.ts`: `MarketPath.sleeves`
  - `src/engine/simulate.ts`: sleeves, lazy growth, pro-rata sales, Move, portfolio index
  - `src/engine/prediction.ts`: sleeve sources and paths, same sampled month
  - `src/engine/assets.ts`: `etfsUsed` / `usesCash` include kept holdings, `etfsOf`
  - `src/engine/validate.ts`: `startingMoneyProblems`
  - `src/engine/index.ts`
  - `src/engine/holdings.test.ts`: new
- Planner:
  - `src/planner/MoneyNow.tsx` and `holdings.css`: new
  - `src/planner/investmentChoices.ts`: new
  - `src/planner/InvestmentPicker.tsx`: shared `InvestmentFields` and `EtfSelect`, grouped ETFs
  - `src/planner/PlannerPage.tsx`, `PhaseRealism.tsx`, `PredictionResults.tsx`
- Prediction:
  - `src/predict/history.ts`: holdings' series, clipping and note
  - `src/predict/etfFacts.ts`: `holdingWithInvestment`
  - `src/predict/predict.test.ts`
- Saved:
  - `src/saved/backup.ts`: shape checks
  - `src/saved/backup.test.ts`, `src/saved/compare.test.ts`
- Components:
  - `src/components/inputs.tsx`: `Select` groups
  - `src/components/glossary.ts`: 7 new ⓘ entries
- Notes: `notes/holdings.md`
