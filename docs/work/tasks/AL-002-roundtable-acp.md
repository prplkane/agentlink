# AL-002: Roundtable reviews through standard ACP

Status: Ready for review (local branches)
Owner: Codex
Started: 2026-11-05

## Outcome

Roundtable can use centrally configured AgentLink profiles through standard ACP,
with a complete review verified offline using fake agents. No runtime dependency
or orchestration feature is added to AgentLink.

## Scope

Roundtable: a small ACP client/adapter, seat configuration and validation,
application wiring, focused fixtures/tests, README, workflow, security and changelog.
AgentLink: cross-project offline integration verification and laptop instructions,
README and this record. Work uses separate branches and an isolated Roundtable
worktree because its original checkout contains unrelated terminal changes.

## Acceptance

- A saved AgentLink profile can serve a Roundtable seat and chairman.
- An offline full review reaches a ready chairman verdict through the real gateway.
- Seats keep separate sessions and working directories; cancellation cleans up.
- Tool requests are denied and prohibited tool activity stops the seat.
- Missing capabilities, authentication and unavailable usage remain explicit.
- Existing direct CLI adapters retain their existing behavior.
- No real agents, model requests, user profiles or new runtime dependencies.

## Verification plan

Focused ACP, configuration and lifecycle tests, Roundtable's full offline suite,
and an AgentLink-to-Roundtable test using synthetic temporary homes. Run repository
checks and inspect both diffs. Live vendors and other operating systems remain
for the owner's laptop qualification.

## Checkpoints and decisions

- Use standard ACP v1, the current stable protocol; reject incompatible versions.
- Keep launch configuration outside prompts and model-controlled input. Never
  execute help text or silently choose an unsafe permission mode.
- Roundtable adds an ACP client and uses its existing account field for a saved
  AgentLink profile. AgentLink's runtime and central bridge management are unchanged.
- Each turn uses a fresh process/session. Client tools are denied and reported tool
  activity stops the seat; ACP cannot sandbox the profile's built-in tools.
- Missing optional end-turn token usage remains unknown. Existing seat caps stop
  later calls rather than treating context occupancy as spending.
- The Roundtable worktree starts at `8e90cbb`, which includes separate unmerged work.
  Keep this task on `codex/agentlink-acp`; do not publish those earlier changes as
  part of this task. AgentLink uses `codex/roundtable-acp`.

## Final receipt

Tested revision/diff: the ACP integration on the branches above; no release version
bump. Roundtable adds the transport, profile controls, lifecycle wiring, fake peer
and regression tests. AgentLink adds an explicit cross-project test and laptop guide.

Commands and actual outcomes on Windows:

- Roundtable `node --test test/*.test.js`: 408 passed, 0 failed, 1 skipped.
  The skipped POSIX file-mode test does not apply to Windows. The initial run's
  provider-count expectation was updated to include the intentionally added ACP kind.
- After the final cleanup grace change, `node --test test/acp.test.js`: 20 passed.
- After the final demo readiness change, the focused `fake server end to end:
  three seats` server test passed. Demo mode does not require AgentLink installed.
- AgentLink `node scripts/test-roundtable.mjs <roundtable-checkout>`: 5 passed.
  The real server/gateway completed two rounds and a ready chairman verdict, used
  an updated central bridge without review configuration changes, cancelled live
  seats, released installation leases and enforced missing-usage limits.
- Browser inspection verified seat/chairman profile controls and values. The full
  review evidence comes from the real server integration test, not the demo UI.
- No vendor CLI, model request or real user profile was used in these checks.

Skipped/pending coverage: live vendors, Linux/macOS execution and hosted CI. Real
bridges still need qualification for text, usage, permissions and cancellation.
Profiles without usable usage may not complete critique rounds. AgentLink's
unchanged runtime suite was not repeated for this test/documentation-only change.

Handoff: implementation and tests are local, with no merge or package publication.
The original Roundtable checkout was not edited. A PR can be prepared after its
separate base changes have an agreed publication branch.

Repository and privacy gate:

- Staged whitespace checks passed in both repositories. AgentLink's repository
  checker passed for 66 tracked files; Roundtable's four public-tree/privacy tests
  passed with all new files staged. No private/generated path was staged.
- Semgrep completed with zero findings (79 rules, 25 AgentLink and 63 Roundtable
  targets). Default ignored paths were not scanned; results are not a security guarantee.
- Gitleaks found no secrets in either staged diff or the existing Git histories
  (2 AgentLink and 137 Roundtable commits).
- Trivy returned no findings. It found no supported dependency manifests or
  infrastructure configuration targets, so dependency/configuration coverage was
  absent; its secret scan ran. Safe Chain is unavailable and was skipped; no
  packages were installed.
- Offline package dry-runs contain 28 AgentLink files (48,783 packed bytes) and
  71 Roundtable files (310,194 packed bytes). AgentLink's integration script is
  excluded from its package. No runtime dependencies were added to either project.
- Raw test/scan artifacts stayed outside both repositories. The global Git privacy
  hook remained enabled. No hosted checks or live vendor calls were triggered.
