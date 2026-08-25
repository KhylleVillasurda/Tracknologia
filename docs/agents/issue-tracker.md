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

## Release hardening (v0.1.0)

During the v0.1.0 hardening milestone, release issues follow the conventions in `docs/release/v0.1.0-hardening/handoff/01_RELEASE_BASELINE_AND_CHANGE_CONTROL.md`.

- **Template**: use the `.github/ISSUE_TEMPLATE/release-issue.yml` form; it carries severity, affected Module, route/database impact, reproduction, expected behavior, security/data impact, required tests, owner, and release-blocker fields.
- **Milestone**: assign every open release issue to the `v0.1.0 Hardening & Validation` milestone.
- **Severity**: P0 stop release | P1 must close | P2 fix or Lead-approved defer | P3 post-release.
- **State machine**:

```text
TRIAGE -> ACCEPTED -> IN PROGRESS -> REVIEW -> VERIFIED -> CLOSED
                                    \-> DEFERRED
```

`VERIFIED` means the integrated fix passed its full regression surface on `staging`, not merely that code merged.

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
