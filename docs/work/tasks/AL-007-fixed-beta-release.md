# AL-007: Publish the fixed AgentLink beta

Status: Blocked — npm authentication for the default distribution tag
Owner: Codex, authorized by the maintainer's merge/publication instruction
Started: 2026-11-11

## Outcome and scope

Publish `@prplkane/agentlink@0.3.0-beta.2` with the Windows metadata replacement
fix from PR 3, update the installed AgentLink package, and verify the existing
Roundtable installation through standard ACP. Retain zero runtime dependencies
and the current product boundary.

Expected files: package/version metadata, README, laptop testing instructions,
changelog and AL-006/AL-007 work records. AgentLink runtime behavior is the
already tested PR 3 fix. Final verification also identified a separate Roundtable
Windows launcher issue; its small fix is prepared in that project's own PR.
Test homes, archives, raw logs and authentication material stay outside Git.

## Acceptance and verification

- Confirm PR 3 is merged and its tree matches the successful platform run.
- Align the next beta version, inspect the package, run repository checks and
  the required Windows/Linux/macOS Node 22/24 PR matrix.
- Complete local secret/privacy checks, install the candidate offline, and
  verify both the Windows replacement regression and Roundtable integration.
- Publish the exact tested archive publicly under `beta`, verify its registry
  integrity, and publish matching source release notes.
- Advance the existing `latest` tag from the older beta to the fixed beta so
  default installations do not remain on the known defect. Both versions remain
  explicitly labeled prereleases; no stable release is introduced.
- Install the registry version globally. Verify the normal shell-free launcher,
  isolated full review/chairman, bridge update, Stop/lease cleanup and usage caps.
- Preserve installed user profiles. Use fake agents, make no live model calls,
  and record actual outcomes and remaining limits.

## Checkpoints and decisions

- PR 3 was already merged when this instruction was received. Merge `a004648`
  has the exact tree of tested head `e980235`; all six platform jobs passed.
- At the start, the installed packages were AgentLink `0.3.0-beta.1` and
  Roundtable `0.6.6`.
  Roundtable uses the external AgentLink CLI and needs no dependency update.
- npm authentication has expired. Any fresh sign-in challenge is a registry
  requirement; the maintainer has already authorized publication and installation.
- The candidate archive contains 30 allowlisted files, 54,537 compressed bytes
  and 179,083 unpacked bytes. Every offline-installed file matches the source;
  the package has zero runtime dependencies and includes the replacement helper.
- Four Windows storage regressions pass against both source and the installed
  archive. All five Roundtable integration checks pass against the archive using
  normal Windows global-prefix launcher resolution, without a CLI override.
- Repository/version/link checks and diff checks pass. Semgrep reports zero
  findings in the changed version module; the unchanged runtime fix retains
  the security and regression evidence in AL-006.

## Final receipt

### Released artifact

- Release preparation [PR 4](https://github.com/prplkane/agentlink/pull/4)
  merged as `df011574848812997959ae70d124293ecd9f3c15`. Its tree matches
  tested head `25c873a8dc8f3525526f7c8485f83a3291dd0933`.
- All six jobs in [the release matrix](https://github.com/prplkane/agentlink/actions/runs/42967557127)
  passed: Windows Node 22/24 each passed 101 tests with no skips; Linux and macOS
  Node 22/24 each passed 93 tests with eight Windows-only skips. Python fixture
  coverage ran on every platform.
- Published [AgentLink 0.3.0-beta.2](https://www.npmjs.com/package/@prplkane/agentlink/v/0.3.0-beta.2)
  publicly under the `beta` tag and created the matching
  [GitHub prerelease](https://github.com/prplkane/agentlink/releases/tag/v0.3.0-beta.2).
  The registry archive exactly matches the tested archive: 30 files, 54,537
  compressed bytes and 179,083 unpacked bytes, with zero runtime dependencies.
- Archive SHA-256:
  `c3dceb4b4f9809cd9f415e2b1a7af3a7d63a78c0ad1b83b037ebc5b4f7cc5355`.
  Registry SHA-512 integrity also matches the candidate receipt.
- Gitleaks found no secrets in the outgoing history or the flat, complete
  30-file package. The initial scan beneath `node_modules` skipped that directory;
  it is not used as evidence. The corrected package scan covered 179,083 bytes.

### Installed verification and Roundtable follow-up

- Installed the registry beta globally and verified `agentlink --version` returns
  `0.3.0-beta.2`. All 30 installed files match the published archive. All four
  Windows storage regressions pass against the actual installed package.
- All five offline Roundtable integration checks pass with installed Roundtable
  `0.6.6` and AgentLink beta.2 using Roundtable's documented
  `ROUNDTABLE_AGENTLINK_CLI` override. They cover a complete review and chairman,
  shared bridge update, Stop/lease cleanup and usage caps, through a shell-free
  launcher. These are fake-agent checks, not renewed live vendor qualification.
- A first run exposed the whole global executable directory to startup discovery.
  A vendor startup probe then held a synthetic database file open: the behavioral
  subtests passed, but fixture cleanup failed. The corrected harness supplies only
  the explicit AgentLink CLI with an empty search path; the complete run passes.
  No model request was made. One synthetic fixture remains outside the repository
  after automatic approval review blocked its cleanup.
- The installed Roundtable adapter loses Windows search-path case insensitivity
  after copying `process.env` into an ordinary object. An inherited `Path` key
  therefore produces `ENOENT` during AgentLink discovery. The explicit override
  above works; normal discovery was separately verified in the isolated candidate
  prefix with an uppercase `PATH`.
- A separate Roundtable PR resolves the key case-insensitively on Windows while
  preserving Node's duplicate-key ordering and POSIX behavior. Both reproductions
  fail before the fix. Afterward, 57 focused tests pass, and full local Windows
  Node 22 and 24 suites each pass 422 tests with one POSIX-only skip. All five
  cross-project checks also pass with mixed-case `Path` and no override.
- That Roundtable patch is not merged, published or installed. Its hosted jobs
  could not start because of an account billing/spending restriction. Local
  results do not replace those pending hosted checks. No dependency or feature
  was added to AgentLink to handle this application-owned issue.

### Remaining release action

The `beta` tag points to `0.3.0-beta.2`; the existing `latest` tag still points to
`0.3.0-beta.1`. Explicit version and `@beta` installations receive the fix.
Changing the default tag requires a separate npm security-key confirmation.
CLI authentication attempts failed; the signed-in package Settings page also
requires authentication. The maintainer handoff is pending. No registry security
setting was weakened. Update this receipt after verifying the changed tag.
