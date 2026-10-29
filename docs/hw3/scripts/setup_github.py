# Creates labels, milestones and issues for jmpei/sofa-tomato from issues.json.
# Safe to re-run: skips labels/milestones/issues that already exist (matched by name/title).
import json, subprocess, sys
from pathlib import Path

REPO = "jmpei/sofa-tomato"
HERE = Path(__file__).parent

LABELS = {
    "feature": ("1f883d", "New user-visible capability"),
    "bug": ("d73a4a", "Something is broken"),
    "chore": ("6e7781", "Tooling, CI, refactor"),
    "docs": ("0075ca", "Documentation"),
    "accessibility": ("8250df", "Keyboard, screen reader, contrast"),
    "priority: high": ("b60205", "Do first this sprint"),
    "priority: medium": ("fbca04", "Do this sprint if time allows"),
    "priority: low": ("c2e0c6", "Nice to have"),
}
MILESTONES = {
    "Sprint 1": ("2026-11-07T23:59:00Z", "US8–US11, CI, AGENTS.md, accessibility pass"),
    "Sprint 2": ("2026-11-21T23:59:00Z", "Import, rewatch, group Movie Night, stats, clock bug"),
}


def gh(*args, input=None):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, input=input)
    if r.returncode != 0:
        sys.exit(f"gh {' '.join(args)} failed: {r.stderr}")
    return r.stdout


existing = {l["name"] for l in json.loads(gh("label", "list", "-R", REPO, "--limit", "100", "--json", "name"))}
for name, (color, desc) in LABELS.items():
    if name not in existing:
        gh("label", "create", name, "-R", REPO, "--color", color, "--description", desc)

have = {m["title"] for m in json.loads(gh("api", f"repos/{REPO}/milestones?state=all"))}
for title, (due, desc) in MILESTONES.items():
    if title not in have:
        gh("api", f"repos/{REPO}/milestones", "-f", f"title={title}", "-f", f"due_on={due}", "-f", f"description={desc}")

done = {i["title"] for i in json.loads(gh("issue", "list", "-R", REPO, "--state", "all", "--limit", "200", "--json", "title"))}
for issue in json.loads((HERE / "issues.json").read_text()):
    if issue["title"] in done:
        continue
    args = ["issue", "create", "-R", REPO, "--title", issue["title"], "--body-file", "-", "--milestone", issue["milestone"]]
    for label in issue["labels"]:
        args += ["--label", label]
    print(gh(*args, input=issue["body"]).strip(), issue["title"])
