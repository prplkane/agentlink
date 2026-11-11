# Changelog

## Unreleased

- Retry transient Windows file-sharing conflicts during atomic profile and
  bridge metadata replacement, including profile rollback. Persistent failures
  preserve the old file and remain errors. No runtime dependency is added.

## 0.3.0-beta.1 — 2026-11-09

- Prepare the first public beta as `@prplkane/agentlink`, retaining zero runtime
  dependencies and the existing standard ACP boundary.

- Preserve Windows external references and active leases when an installation
  path uses different letter casing; pruning uses the same reference resolver.
- Include live qualification in the package and clarify runtime lease writes,
  custom home placement and source-only development links.

- Fix v2 discovery to use its actual initialization fields and retain v1 downgrade
  metadata. Update the independent check example and protocol fixtures.
- Keep explicit and managed launch arguments during refresh, and retry transient
  Windows probe-directory cleanup failures without masking a completed probe.
- Recognize native Antigravity `agy acp` and record live Roundtable qualification
  for Codex, Claude, agy and an offline small-agent mimic, including remaining limits.

- Add an explicit offline Roundtable integration check using managed fake bridges,
  full reviews through standard ACP, central updates, cancellation and usage limits.
  Document the Roundtable ACP client setup; AgentLink's runtime is unchanged.

- Establish a private repository, Apache-2.0 licensing, contribution guidance
  and a compact cross-agent engineering ledger.
- Adapt reusable working, testing and review practices from Roundtable and
  Career Hub, with a document-by-document selection record.
- Add repository checks and maintenance configuration.

## 0.2.1 — 2026-11-05

- Fix failed profile/bridge publication, blocked-output cancellation and archive
  extraction accounting.
- Reduce connection startup work, preserve terminal-auth JSON values and add
  read-only doctor diagnostics.
- Validate with 92 offline tests on Windows/Node 24 and an installed-package check.

## 0.2.0 — 2026-11-04

- Add the standard ACP gateway, centrally managed bridges, local discovery,
  explicit updates and live-installation leases.
- Retain the original text-only ACP v1 library for compatibility.
