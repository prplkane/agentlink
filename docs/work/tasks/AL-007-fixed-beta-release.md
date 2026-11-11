# AL-007: Publish the fixed AgentLink beta

Status: In progress
Owner: Codex, authorized by the maintainer's merge/publication instruction
Started: 2026-11-11

## Outcome and scope

Publish `@prplkane/agentlink@0.3.0-beta.2` with the Windows metadata replacement
fix from PR 3, update the installed AgentLink package, and verify the existing
Roundtable installation through standard ACP. Retain zero runtime dependencies
and the current product boundary.

Expected files: package/version metadata, README, laptop testing instructions,
changelog and AL-006/AL-007 work records. Runtime behavior is the already tested
PR 3 fix; no Roundtable source change is planned. Test homes, archives, raw logs
and authentication material stay outside Git.

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
- Preserve installed user profiles. Use fake agents, make no live vendor calls,
  and record actual outcomes and remaining limits.

## Checkpoints and decisions

- PR 3 was already merged when this instruction was received. Merge `a004648`
  has the exact tree of tested head `e980235`; all six platform jobs passed.
- The installed packages are AgentLink `0.3.0-beta.1` and Roundtable `0.6.6`.
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

Pending release qualification, publication and installed-package verification.
