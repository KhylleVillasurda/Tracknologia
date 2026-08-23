# Issue tracker: GitHub

Issues and specs for this repo live in GitHub Issues for `Jacinth091/Tracknologia`. Use the `gh` CLI for issue operations from inside this clone.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments`
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; `gh` does this automatically when run inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` if this repo later treats external PRs as feature requests.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is a single issue with child issues as tickets.

- **Map**: create one issue labelled `wayfinder:map`, holding notes, decisions so far, and remaining fog.
- **Child ticket**: create an issue linked to the map as a GitHub sub-issue when available. If sub-issues are not enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body.
- **Blocking**: prefer GitHub native issue dependencies when available. Otherwise use a `Blocked by: #<n>, #<n>` line at the top of the child body.
- **Frontier query**: list the map's open children, drop any with open blockers or assignees, and take the first in map order.
- **Claim**: assign the chosen issue to the driving developer.
- **Resolve**: comment with the answer, close the issue, then append a context pointer to the map's decisions.
