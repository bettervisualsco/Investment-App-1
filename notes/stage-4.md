# Stage 4: Fees, Tax and Inflation switches

Built 18 Oct 2026 on branch `claude/stage-4-realism-176bf2`. Not merged yet.

## What's done
- **Three switches in the Planner**, under the plan's start date: **Fees**, **Tax**, **Inflation**, plus **Show the cost**. Each one works on its own and the result updates straight away.
- **Fees** (settings in "Fees, tax and inflation" at the top of the editor, plus each phase):
  - Management fee (MER), set in each phase. It comes off on the last day of each month (1/12 of the yearly fee).
  - Brokerage on every buy and sale: flat $, % with a minimum, or tiered price bands. There are presets for CommSec, Stake, Pearler, SelfWealth, CMC Invest, Superhero and Vanguard Personal Investor. Each one is marked **"Check current fees"**.
  - How often you buy, separate from how often you deposit. Money waiting to be invested earns a cash rate you choose (or 0%). If the brokerage would eat all the waiting cash, the buy waits until the next buying day.
  - Currency conversion fee: only for phases marked "Listed in the US".
  - Account/platform fee, per month or per year.
  - Buy/sell spread.
- **Tax** (labelled everywhere as a simplified estimate):
  - Tax is worked out per Australian financial year, using one of two methods:
    - your other income in each phase (real brackets, low income tax offset and Medicare levy), or
    - a marginal rate you pick in each phase.
  - Medicare levy on/off.
  - Brackets either "stay the same" or "rise with inflation".
  - Distributions: yield, how often they're paid, franked %, foreign income %, and the foreign tax already taken.
    - Franking credits are added to your income and then come off your tax. Any left over is refunded.
    - The foreign income tax offset is never refunded.
  - Distributions can be reinvested after tax or taken as cash.
  - Capital gains tax:
    - Every purchase is tracked as its own "lot". Sales use the oldest lots first.
    - The 50% discount applies after 12 months, not counting the day you buy or sell.
    - Losses are carried forward to later years.
  - At the end of the plan: "Sell everything" shows the after-tax cash. "Don't sell" shows the tax you'd owe if you did sell.
  - Under-18 owner: you enter their 18th birthday, and say whether the money came from family/gifts (special under-18 rates) or their own job (normal rates).
  - **New:** the capital gains tax changes from 1 July 2027, which are now law (see "Problems" below).
  - All tax rates can be edited under "Tax rates used", with a button to reset them to the ATO rates.
- **Inflation:**
  - A typed rate, ramp or steps over the whole plan.
  - Every result is shown in today's dollars. Each deposit, fee and tax is counted at the prices of the day it happened.
  - Each phase has a "Grow deposits with inflation" switch.
  - The goal is checked in today's dollars.
  - The "Use historical average" button is there but greyed out until stage 2's price (CPI) data is connected.
- **Results:**
  - Final amount, "your money" and "growth after costs".
  - Totals: put in, taken out, growth, fees paid, tax paid (or refunded), distributions paid to you, and the value in that year's dollars.
  - A breakdown of where the fees and tax went.
  - An end-of-plan sale note.
  - "Show the cost" draws the all-switches-off line dashed on the chart. It also shows bars for how much fees, then tax, then inflation take.
  - The year-by-year table and the CSV download get Fees, Tax, Paid-to-you and today's-dollars columns for whichever switches are on.
- **Old plans still load.** Every new setting is optional and has a default. With all switches off, results are exactly the same as stage 1 (all 27 stage-1 tests still pass).
- **Tests:** 95 automated tests at the time (68 new). (The accuracy audit of 18–19 Oct 2026 added more; see the totals in PROGRESS.md.) Most new ones are hand-checked against worked numbers, for example:
  - $10,000 with a 1% MER for a year = $9,900.46
  - a $700 fully franked distribution at 30% = $0 tax
  - an ATO Medicare example: $29,000 → $98.90
  - the under-18 rule: $1,000 → $385.44
  - the 50% discount, carried-forward losses, and buying lots
  - the worked example in the 2026 law's Supplementary Explanatory Memorandum, Example 1.17 ($800 minimum-tax top-up)

## Accuracy audit fixes (19 Oct 2026)
Checked against the Act (Bill as passed), the Supplementary Explanatory Memorandum and the ATO pages; each has a hand-worked test:
- Minimum tax now covers short-term gains from 1 July 2027: $10,000 from 1 Jan 2028 at 10%, sold 30 Jun 2028, 10% rate → $145.81 (was $48.81).
- Loss order from 2027–28: deferred (pre-July 2027) gains first. Example → $3,750 (was $3,000).
- Minimum-tax shortfall rounded down to whole dollars.
- "Brackets rise with inflation" counts from 1 July 2027 whatever the start date (plans starting 1 Jan 2028, 1 Jul 2029 and 1 Jan 2030 tested).
- Under-18 "top slice" rule: $30,000 job + $500 family money in 2025–26 → $80 (was $55.44).
- Working Australians tax offset from 2027–28: $22,000 job + $3,000 distributions in 2028–29 → $2 (was $252).
- Foreign tax offset can cancel tax on your other income (only matters below a 15% rate).
- MER and franking/foreign settings follow each day's phase when a phase changes mid-month.
- Phase dates no longer drift after a month-end start: from 31 Jan, 1 + 11 months at 7% → $10,700.00 (was $10,694.16, ending 28 Jan).
- Withdrawing everything with Tax on pays the sale's tax from the withdrawal (it used to be left "unpaid").

## How to try it
1. In the Planner, look under the start date for **Make it real**. Tap **Fees**, **Tax** and **Inflation** one at a time and watch the big number change.
2. Tap **Show the cost**. A dashed line appears on the chart, and "The cost of real life" shows what each switch takes.
3. Scroll down to **Fees, tax and inflation**. Try these:
   - Pick **CommSec** as the brokerage.
   - Change **How often you buy** to **Every month**. With weekly deposits, the fees drop a lot.
4. Open a phase (tap its name). Under **Tax in this phase**, type a yearly income, for example $60,000. Watch the tax change.
5. In the Tax settings, choose **Someone under 18** and set the date they turn 18. Then try **Family or gifts** and **Their own job**.
6. Open **Year by year** and tap **Download as spreadsheet (CSV)** to see the new columns.

## Every rate used, with its source (all checked 18 Oct 2026)
| What | Value | Source |
|---|---|---|
| Resident rates 2024–25 and 2025–26 | 0% to $18,200; 16% to $45,000; 30% to $135,000; 37% to $190,000; 45% above | https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents (page updated 13 Aug 2026) |
| Resident rates 2026–27 | Same, but 15% instead of 16% ($4,020 at $45,000; $31,020 at $135,000; $51,370 at $190,000) | same page |
| 2027–28 and later (already law) | 14% instead of 15%, other thresholds and rates unchanged | Treasury Laws Amendment (More Cost of Living Relief) Act 2025, No. 28 of 2025: https://www.ato.gov.au/law/view/pdf/acts/20250028.pdf |
| Medicare levy | 2% | https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/what-is-the-medicare-levy |
| Medicare low-income thresholds (singles) | 2024–25: $27,222 / $34,027. 2025–26: $28,011 / $35,013. Phase-in is 10% of income over the lower threshold (matches the ATO's own $29,000 → $98.90 example). 2026–27 isn't published yet, so 2025–26's thresholds are used for later years. | https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-reduction/medicare-levy-reduction-for-low-income-earners |
| Low income tax offset | $700 up to $37,500; minus 5c per $1 to $45,000 ($325); minus 1.5c per $1 to $66,667 (nil). Not refundable. Under-18s can't use it against investment income. | https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/low-income-tax-offset |
| Under-18 rates (income that isn't "excepted") | $0–$416 nil; $417–$1,307 66% of the excess over $416; over $1,307 45% of the whole amount. Age is taken at 30 June. Income from investing their own job earnings is "excepted" and taxed at adult rates. The ATO lists these figures up to 2025–26 and has no 2026–27 table yet; they're assumed unchanged. | https://www.ato.gov.au/tax-rates-and-codes/tax-rates-if-you-re-under-18-years-old and https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/income-you-must-declare/your-income-if-you-are-under-18-years-old |
| CGT discount (until 30 June 2027) | 50% for assets held at least 12 months, not counting the day you buy or the day you sell | https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/calculating-your-cgt/cgt-discount |
| CGT from 1 July 2027 (now law) | Gains from 1 July 2027 use cost base indexation (CPI) instead of the 50% discount, for assets held at least 12 months. There's also a minimum 30% tax on those gains, worked out as a top-up against basic tax before offsets. Assets you already own keep the 50% discount on their gain up to 30 June 2027. | ATO page (published 13 Oct 2026): https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/capital-gains-tax-reform ; Treasury Laws Amendment (Tax Reform No. 1) Act 2026 (Act No. 49 of 2026), the Bill as passed, and the explanatory memoranda: https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r7493 |
| Franking credits | Credit = franked amount × 30/70 (30% company rate). Added to income, and refundable to individuals. | https://www.ato.gov.au/individuals-and-families/investments-and-assets/shares-funds-and-trusts/investing-in-shares/refund-of-franking-credits-for-individuals ; https://www.ato.gov.au/businesses-and-organisations/corporate-tax-measures-and-assurance/imputation/paying-dividends-and-other-distributions/allocating-franking-credits |
| Foreign income tax offset | Claimable without a limit calculation up to $1,000; never refunded | https://www.ato.gov.au/forms-and-instructions/foreign-income-tax-offset-rules-guide-2026/calculate-your-fito-or-offset-limit |
| US tax on dividends (default 15%) | 15% under the US–Australia treaty, with a W-8BEN form (otherwise 30%) | https://www.irs.gov/pub/irs-lbi/tax-treaty-table-1.pdf |
| Default inflation 2.5% | The middle of the RBA's 2–3% target. It's a starting point, not a forecast. | RBA inflation target |
| Brokerage presets | CommSec: $5 ≤$1k, $10 ≤$3k, $19.95 ≤$10k, $29.95 ≤$25k, then 0.12%; FX 0.55%. Stake: $3, or 0.01% above $30k; FX 0.55%. Pearler: $6.50; FX 0.5%. SelfWealth: $9.50. CMC Invest: $11 or 0.10%. Superhero: "from $2"; FX 0.5%. Vanguard PI: $0 to buy Vanguard ETFs ($9 to sell isn't counted). All marked "check current fees". | each broker's pricing page (links are in `src/planner/brokeragePresets.ts`) |

The rates live in `src/engine/taxTables.ts`. That file exports `TAX_RATES_CHECKED_ON = '2026-10-18'` and `TAX_SOURCES`, so the Settings page can show the "rates checked on" date after merging.

## Decisions (and why)
- **Return rate = total return.** The rate you type includes distributions. Tax splits off the distribution part (the yield) and taxes it when it's paid. With a 0% tax rate the result is exactly the same as Tax off (there's a test for this).
- **When tax is paid:**
  - Tax on a distribution comes out of that distribution before it's reinvested.
  - Capital gains tax on a withdrawal is taken from what's left in the investment, straight after the sale. If the withdrawal takes everything (or what's left can't cover the tax), the rest of the tax comes out of the money being withdrawn, so you're paid the proceeds minus the tax, and a warning says how much went on tax.
  - Sales made to pay tax or the platform fee pay no brokerage, spread or currency fee (a simplification: in real life you'd pay them, or pay the tax from other money).
  - The financial year's total is always exact: each time something taxable happens, the year's tax is worked out again from the running totals, and only the difference is charged.
- **The starting balance counts as already invested on the start date**, with its value as its cost base and no brokerage.
- **Distributions are reinvested with no brokerage**, like a dividend reinvestment plan.
- **Income across phases:** if a financial year covers two phases, each phase's yearly income and rate count for their share of that year's days. A part-year at the start of the plan still uses the full yearly income, so the bracket isn't understated.
- **"Brackets rise with inflation"** (the default) raises every dollar threshold, the low income offset, the Working Australians tax offset and the Medicare thresholds for each year after 2027–28 (the latest table), by how much prices rose from 1 July 2027 to that year's 1 July, whatever date the plan starts. For days before the plan starts it assumes the first inflation rate in the Inflation settings. It uses those settings even when the Inflation switch is off, so the Tax and Inflation switches stay independent.
- **Phase changes mid-month:** the management fee builds up day by day at each day's phase's MER and comes off at month end; distribution income is split by each day's phase's franked %, foreign % and foreign tax %, so a payout after a change uses each phase's settings for its own days. (The payout dates follow the phase in force on the payout month's last day.)
- **Phase lengths in months, years or decades** are counted from the plan's start (or from the end of the last phase measured in days or weeks), not from the previous phase's end. So from 31 January, 1 month then 11 months ends on 31 January, not 28 January.
- **The Inflation switch only changes what's shown, plus "grow deposits".** Today's dollars means the plan's start-date dollars.
- **"Grow deposits with inflation" starts from the phase start:** the first deposit is the amount you typed.
- **Default capital gains rules are "New law from July 2027"**, because it's now law. You can switch to "Keep the 50% discount" to compare.
- **Default example values for a phase:** MER 0.20%, yield 3%, 30% franked, quarterly payouts. You should change these to match your real ETF. Stage 2's ETF info files can fill them in later.
- **Default brokerage:** $5 flat, buying every time money comes in. On the example plan's $20 weekly deposits, that's a big cost on purpose: it shows why buying less often matters.

## Problems / limits (please read)
- **The capital gains tax law changed in 2026** (Act No. 49 of 2026, checked against the Bill as passed and the Supplementary Explanatory Memorandum, JC018520). SPEC.md 4.3 described the 50% discount; from 1 July 2027 it's replaced as described above. How the app follows the law:
  - Something you own on 30 June 2027 is treated as sold and bought back at its value then. Its gain up to then is a "deferred" gain under the old rules (halved if held at least 12 months by the day you really sell); the gain after uses an inflation-indexed cost base (s112-155, s112-160).
  - From 2027–28, capital losses (this year's, then carried-forward ones) come off the deferred gains first, then the gains made from 1 July 2027 (s102-5(1) Steps 1–2; Supplementary EM Example 1.9). Within the deferred group the app uses the ones without the discount first (you may choose the order in a group). Before 2027–28 and with "Keep the 50% discount", losses come off short-term gains first, as before.
  - The 30% minimum tax covers all the gains made from 1 July 2027 that are left after losses: short-term gains as well as indexed ones, but not the deferred part (s119-5). It compares 30% with the basic income tax on them as your last dollars of income, before offsets and without the Medicare levy (s119-10(2)), and the shortfall is rounded down to whole dollars.
  - The exemption for people getting certain payments (JobSeeker, the Age Pension and others) is in the law (s119-15) but isn't modelled: the app assumes you don't get them. Turn off the minimum tax if you do.

  Only one detail is still pending: the optional "apportionment method" for valuing what you held on 30 June 2027 (a legislative instrument still to be made). The app uses the market value, which is the default in the law. Other simplifications:
  - Real indexation uses the ABS's quarterly CPI numbers, rounded to 3 decimal places. The app uses its own day-by-day inflation (your typed rate).
- **Things the tax estimate leaves out:**
  - deductions
  - the 45-day rule (franking credits under $5,000 a year are exempt from it anyway)
  - capital gains inside ETF distributions
  - the Medicare levy surcharge
  - other offsets
  - the FITO limit calculation above $1,000. Below that, the offset can cancel tax on your other income too with the "other income" method; with a marginal rate it can only cancel the investment's own tax
  - rounding to whole dollars (except the minimum-tax top-up, which the law rounds down)
  - Medicare thresholds after 2025–26: 2026–27's aren't published yet, so 2025–26's are used for every later year (raised by "brackets rise with inflation" from 2028–29)
- **Working Australians tax offset** (from 2027–28, Act No. 49 of 2026 Schedule 3, s61-155 and s61-160): the lesser of $250 and the basic tax on your net labour income alone, if that income is above $18,200; not refundable, and it comes off your whole tax bill, so for low earners it can also cancel tax on investment income (e.g. a $22,000 job + $3,000 of unfranked distributions in 2028–29: $2 of tax instead of $252). The app treats all of a phase's "other income" as job income, and only uses it with the "other income" method. It isn't applied against the special under-18 rates (the law doesn't say clearly whether it can reduce that tax).
- **Under-18 rates:** the special rate, or if it's greater, the normal tax on that income as the top slice of their total income (ATO under-18 rates, note to the 66% band). E.g. a $30,000 job + $500 from family money in 2025–26: $80, not $55.44.
- **Assets don't change between phases:** if a later phase has a different return, the app treats it as the same holding growing differently. It does not treat it as selling one ETF and buying another, so no capital gains tax is triggered.
- The currency fee is charged on buys and sales of US-listed holdings, not on distributions.
- "Use historical average" for inflation needs stage 2's CPI data. It's a clear hook (see below), not a hard-coded number.

## Notes for merging (for the coordinating session)
- Stage 4 only touched `src/engine`, `src/planner` and `src/components/glossary.ts` (new entries added).
- **The CPI hook:** `PlannerPage` now takes an optional `historicalInflation={{ rate, label }}` prop (the type is in `src/planner/inflationHook.ts`). Pass it from `App.tsx` once the CPI data is loaded. Until then the button is greyed out.
- **The "rates checked on" date:** for Settings, import `TAX_RATES_CHECKED_ON` and `TAX_SOURCES` from `src/engine/taxTables.ts`.
- **CSV:** the Planner now uses `src/planner/yearCsv.ts`. The old `yearTableCsv` in `src/lib/csv.ts` is unused but left in place; `downloadText` from there is still used.
- **Saved plans:** `Plan.realism` and the new optional `Phase` fields (`mer`, `usListed`, `distribution`, `otherIncome`, `marginalRate`, `growWithInflation`) are plain data, so export/import just carries them.
- **For stage 3 (Prediction mode)**, call:

  ```ts
  const compiled = compilePlan(plan)
  const result = simulate(compiled, path, { detail: false })
  ```

  - `path` comes from `src/engine/path.ts`: `{ growth, inflation, cash? }`, each a Float64Array with one entry per day of the plan.
  - A sampled month's return r becomes `(1 + r) ** (1 / daysInMonth)` for each of its days.
  - `result.balances` holds the chart points.
  - A 40-year plan with every switch on takes about 1 ms per run here, so 2,000 runs take about 2 s.
  - **Watch for double-counting the MER:** if the historical ETF prices already have the MER taken out, either add it back before feeding the path or set `mer: 0` for those phases.
