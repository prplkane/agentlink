# AL-006: Published integration regression check

Status: Done
Owner: Codex
Started: 2026-11-11

## Outcome and scope

Verify the published AgentLink beta and Roundtable integration after release.
Keep AgentLink lightweight and retain zero runtime dependencies. The starting
revisions are AgentLink `f536974` and Roundtable development `74155d6`; the
released packages are `0.3.0-beta.1` and `0.6.6`, respectively.

Expected files: this work record, plus only source, tests and behavior docs
justified by a reproduced regression. Raw logs and isolated installations stay
outside Git. No version change or publication is part of this verification.

## Acceptance and verification plan

- Run both full offline suites on Windows with Node 22 and 24, including the
  Windows scoped launcher and forced-GC MCP wait regression.
- Verify registry integrity, package layout and installed versions. Exercise
  newly installed release packages without altering the user's profiles.
- Run the cross-project ACP harness against source and released packages:
  two review rounds and a ready chairman, central bridge update, Stop and lease
  cleanup, and enforcement when a bridge omits token usage.
- Check the installed launcher and current board/MCP versions read-only.
- Investigate failures before classifying them. Record actual passes, skips,
  failures and qualification limits; previous platform/live checks are historical.
- Run the repository checker and diff checks before handoff. Use synthetic
  temporary homes and fake agents; do not call live vendors.

## Checkpoints and decisions

- Both source checkouts were clean at the start. npm metadata and global package
  versions still match the releases recorded in AL-005. No runtime dependency
  has been added to either package.
- The first Node 22 run used a standalone executable without adjacent npm or a
  matching PATH. Five failures were test setup errors; a complete isolated Node
  layout resolves them. The corrected run still failed profile rollback because
  a concurrent reader held the destination open during atomic replacement.
- A separate reproduction confirmed `EPERM` on Windows Node 22 and 24 with an
  open reader. A failed replacement must remain atomic, retry only bounded
  sharing conflicts and preserve the original data if contention persists.
  The same replacement operation owns profile and bridge metadata publication.
  Expected fix files: their two storage owners, a shared replacement helper,
  deterministic storage regressions, architecture/changelog and this record.

## Final receipt

- Reproduced the Windows replacement failure against the registry-installed
  `0.3.0-beta.1`, as well as both local Node versions. Two deterministic recovery
  tests failed before the patch. All four new storage tests pass afterward:
  profile/bridge replacement recovers after a brief reader closes; persistent
  contention reports an error, preserves old JSON and removes temporary files.
- Added one standard-library helper for the two existing storage owners. It
  retries only Windows sharing/permission errors, at most five times and 750 ms
  of delay, without unlinking the destination. Continuous contention remains a
  bounded error rather than an unbounded wait. No orchestration, installer
  startup work, dependency, profile migration or version change was introduced.
- Windows Node 22.23.4 and 24.19.0: the patched full AgentLink suite passes all
  101 tests on each version, with no skips. The existing rollback regression
  passes unchanged. Commands: `node --test test/*.test.mjs` and `npm test` with
  isolated homes and offline npm/Python fixture settings.
- Roundtable development `74155d6`: each Node version passes 417 of 418 tests,
  with one POSIX-only skip and no failures. The scoped npm launcher, forced-GC
  deadline and original long MCP wait all pass. No Roundtable edit was needed.
- Fresh registry tarballs match the AL-005 release integrities. All 29 AgentLink
  and 71 Roundtable package files also match the installed global copies.
  Both packages still have zero runtime dependencies. An isolated offline
  installation of the patched package includes the new helper (30 files), and
  all five Roundtable integration checks pass against it on Node 22.
- The source cross-project harness passes all five checks before and after the
  patch. Freshly installed release packages pass all five on Node 22 and 24,
  using normal Windows global-prefix PATH resolution without a CLI override.
  This covers two rounds plus a ready chairman, central updates, Stop, leases
  and unknown-usage caps. Synthetic profiles and raw logs remain outside Git.
- The installed board is `0.6.6` with API version 1 and no active reviews. The
  connected MCP status succeeds; the stale-process mismatch from AL-005 is gone.
- Repository and whitespace checks pass. Gitleaks reports no secrets in the
  seven changed files. Semgrep scans all three changed runtime modules with 68
  JavaScript rules and reports no findings.

All six [hosted platform jobs](https://github.com/prplkane/agentlink/actions/runs/42951503892)
passed: Windows 101 passed with zero skips; Linux/macOS 93 passed with eight
Windows-only skips. [PR 3](https://github.com/prplkane/agentlink/pull/3) merged as
`a004648`, with the same tested tree. Live vendor calls were not rerun.
At the regression handoff, the published beta still contained the defect.
The authorized follow-up release is tracked in [AL-007](AL-007-fixed-beta-release.md).
