# AL-003: ACP regression and Roundtable qualification

Status: Done (released with AL-005)
Owner: Codex
Started: 2026-11-09

## Outcome

Reproduce ACP compatibility failures, patch confirmed regressions, and report
Roundtable behavior for Codex, Claude, Antigravity and a deterministic small-agent
mimic. Distinguish offline coverage, live results and missing prerequisites.

## Scope

AgentLink runtime/client and owning tests where evidence warrants changes;
`scripts/test-roundtable.mjs`, laptop testing instructions, a sanitized qualification
report and this record. Inspect the existing Roundtable ACP implementation and
patch its owning adapter/tests if needed in a separate branch. No new orchestration,
runtime dependencies, saved user profiles or automatic installation on connect.

## Acceptance

- Establish an offline baseline and retain meaningful reproductions for each fix.
- Exercise a real Roundtable server through AgentLink using synthetic profiles.
- Attempt the requested available live providers with bounded synthetic prompts;
  record unavailable routes and consent requirements accurately.
- Verify streaming, setup, model selection, usage limits, tool denial and cleanup.
- Update behavior docs and report concrete improvements and remaining limits.

## Verification plan

Run owning regression tests, the cross-project Roundtable test, the required full
offline suites for protocol/lifecycle changes, and repository checks. Live vendor
qualification is explicit and separate; routine tests use temporary homes and fake
agents. Keep personal paths, transcripts and raw logs out of tracked records.

## Checkpoints and decisions

- AgentLink starts from `c087f82` on `codex/acp-regression-qualification` with a
  clean worktree. Previous work AL-002 qualified only offline fixtures.
- Installed Roundtable 0.6.3 exposes direct CLI providers, not ACP. Git worktree
  metadata located the existing integration at `b4141d4`. Its one integration
  commit was replayed onto Roundtable main `b032625` (0.6.5) in a new worktree,
  resolving doctor/changelog overlaps without changing either original checkout.
- The user acknowledged both agy terms and isolation limits for live testing.
- Real Codex and Claude rejected the probe's hybrid v2/v1 initialize request.
  Version-specific request/response fields fixed both pinned managed installs.
- A controlled Windows cwd holder reproduced cleanup EBUSY; bounded standard
  filesystem retries fixed it for success and error outcomes.
- Live refresh exposed lost exact arguments. Preserve manual/managed recipes;
  help-derived profiles still rediscover. The old stale-argument test was scoped
  to help-derived profiles, with new tests preserving failed exact profiles.
- Roundtable accepted a foreign-session frame coalesced with session creation.
  Binding at the response receive boundary makes the regression reject before a prompt.
- Native `agy acp` now exists and initialized successfully. Update the recipe,
  retaining a vendor-terms qualification instead of claiming broad policy approval.

## Final receipt

Follow-up scope (2026-11-09): the user requested keeping AgentLink lightweight and
rerunning the chairman at lower effort, switching vendors if only provider delay
remains. Owner: Codex. Expected repository changes: this record and the qualification
report/laptop guide only. Use a separate synthetic profile with a bridge-supported
effort default, verify the advertised value, and run the existing Roundtable path.
Acceptance: report the actual chairman outcome; use the authorized alternate vendor
if Codex still fails without an ACP defect. No new AgentLink settings abstraction,
budget logic or orchestration is planned.

Follow-up outcome: a separate temporary Codex chairman profile used the bridge's
existing `CODEX_CONFIG` with `model_reasoning_effort: "low"`. The advertised effort
was verified before and after model selection without a model call. The otherwise
unchanged four-seat live review completed two rounds and a ready chairman verdict
in nine attempts; no seat failed. Chairman latency was 12,169 ms with reported
usage. The scenario question timed out unanswered as designed. The authorized
alternate vendor was unnecessary. No new ACP defect was found and no runtime
code or dependency was added; only this record, qualification report and setup
guidance changed. The complete offline suites were not repeated for this
configuration/documentation-only follow-up; their preceding results remain below.
Follow-up validation: repository checks passed for all 68 staged/tracked files;
whitespace checks passed, and no matching test-launch processes remained after
stopping the verified temporary server.

Tested revision/diff: AgentLink base `c087f82` plus this task's local changes;
Roundtable integration rebased as `7b6d233` plus its session-binding fix and updated
fake peer. See the [qualification report](../../acp-qualification.md) for versions,
live provider results, sources, the test-review receipt and suggested improvements.

Behavior and risk: initialization/version negotiation, profile refresh, temporary
directory cleanup and ACP client session isolation. No runtime dependencies added.

Commands and actual outcomes on Windows / Node 24.19.0:

- AgentLink baseline `npm test`: 92 passed. Final suite: 96 passed, no failures,
  skips or cancellations. Python offline installation fixture included.
- Roundtable rebased baseline: 414 passed, one POSIX-only skip. Final `npm test`:
  415 passed, one POSIX-only skip, no failures. Focused ACP tests: 21 passed.
- Cross-project `node scripts/test-roundtable.mjs <updated-checkout>`: 5 passed.
- Each new behavioral regression failed before its fix and passed afterwards.
- Live smoke: Codex, Claude and agy returned the expected marker through the
  Roundtable adapter and real gateway, with usable usage and no reported tools.
- Initial live server run: all four seats completed two rounds (one critique); the Codex
  chairman timed out at the selected 60-second deadline. Verdict failed, usage
  unknown, no automatic retry. Do not label this as a ready live verdict.
- Tests used synthetic AgentLink homes. The installed board and user profiles
  were unchanged. Temporary live board was stopped; no matching test-launch
  processes remained in the final process check.

Skipped/pending coverage: Linux/macOS, hosted CI, live vendor permission challenges,
large output, live central updates, and per-vendor cancellation recovery. Offline
coverage is separate from those limits. Live Claude/agy chairman roles were not tested.

Handoff: both local work branches contain reviewable changes; no merge, push,
release or global installation was performed. The running Roundtable installation
still needs the reviewed integration before its normal board can offer ACP seats.
Repository review: AgentLink `npm run check:repo` passed for 68 staged/tracked
files, including the new report and task. Roundtable's four public-tree/privacy
tests passed after staging. Both staged whitespace checks passed. Reviewed the
runtime diff and checklist; raw transcripts, package caches and live test profiles
remain outside both repositories. These local checks are not a publish security scan.
