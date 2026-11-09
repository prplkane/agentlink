# AL-005 — Public beta and Roundtable adoption

Status: Done
Owner: Codex, authorized by the maintainer's public-beta release instruction

## Outcome and scope

Release `@prplkane/agentlink@0.3.0-beta.1` publicly, qualify Windows, Linux and
macOS on Node 22/24, then adopt the registry artifact in Roundtable. Preserve
standard ACP, zero runtime dependencies and the existing product boundary.

Expected files: package metadata, version, release/setup documentation, repository
checker, this record, and any platform regression exposed by the matrix.
Roundtable changes are owned in its existing ACP integration checkout: launcher
resolution, installation documentation, adapter regressions and release metadata.
The sanitized AL-003/AL-004 candidate is part of this release.

## Acceptance and verification

- Reconcile the privacy guard with exactly the three audited public documents;
  disable the private-repository exception and retain secret/tool-config checks.
- Verify the final staged tree, history, package contents and isolated install.
- Pass the configured six-job offline platform matrix without vendor calls.
- Publish the tested beta artifact, verify registry integrity and beta tag, and
  enable available public repository protections.
- Test Roundtable against the released AgentLink package, publish the integration
  through the normal public source workflow, and update the installed board.
- Keep raw logs, temporary homes, credentials and scan reports outside Git.

## Progress

- The maintainer explicitly authorized publication and Roundtable adoption.
- At release preparation, the scoped package did not exist and Roundtable's
  latest registry release was 0.6.4. Both new versions are now public.
- Earlier qualification and privacy evidence are in AL-003 and AL-004. This task
  completes their release conditions; it does not repeat unmodified live calls.

## Receipt

- Release commit `2d31d6a` passed the [six-job hosted matrix](https://github.com/prplkane/agentlink/actions/runs/42585475590):
  Windows Node 22/24 each passed 97 tests; Linux/macOS Node 22/24 each passed 93
  with exactly four Windows-only skips. No failures or Python fixture skips.
- The scoped beta tarball installed offline. CLI version/help/config/doctor,
  independent standard ACP v2 initialization, source equality and packaged
  Markdown links passed. The package has 29 files and no runtime dependencies.
- The public-document guard passed six synthetic checks: each of the three exact
  approved paths is allowed; another internal document, tool configuration and
  a synthetic secret in an approved document are still rejected. This repository
  now has `leakguard.internal=false`.
- The staged tree and all four reachable commits passed Gitleaks. Repository
  checks and diff whitespace checks passed. Raw artifacts remain local.
- Roundtable's npm launcher was still keyed to `@local/agentlink`; it now uses
  the released scope, with an executable fixture regression. All 22 focused ACP
  checks passed. Its public export passes the four public-tree/privacy checks.
- GitHub does not evaluate `workflow_dispatch` job checks for required PR status
  ([documented restriction](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#checks-from-some-workflow-jobs-are-not-evaluated)).
  The final source also passed a second manual matrix, but merge enforcement
  correctly remained blocked. Added an opt-in `pull_request: labeled` trigger;
  the maintainer applies `run-offline-tests` for merge qualification. Every label
  event runs the suite without a conditional skipped success. No automatic
  push, PR-open or scheduled compute is introduced.

## Published outcome

- [AgentLink 0.3.0-beta.1](https://www.npmjs.com/package/@prplkane/agentlink/v/0.3.0-beta.1)
  is public. Its registry integrity matches the tested tarball: 29 files,
  54,201 compressed bytes, 178,144 unpacked bytes, no runtime dependencies.
  The `beta` tag resolves to this version; npm also assigned `latest` to this
  first publication. The version and installation instructions explicitly label
  it a beta. No stable version has been released.
- [AgentLink PR 1](https://github.com/prplkane/agentlink/pull/1) merged as `d8c7c4d`.
  Its final [PR matrix](https://github.com/prplkane/agentlink/actions/runs/42586680775)
  passed all six required jobs with the same counts and Windows-only skips above.
  The merged tree matched the tested head. The GitHub release is marked prerelease.
- Public visibility, private vulnerability reporting, secret scanning, push
  protection, Dependabot and the main branch checks were read back. Hosted secret
  and dependency alert lists were empty. Workflow tokens remain read-only.
- [Roundtable 0.6.6](https://www.npmjs.com/package/@prplkane/roundtable/v/0.6.6)
  is public and uses the released npm scope. Its registry integrity matches the
  tested public export: 71 package files, 314,969 compressed bytes, no runtime
  dependencies. [PR 23](https://github.com/prplkane/roundtable/pull/23) merged as
  `5ab7ab3` through its documented maintainer-owned release exception after CI.
  Its branch rules were not changed.
- Platform qualification exposed a repeatable Node 22 MCP idle-stream hang after
  garbage collection. A forced-GC fixture failed before the fix. Roundtable now
  cancels its held reader directly on deadline or caller cancellation and removes
  the listener during cleanup. The original long-wait test and deadlines were
  preserved; no AgentLink runtime feature was added for this client defect.
- Roundtable's [final matrix](https://github.com/prplkane/roundtable/actions/runs/42590202874)
  passed Windows/Linux on Node 22/24. Windows passed 416 with two skips (POSIX
  permissions and the development-only exporter); Linux passed 417 with only the
  development-only exporter skipped. A local Windows/Node 22 full run also passed
  416 with those two skips. Semgrep found zero issues/errors in both changed
  transport modules; public-tree and secret checks passed.
- All five installed-package integration checks passed against registry-installed
  AgentLink and the exact Roundtable release artifact: completed review/chairman,
  central update, cancellation, installation leases and unknown-usage caps.
- Both registry packages are installed globally. Roundtable's normal launcher
  resolved AgentLink through Node and reported `0.3.0-beta.1`. The board restarted
  safely as `0.6.6` with no active reviews. The managed Codex setup was refreshed.

## Remaining limits

An assistant already running the old MCP process must reload its connections or
restart to load the new module; restarting the board alone does not replace that
host process. The CLI and board already use the new release. Profile selection
and vendor sign-in remain local setup. Live qualification has not expanded beyond
the scenarios documented in [AL-003](AL-003-acp-regression-qualification.md).
Raw diagnostic traces, synthetic homes and credentials remain outside Git.
