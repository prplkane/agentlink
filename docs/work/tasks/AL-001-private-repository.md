# AL-001: Establish the private AgentLink repository

Status: Done
Owner: @codex
Requested by: @prplkane
Started: 2026-11-05
Completed: 2026-11-05

## Outcome

Create a private GitHub repository for AgentLink, apply a license, configure
repository maintenance, and adapt reusable engineering guidance from Roundtable
and Career Hub. Document selected and excluded source documents by project.

## Scope

Repository metadata, license/notices, contribution and agent guidance, a small
engineering ledger, document review, repository checks, and hosted settings.
Runtime behavior and both source projects are outside this change.

Expected files: root documentation/metadata, `.github/`, `scripts/`,
`docs/process/`, `docs/work/`, `docs/licenses/`.

## Decisions

- Keep standard ACP, centralized bridge management and zero runtime dependencies.
- Use one canonical AGENTS.md and plain Markdown/Git work records.
- Adapt the source projects' engineering practices; omit their product commands,
  engines, private data, task history and developer-tool dependencies.
- Preserve the existing global Git privacy hook. Its private-repository opt-in
  permits engineering documents. Vendor-specific local configuration remains local.
- Owner confirmed Apache-2.0 and manual hosted tests; local checks are required.
- Main branch rules are unavailable on the current private-repository plan
  (GitHub HTTP 403). Preserve privacy and document the enforcement gap.

## Verification plan

- Inspect staged/tracked paths and run local repository/document checks.
- Run installed Semgrep, Gitleaks and Trivy tools; triage results and report gaps.
- Validate license/package inclusion and run the offline fixture suite.
- Confirm remote visibility and actual settings after creation and push.
- Record unsupported hosted features without claiming they are enabled.

## Checkpoints

- Source review completed against Roundtable `48dadae` and Career Hub `a9290de`.
- 64 staged files passed repository/links/package checks and privacy inspection.
- 92 offline tests passed, with no failures or skips.
- Gitleaks staged scan and Semgrep JavaScript/Actions scan reported no findings.
  Trivy reported no findings but had no dependency or supported IaC targets.
- Private repository created; merge/Actions/Dependabot settings were applied
  and read back. Hosted tests were not dispatched.
- Bootstrap `ed2734d65c77a8411fb4af5f56bedce5bbc5f45e` passed the existing
  privacy hook, passed an outgoing-history Gitleaks scan and was pushed to main.
- Remote head, private visibility, Apache-2.0 recognition and the active
  manual workflow were verified. The workflow has zero test runs.
- Repository policy rejected a deliberately tracked synthetic environment
  file in a disposable fixture. The actual repository remains clean.
- Roundtable and Career Hub were left unchanged.

## Final receipt

The requested repository, license, document review, adapted guidance and work
ledger are available at [prplkane/agentlink](https://github.com/prplkane/agentlink).
Local tests and publication checks passed within the coverage described in
[repository setup](../../process/repository-setup.md).

Account limitation: main has no enforced branch protection; GitHub requires
Pro for that feature on this private repository. Repository-level Secret
Protection/CodeQL is not enabled. Manual hosted and real-agent tests remain
explicit future qualification, not uncompleted setup work.
