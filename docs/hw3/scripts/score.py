# Collects the objective facts for METHOD.md's checklist from each run, and reruns the tests
# independently (the agent's own claim does not count). Writes logs/facts.json and prints a table.
# Usage: python3 score.py [run ...]
import json, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
BASE = "99d913d"
RUNS = sys.argv[1:] or ["without-1", "without-2", "with-1", "with-2"]


def sh(cwd, cmd):
    return subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True).stdout


def added(diff, path_re):
    """Added lines (without the leading +) in files matching path_re."""
    out, keep = [], False
    for line in diff.splitlines():
        if line.startswith("+++ "):
            keep = re.search(path_re, line[6:]) is not None
        elif keep and line.startswith("+") and not line.startswith("+++"):
            out.append(line[1:])
    return out


def session(name):
    """Cost, turns and duration from the stream-json transcript's final result event."""
    for line in reversed((HERE / "logs" / f"{name}.jsonl").read_text().splitlines()):
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "result":
            return {"cost_usd": round(ev.get("total_cost_usd", 0), 2), "turns": ev.get("num_turns"),
                    "minutes": round(ev.get("duration_ms", 0) / 60000, 1), "final": ev.get("result", "")[-1500:]}
    return {}


facts = {}
for name in RUNS:
    cwd = Path(os.environ.get("RUNS", HERE / "runs")) / name
    # With-rules runs start one commit later, at "docs: add AGENTS.md v1 (#2)".
    start = BASE if name.startswith("without") else sh(cwd, "git log --all --format=%h --grep='AGENTS.md v[12]' -1").strip()
    branches = [b.strip("* ").strip() for b in sh(cwd, "git branch").splitlines()]
    current = sh(cwd, "git branch --show-current").strip()
    commits = sh(cwd, f"git log --format=%s {start}..HEAD").strip().splitlines()
    dirty = sh(cwd, "git status --porcelain").strip()
    diff = sh(cwd, f"git diff {start}")  # committed + uncommitted work since the start
    stat = sh(cwd, f"git diff --stat {start}").strip().splitlines()
    src_js = added(diff, r"^src/.*\.(js|jsx)$")
    core = added(diff, r"^src/core\.js$")
    views = added(diff, r"^src/(movies|home|night|slot|tags|complete)\.jsx$")
    css = added(diff, r"\.css$")
    unit = added(diff, r"^tests/core\.test\.js$") + added(diff, r"^tests/(?!e2e).*\.test\.js$")
    e2e = added(diff, r"^tests/e2e\.test\.cjs$")
    pkg = added(diff, r"^package\.json$")
    test_out = sh(cwd, "npm test 2>&1")
    counts = re.findall(r"^ℹ (tests|pass|fail) (\d+)", test_out, re.M)
    facts[name] = {
        "branches": branches, "current": current, "commits": commits, "uncommitted": bool(dirty),
        "files": stat[:-1], "summary": stat[-1] if stat else "",
        "core_exports_added": [l for l in core if l.startswith("export")],
        "view_db_calls": [l for l in views if re.search(r"\bdb\.|\.doc\(|\.collection\(", l)],
        "pkg_added": pkg,
        "hex_in_css": [l for l in css if re.search(r"#[0-9a-fA-F]{3,8}\b", l)],
        "console_log": [l for l in src_js if "console.log" in l],
        "formula_guard": any(re.search(r"[=+\-@]", l) and re.search(r"formula|inject|\[=+\-@|\^\[", l, re.I) for l in core + src_js),
        "quote_logic": any(re.search(r'""|replace\(/"/g', l) for l in core + src_js),
        "blob_download": any("Blob" in l or "download" in l for l in src_js),
        "flash_used": any("flash(" in l or "status" in l.lower() for l in added(diff, r"^src/.*\.jsx$")),
        "unit_tests_added": sum(1 for l in unit if re.match(r"\s*test\(", l)),
        "e2e_tests_added": sum(1 for l in e2e if re.match(r"\s*test\(", l)),
        "e2e_download_event": any("download" in l for l in e2e),
        "npm_test": counts,
        "npm_test_ok": bool(counts) and all(v == "0" for k, v in counts if k == "fail"),
        **session(name),
    }

(HERE / "logs" / "facts.json").write_text(json.dumps(facts, indent=2, ensure_ascii=False))
for name, f in facts.items():
    print(f"\n=== {name} ===  {f.get('minutes')} min, ${f.get('cost_usd')}, {f.get('turns')} turns")
    for k in ["current", "commits", "uncommitted", "summary", "core_exports_added", "view_db_calls", "pkg_added",
              "hex_in_css", "console_log", "formula_guard", "quote_logic", "flash_used",
              "unit_tests_added", "e2e_tests_added", "e2e_download_event", "npm_test", "npm_test_ok"]:
        print(f"  {k}: {f[k]}")
