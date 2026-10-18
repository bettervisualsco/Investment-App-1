# Stage 2: Data pipeline + hosting (notes)

Branch: `claude/stage-2-data-4bd6f2`. Built 18 Oct 2026. Everything that can be done **without a
GitHub account** is done. The last part (putting it online) needs Soham's free GitHub account:
steps are at the bottom.

## What's done

**Data pipeline** (`pipeline/`, Python):
- Downloads full daily history for all 11 watchlist ETFs (VAS, VGS, IVV, NDQ, A200, VDHG, DHHF, VAF,
  VOO, VTI, QQQ), the 4 indexes (ASX 200, All Ords, S&P 500, Nasdaq 100) and AUD/USD: close,
  adjusted close (total return) and distributions. Real data is already in `data/` (as of Fri 16 Oct 2026).
- Intraday: latest prices + 5-minute bars during ASX hours (10:00-16:10 Sydney) and NYSE hours
  (9:30-16:00 New York), about every 15 minutes, with daylight saving handled in both cities.
- Inflation (ABS Australian CPI, quarterly since 1948 and the new monthly CPI; US CPI since 1871),
  RBA cash rate (since 1969), bond yields, AUD/USD (since 1969): checked daily.
- Long-run monthly history for Prediction mode, lined up by real month (`data/monthly.json`): US shares
  since 1871, Australian shares since 1975, global shares, tech, bonds, cash, inflation and AUD/USD.
  Each ETF gets its real history plus a "proxy" before it existed, with its fee taken off.
- ETF facts (fee, yield, franking, exchange, start date, mix) in `pipeline/etf_info/`, each with the
  date checked and a source link.
- **Safety:** a broken, empty, shorter or older download never replaces good data; errors and the
  health of each source go into `data/meta.json`. If the yfinance library breaks, it automatically
  tries Yahoo directly. 55 automated Python tests (`npm run test:pipeline`), including a check that the
  schedule covers every trading session of the year in both cities, in summer and winter time.

**GitHub workflows** (`.github/workflows/`, written but **not yet tested on GitHub**):
- `update-data.yml`: runs on a schedule, works out what's due, saves new data, and redeploys the site.
- `deploy.yml`: builds the app and publishes it to GitHub Pages (also runs when code is pushed).

**In the app** (`src/data/`): every time the app opens or comes back to the screen it fetches
`meta.json`, downloads only the files that changed, and saves them on the device so it works offline.
Ready-made pieces for the later screens: "Prices as of 3:42pm · updated 6 min ago" labels, the
"data is more than 2 days old" check, and `refreshData()` for pull-to-refresh. 17 new app tests,
including checks of the real data against known history (the 1987 crash, Australia's 7.8% inflation
in 2022, the US's 9.1% in June 2022).

**Installable app (PWA):** app icon, name and offline support, so it can go on the iPhone home screen
and the Mac Dock. Tested in the preview: the app still opens with the server switched off.

## How Soham can try it now

There isn't much to *see* yet: the Markets and Inflation screens (which show this data) come in the
next batch. What you can check:
1. The app still works as before (Planner).
2. Ask Claude to "show me the latest VAS price and when it's from" or "show me the data status": the
   data files are real and up to date to Friday 16 Oct 2026.
3. Ask Claude to "run the data update": it downloads the newest prices in about a minute.

The real test (scheduled updates, website, installing on the phone) needs the GitHub account below.

## What's left (needs Soham's GitHub account)

1. Create the account and repository, connect this folder to it (steps below).
2. Turn on GitHub Pages and run the workflows once; fix anything that only shows up on GitHub.
3. Install the app on the iPhone and the Mac.
4. After ~2 months, confirm GitHub hasn't switched the schedule off (see "60-day rule" below).

Not in this stage (later batches): showing the data on screens (Markets, Inflation, Settings > Data
status), pull-to-refresh gesture, Prediction mode recalculating in a Web Worker.

## Steps for Soham (when you're ready to put it online)

**A. Make a free GitHub account** (free plan, no card needed)
1. Go to **github.com/signup** in Safari.
2. Enter your email, a password and a username. Your username becomes part of the website address,
   e.g. `https://yourname.github.io/investment-planner/`. Lowercase is easiest.
3. Check your email and enter the code GitHub sends you.
4. If asked to choose a plan, choose **Free**.

**B. Create the repository** (the online folder for the app)
1. Click the **+** at the top right → **New repository**.
2. Repository name: `investment-planner`.
3. Choose **Public** (free hosting needs public; don't put anything private in the app's code).
4. Leave "Add a README" unticked. Click **Create repository**.

**C. Let Claude connect your Mac to it**
1. Tell Claude: "My GitHub account is ready: username ___, repo investment-planner. Please push the app."
2. Claude will set up the connection. At one point a browser page will ask you to log in to GitHub and
   approve access (or type a short code). Do that, then tell Claude it's done.

**D. Turn on the website**
1. On the repository page, click **Settings** (top) → **Pages** (left side).
2. Under "Build and deployment", set **Source** to **GitHub Actions**.

**E. Run it the first time**
1. Click the **Actions** tab. If you see a green button about enabling workflows, click it.
2. Click **Update market data** on the left → **Run workflow** (right) → choose **all** → **Run workflow**.
3. Wait 2-4 minutes until it shows a green tick. A "Deploy website" step runs after it.
4. Open `https://<your-username>.github.io/investment-planner/`. That's your app online.
   (If anything goes red, tell Claude: "the GitHub action failed" and it can read the error.)

**F. Install it**
- **iPhone:** open the website in **Safari** → tap **Share** (square with an arrow) → **Add to Home
  Screen** → **Add**. Open it from the new icon (not from Safari) to use it like an app.
- **Mac:** open the website in **Safari** → menu **File** → **Add to Dock** → **Add**.

After this, the data updates itself: every ~15 minutes while the ASX or US market is open, closing
prices after each close, and inflation/cash rate once a day. Scheduled runs can start late; that's normal.

## Decisions made in this stage

- **Intraday prices are not saved in git** (they change every 15 minutes and would bloat the
  repository by hundreds of MB a year). They live only on the website; each run copies the previous
  ones back from the live site first. Daily, monthly and other data *are* saved in git.
- **Deploy from GitHub Actions** (Pages source "GitHub Actions"), not from a branch, so data runs can
  redeploy without extra commits. GitHub's 10-builds-an-hour limit doesn't apply to this method.
- **Python 3.12 on GitHub**; the Mac only has Python 3.9, so the Mac uses yfinance 1.2.0 and GitHub
  the newest (1.7.0). Pinned in `pipeline/requirements.txt`.
- **Proxies**: see DATA_SOURCES.md section 3. Australian bonds use 85% 5-year + 15% 10-year
  government yields to match VAF's 4.8-year duration.
- **Month-end bond yields**: the RBA's and FRED's monthly tables are monthly averages; we use the last
  daily value instead where daily data exists (Australia from 1995, US from 1962).
- **Frozen snapshots**: old spreadsheets that never change (Shiller to 1953, RBA history) are kept as
  small CSVs in `pipeline/static/`, so the daily job never depends on them.
- New ETF facts were checked against issuer websites on 18 Oct 2026 (VAS's fee is now 0.07%; QQQ 0.18%).

## Problems and things to know

1. **The 60-day rule (checked):** GitHub's docs confirm that in a **public** repository, scheduled
   workflows are switched off after 60 days with no repository activity. The docs don't say whether
   automatic commits made by the workflow itself count. Our pipeline commits new data every trading
   day, which should count, but it can't be verified until it has run for a while. The popular
   "keepalive" tool that fakes activity has been **disabled by GitHub staff** for breaking their terms,
   so we don't use tricks like that. Instead: if the repository goes 45 days without a commit, the
   pipeline writes a warning into `meta.json` (the app will show it in Settings), and the app shows a
   "data is old" warning anyway. To fix it if it ever happens: GitHub → repo → **Actions** →
   **Update market data** → **Enable workflow**.
2. **Yahoo's terms**: Yahoo data is for personal use only, and a public repository technically makes
   the files downloadable by anyone. Low risk for a small personal app, but worth knowing. A private
   repo with Pages would need GitHub Pro (paid), so we're not doing that.
3. **Yahoo data glitches found and fixed automatically**: no distributions before 2013 for ASX ETFs
   (so early "total return" was really price only; proxy data is used there instead), and IVV's
   prices before 2011 weren't adjusted for its 2022 15-for-1 split.
4. **Backup sources**: Stooq, the usual free backup, now blocks automated downloads (bot check), so
   the only no-account backup is calling Yahoo directly (built in). Proper backups (Alpha Vantage,
   EODHD) need a free account and key: we'd ask Soham first. See DATA_SOURCES.md section 5.
5. **No free monthly Australian share data before 1975** and no AUD/USD before 1969, so "full history"
   predictions for Australian ETFs effectively start in 1975.
6. **The data commits mean the repository changes by itself** (2-3 commits per weekday from the
   robot). Claude will always "pull" the latest before working; nothing for Soham to do.
7. First-time download on the phone is about 0.5 MB compressed; after that only changed files
   (mostly the day's new prices).

## Suggested SPEC.md updates (for the coordinating session)
- 3.3: intraday files are deployed to the website but not kept in git (repo size); daily, monthly
  and macro data are committed.
- 3.2: record the 1975 start for Australian shares and 1969 for AUD/USD in free data, and that
  global shares before 1990 are approximate (DATA_SOURCES.md).
- 3.3 (60-day rule): answer recorded above; no keep-alive tricks (GitHub disabled the main one).
