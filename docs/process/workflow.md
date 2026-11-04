# Development workflow and verification

Read [AGENTS.md](../../AGENTS.md), inspect the relevant files and existing task,
then record a short plan for non-trivial work. Select tests by the behavior and
risk being changed. An existing user instruction remains authorization; do not
introduce a new approval step for an already authorized action.

| Change | Useful verification |
|---|---|
| Documentation or repository settings | `npm run check:repo`; validate actual settings after changing them |
| Focused behavior fix | Reproduction, owning test file and affected consumers |
| Profiles, installation, archives, framing, authentication, cancellation or process lifecycle | Focused regressions, affected integration tests and `npm test` |
| Package/release | Above plus inspect `npm pack --dry-run --json --offline --ignore-scripts` and an isolated offline installation |

For a narrow test, put runner options before file paths:

~~~sh
node --test --test-name-pattern="abort" test/gateway.test.mjs
~~~

Test observable behavior: saved/reloaded state, exact protocol bytes, retained
working installations, cancellation and cleanup. Include a relevant failure or
recovery case. Exercise meaningful boundaries rather than mirroring every helper.
Do not create tests for a wording correction merely to increase test counts.

The normal suite uses local fake agents, packages, archives and a Python wheel.
It must not launch real vendor agents, authenticate, or send model requests.
Python fixture coverage is skipped when Python is absent; a skip is not a pass.
Real-agent qualification follows the [laptop guide](../laptop-testing.md).

For broad work, record scope, prerequisites, deadlines, synthetic data and any
missing platform coverage. Wait for meaningful results with bounded calls and
regular progress updates. On a deadline or missing prerequisite, preserve a
continuation checkpoint; do not mislabel unfinished work as verified.

Run selected checks before reporting behavior complete. Once they pass, rerun
only if the code, fixtures, environment or unresolved evidence changes. Classify
failures as product, test, environment or unresolved. Keep expectations intact.

Use this compact receipt in the work task and PR:

~~~text
Tested revision/diff:
Behavior and risk:
Commands and actual outcomes:
Skipped/pending coverage:
Failure disposition or remaining action:
~~~

Hosted tests are supplementary evidence. Their trigger and availability are
documented in [repository setup](repository-setup.md). An unavailable runner or
paid feature must be reported accurately; do not spend money or change visibility
to bypass an account limitation.

Adapted from Career Hub's workflow/testing guidance and Roundtable's offline
test boundary. Browser, Go, Electron and project-specific release gates were omitted.
