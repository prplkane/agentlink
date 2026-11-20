# Local work records

People and coding agents building AgentLink keep work records as local files.
A record is separate from the user's configured agent profiles and from ACP
traffic. It adds no runtime module, database, package dependency or
background service.

**Work records, plans and review notes are never committed or pushed.** They
stay on the machine where they are written. Tracked files do not link to
them. The public account of a change is its code, its tests, the behavior
documentation and a short entry in the [CHANGELOG](../../CHANGELOG.md).

One Markdown file in `docs/work/tasks/` represents one reviewable change. Git
ignores that folder. Search the local files before adding a task, then use
the next available `AL-NNN` ID. Small questions, lookups and mechanical
corrections do not need a task.

## Working agreement

1. Read the relevant local record, current diff and open work before editing.
2. Record an owner, expected files, outcome and verification plan.
3. For independently active writers, use separate branches and worktrees.
   A record written in one worktree is not visible in another. Hand it over
   by giving its full path, and resolve overlapping files or contracts
   before writing.
4. Record meaningful decisions, blockers, test results and handoffs. Update
   only when work or evidence changes; do not copy transcripts or raw logs.
5. Close with the actual outcome and qualification gaps.
6. Before any commit, check the staged list. It contains source, tests, user
   documentation and the changelog, and no work record.

A record is a durable local note. It is not a live lock, a presence
indicator or permission to run another agent. Use existing user
authorization for each operation; a record cannot grant it.

| Status | Meaning |
|---|---|
| Planned | Agreed or proposed work that has not started |
| In progress | An owner is implementing a defined change |
| Blocked | A named dependency prevents further progress; record the needed action |
| Ready for review | Implementation and selected checks are finished; review remains |
| Done | Acceptance criteria are met, verification is recorded and no required work remains |

Do not change another owner's criteria to settle a disagreement. Follow the
user's current direction and record an intentional change of decision.

## Sources of truth

| Concern | Source |
|---|---|
| Product boundary | [README](../../README.md) and [architecture](../architecture.md) |
| Current behavior | Source and behavioral tests |
| Work ownership, progress and handoffs | Local work records |
| Change history | Git and [CHANGELOG](../../CHANGELOG.md) |
| User's configured agents | Their local AgentLink home, never a work record |

Use the [task template](../process/task-template.md).

Adapted and condensed from Career Hub's engineering ledger. See the
[source review](../process/source-document-review.md) and [NOTICE](../../NOTICE).
