# Creates the GitHub Project "Sofa Tomato P2", sets its Status columns to the five Scrum columns,
# links the repo, adds every issue, and puts Sprint 1 issues in Sprint Todo, Sprint 2 in Backlog.
# Needs the `project` token scope: gh auth refresh -s project
# The Board layout itself must be picked in the web UI (the API cannot create views).
import json, subprocess, sys

OWNER, REPO, TITLE = "jmpei", "jmpei/sofa-tomato", "Sofa Tomato P2"
COLUMNS = [
    ("Backlog", "GRAY", "Not planned for the current sprint"),
    ("Sprint Todo", "BLUE", "Planned for this sprint, not started"),
    ("In Progress", "YELLOW", "Someone (human or agent) is working on it"),
    ("In Review", "PURPLE", "PR open, waiting for review"),
    ("Done", "GREEN", "Merged and closed"),
]
# Issues already being worked on in this session; everything else follows its milestone.
OVERRIDE = {2: "In Review", 13: "In Progress"}


def gh(*args):
    r = subprocess.run(["gh", *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"gh {' '.join(args)} failed: {r.stderr}")
    return r.stdout


def graphql(query, **variables):
    args = ["api", "graphql", "-f", f"query={query}"]
    for k, v in variables.items():
        args += ["-F" if isinstance(v, int) else "-f", f"{k}={v}"]
    return json.loads(gh(*args))["data"]


projects = json.loads(gh("project", "list", "--owner", OWNER, "--format", "json"))["projects"]
project = next((p for p in projects if p["title"] == TITLE), None)
if project is None:
    project = json.loads(gh("project", "create", "--owner", OWNER, "--title", TITLE, "--format", "json"))
number, pid = project["number"], project["id"]
gh("project", "link", str(number), "--owner", OWNER, "--repo", REPO)

fields = json.loads(gh("project", "field-list", str(number), "--owner", OWNER, "--format", "json"))["fields"]
status = next(f for f in fields if f["name"] == "Status")
if [o["name"] for o in status.get("options", [])] != [c[0] for c in COLUMNS]:
    opts = ", ".join(f'{{name: "{n}", color: {c}, description: "{d}"}}' for n, c, d in COLUMNS)
    graphql('mutation { updateProjectV2Field(input: {fieldId: "%s", singleSelectOptions: [%s]}) { clientMutationId } }'
            % (status["id"], opts))
    fields = json.loads(gh("project", "field-list", str(number), "--owner", OWNER, "--format", "json"))["fields"]
    status = next(f for f in fields if f["name"] == "Status")
option = {o["name"]: o["id"] for o in status["options"]}

issues = json.loads(gh("issue", "list", "-R", REPO, "--state", "all", "--limit", "100", "--json", "number,url,milestone"))
for issue in sorted(issues, key=lambda i: i["number"]):
    item = json.loads(gh("project", "item-add", str(number), "--owner", OWNER, "--url", issue["url"], "--format", "json"))
    column = OVERRIDE.get(issue["number"]) or ("Sprint Todo" if (issue["milestone"] or {}).get("title") == "Sprint 1" else "Backlog")
    gh("project", "item-edit", "--id", item["id"], "--project-id", pid, "--field-id", status["id"],
       "--single-select-option-id", option[column])
    print(f"#{issue['number']:>2} → {column}")
print(f"https://github.com/users/{OWNER}/projects/{number}")
