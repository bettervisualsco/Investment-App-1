"""Data pipeline entry point.

    python pipeline/run.py update                 run whatever is due right now (what the schedule does)
    python pipeline/run.py update --tasks all     run everything now
    python pipeline/run.py update --tasks daily_asx,macro
    python pipeline/run.py due                    just show what would run now
    python pipeline/run.py restore-live --base-url https://<you>.github.io/<repo>/
    python pipeline/run.py refresh-meta           recompute file fingerprints in data/meta.json
    python pipeline/run.py build-static           rebuild pipeline/static (rarely needed)

Every job is protected: if a download fails or looks wrong, the last good file is kept and the
problem is written to data/meta.json. The command still exits 0 so the website keeps deploying.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from datapipe.meta import Meta  # noqa: E402  (standard library only)
from datapipe.util import DATA_DIR, USER_AGENT, iso, load_json, now_utc, parse_iso  # noqa: E402

ALL_TASKS = ["daily_asx", "daily_us", "intraday_asx", "intraday_us", "macro", "proxies"]


def cmd_update(tasks_arg: str) -> int:
    from datapipe import etfs, macro, monthly, prices, schedule
    from datapipe.config import by_market, load_tickers

    now = now_utc()
    meta = Meta()
    tickers = load_tickers()
    if tasks_arg == "auto":
        tasks = schedule.due_tasks(now, meta.tasks)
    elif tasks_arg == "all":
        tasks = list(ALL_TASKS)
    else:
        tasks = [t.strip() for t in tasks_arg.split(",") if t.strip()]
        unknown = set(tasks) - set(ALL_TASKS)
        if unknown:
            print(f"Unknown task(s): {', '.join(sorted(unknown))}. Choose from {', '.join(ALL_TASKS)}.")
            return 2
    print(f"{iso(now)}  tasks: {', '.join(tasks) or 'nothing due'}")

    rebuild_monthly = False
    deploy = False
    for task in ALL_TASKS:
        if task not in tasks:
            continue
        meta.task_started(task, now)
        try:
            if task.startswith("daily_"):
                key = task.split("_")[1]
                market = schedule.MARKETS[key]
                session = schedule.latest_closed_session(market, now).isoformat()
                changed, latest = prices.update_daily(by_market(tickers, key), meta, now)
                deploy |= changed
                rebuild_monthly |= changed
                if latest and latest >= session:
                    meta.task_done(task, now, forDate=session)
                elif schedule.assume_holiday(market, date.fromisoformat(session), now):
                    meta.task_done(task, now, forDate=session, note=f"no close for {session} (public holiday?)")
                else:
                    meta.task_done(task, now, error=f"close for {session} not published yet; will retry")
                print(f"  {task}: latest close {latest}, files changed: {changed}")
            elif task.startswith("intraday_"):
                key = task.split("_")[1]
                result = prices.update_intraday(key, by_market(tickers, key), meta, now)
                deploy |= result == "written"
                meta.task_done(task, now, error="no bars" if result == "failed" else None, result=result)
                print(f"  {task}: {result}")
            elif task == "macro":
                c1 = macro.build_inflation(meta, now)
                c2 = macro.build_rates_and_fx(meta, now)
                errors = [s for s in ("abs", "fred", "rba") if meta.sources.get(s, {}).get("status") == "error"]
                meta.task_done(task, now, error=("failed: " + ", ".join(errors)) if errors else None)
                deploy |= c1 or c2
                rebuild_monthly |= c1 or c2
                print(f"  macro: inflation changed {c1}, rates/fx changed {c2}, errors: {errors or 'none'}")
            elif task == "proxies":
                ok = macro.fetch_proxies(meta, now)
                meta.task_done(task, now, error=None if ok else "French data download failed")
                rebuild_monthly |= ok
                print(f"  proxies: {'ok' if ok else 'failed (kept saved copy)'}")
        except Exception as e:  # never let one job stop the others
            meta.task_done(task, now, error=e)
            meta.problem(task, e, now)
            print(f"  {task}: FAILED {type(e).__name__}: {e}")

    try:
        deploy |= etfs.update(tickers) == "written"
    except Exception as e:
        meta.problem("etfs", e, now)
        print(f"  etfs.json: FAILED {e}")

    if rebuild_monthly or not (DATA_DIR / "monthly.json").exists():
        try:
            result = monthly.update(tickers, now)
            deploy |= result == "written"
            print(f"  monthly.json: {result}")
        except Exception as e:
            meta.problem("monthly", e, now)
            print(f"  monthly.json: FAILED {type(e).__name__}: {e} (kept the last good file)")

    meta.save(now)
    _github_output(deploy=str(deploy or bool(tasks)).lower())
    return 0


def _github_output(**kv: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            for k, v in kv.items():
                f.write(f"{k}={v}\n")


def _fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def cmd_restore_live(base_url: str) -> int:
    """Intraday files are not kept in git (they change every 15 minutes and would bloat the repo).
    Before each run/deploy, copy them, and the newer meta.json, back from the live website."""
    base = base_url.rstrip("/") + "/data/"
    try:
        live = json.loads(_fetch(base + "meta.json"))
    except Exception as e:
        print(f"No live site data yet ({e}); starting from the files in git.")
        return 0
    for rel in live.get("files", {}):
        if rel.startswith("intraday/") and not (DATA_DIR / rel).exists():
            try:
                (DATA_DIR / rel).parent.mkdir(parents=True, exist_ok=True)
                (DATA_DIR / rel).write_bytes(_fetch(base + rel))
                print(f"restored {rel}")
            except Exception as e:
                print(f"couldn't restore {rel}: {e}")
    local = load_json(DATA_DIR / "meta.json", {}) or {}
    lt, gt = parse_iso(local.get("generatedAt")), parse_iso(live.get("generatedAt"))
    if gt and (lt is None or gt > lt):
        (DATA_DIR / "meta.json").write_text(json.dumps(live, separators=(",", ":")), encoding="utf-8")
        print("using the live meta.json (it is newer)")
    Meta().save()  # re-fingerprint what is actually on disk
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Investment planner data pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)
    u = sub.add_parser("update")
    u.add_argument("--tasks", default="auto")
    sub.add_parser("due")
    r = sub.add_parser("restore-live")
    r.add_argument("--base-url", required=True)
    sub.add_parser("refresh-meta")
    sub.add_parser("build-static")
    a = p.parse_args()
    if a.cmd == "update":
        return cmd_update(a.tasks)
    if a.cmd == "due":
        from datapipe.schedule import due_tasks

        print(", ".join(due_tasks(now_utc(), Meta().tasks)) or "nothing due")
        return 0
    if a.cmd == "restore-live":
        return cmd_restore_live(a.base_url)
    if a.cmd == "refresh-meta":
        Meta().save()
        return 0
    if a.cmd == "build-static":
        from datapipe import static_build

        static_build.main()
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
