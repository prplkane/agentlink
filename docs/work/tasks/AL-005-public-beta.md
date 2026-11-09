# AL-005 — Public beta and Roundtable adoption

Status: In progress
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
- npm authentication identifies the intended public owner. The scoped package
  does not yet exist; Roundtable's latest registry release is 0.6.4.
- Earlier qualification and privacy evidence are in AL-003 and AL-004. This task
  completes their release conditions; it does not repeat unmodified live calls.

## Receipt

Pending release preparation and hosted platform results.
