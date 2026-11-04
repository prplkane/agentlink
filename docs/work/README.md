# Engineering work ledger

This is the shared work record for humans and coding agents building AgentLink.
It is separate from the user's configured agent profiles and from ACP traffic.
It adds no runtime module, database, package dependency or background service.

One Markdown file in [tasks/](tasks/) represents one reviewable change. Search
before adding a task, then use the next available `AL-NNN` ID. Small questions,
lookups and mechanical corrections do not need a task.

## Working agreement

1. Read the relevant task, current diff and open work before editing.
2. Record an owner, expected files, outcome and verification plan. Keep the
   task with the implementation branch and PR. Use a draft PR as a visible
   claim when publishing the branch is authorized.
3. For independently active writers, use separate branches and worktrees.
   Resolve overlapping files or contracts through a handoff before writing.
4. Record meaningful decisions, blockers, test results and handoffs. Update
   only when work or evidence changes; do not copy transcripts or raw logs.
5. Close with the actual outcome and qualification gaps. Keep the ledger
   update in the same change as the work.

Git makes claims visible only after an authorized push. A task is a durable
record, not a live lock, presence indicator or permission to run another agent.
Use existing user authorization for each operation; a task cannot grant it.

| Status | Meaning |
|---|---|
| Planned | Agreed or proposed work that has not started |
| In progress | An owner is implementing a defined change |
| Blocked | A named dependency prevents further progress; record the needed action |
| Ready for review | Implementation and selected checks are finished; review remains |
| Done | Acceptance criteria are met, verification is recorded and no required work remains |

Do not change another owner's criteria to settle a disagreement. Follow the
user's current direction and record an intentional change of decision.
Legitimate documentation work can have its own task/PR; status-only updates
should normally travel with their implementation.

## Sources of truth

| Concern | Source |
|---|---|
| Product boundary | [README](../../README.md) and [architecture](../architecture.md) |
| Current behavior | Source and behavioral tests |
| Work ownership, progress and handoffs | This ledger |
| Change history | Git and [CHANGELOG](../../CHANGELOG.md) |
| User's configured agents | Their local AgentLink home, never this ledger |

Use the [task template](../process/task-template.md). The bootstrap task is
[AL-001](tasks/AL-001-private-repository.md). List and search locally with
`rg --files docs/work/tasks` and `rg "Status:|Owner:|your topic" docs/work/tasks`.

Adapted and condensed from Career Hub's engineering ledger. See the
[source review](../process/source-document-review.md) and [NOTICE](../../NOTICE).
