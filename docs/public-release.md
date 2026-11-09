# Public release readiness — 2026-11-09

## Decision

**GO for the published 0.3.0-beta.1; the original audit conditions are complete.**
No embedded credential, private key, private personal record, personal
home path or personal email was found in the reviewed source and reachable Git
history. The source security audit found no reportable vulnerability under the
documented local, same-user trust model. This is evidence from a bounded review,
not a claim that every defect or provider risk has been eliminated.

The audit found and fixed a Windows installation-retention bug and corrected
packaging/documentation defects. The publication conditions were the public-document
policy, release identity, and release-time repository setup below.
This document records the pre-publication audit. The maintainer subsequently
authorized a public beta; [AL-005](work/tasks/AL-005-public-beta.md) records the
release identity, platform checks, publication and Roundtable adoption.

## Scope and evidence

The review began at `c087f82` plus the local AL-003 changes and AL-004 work record.
The independent security baseline fully reviewed 69 current source, test, example,
configuration and documentation files. An independent architecture pass and a
focused installation review checked the actual trust boundaries. The parent
verified the material consumers and tested the Windows retention edge case.
The sealed security scan describes that pre-fix snapshot; the small subsequent
runtime patch was separately reviewed and tested. Raw reports stay outside Git.

The privacy gate covered the current candidate, staged changes, all three reachable
commits and 90 unique historical blobs, Git author/committer metadata, remote refs,
hosted issue/PR/release/artifact inventories, and the sole hosted run's log.
Remote refs contain only `main`; there are no issues, PRs, releases or uploaded
Actions artifacts. The hosted run is a successful Dependabot update job, **not**
the offline test matrix. Commit identities use a public handle and GitHub noreply
addresses. Public handles, project provenance, source commit IDs and synthetic
test identifiers remain intentional public-facing metadata, not anonymous data.

| Check | Actual result |
|---|---|
| Gitleaks: reachable history, staged diff and hosted log | No leaks found |
| Gitleaks: whole local directory | Two alerts, both reviewed installation-identity hashes in ignored benchmark JSON; no credentials, no suppression added |
| PII/content review | No private personal content found; apparent home-path matches were Qwen documentation URLs; private-record path match was an ignore rule |
| Standard source security audit | Complete for the selected current source, zero reportable vulnerabilities |
| Semgrep | 79 JavaScript/Actions rules on 25 targets, zero findings/parse errors; final retention patch separately passed 68 JavaScript rules on both changed runtime files |
| Trivy | Zero reported findings; secret scanning ran, but no dependency lockfile or supported infrastructure target was found |
| Safe Chain | Not installed; optional check skipped |
| AgentLink full offline suite after retention fix | 97 passed, zero failures/skips; Python wheel/venv fixture included |
| Installed-package smoke | Version/help/config/doctor and independent ACP initialization passed; all 19 installed source modules matched the workspace |
| Installed AgentLink + installed Roundtable | Five offline integration checks passed: complete review, central update, cancellation, leases and unknown-usage caps |
| Final AgentLink package candidate | 29 files, 54,180 compressed bytes, 178,071 unpacked bytes; zero runtime npm dependencies |

The package contains the license, notice and retained MIT attribution. It excludes
work records, private configuration, benchmark stores, logs and scan artifacts.
All local links in the packaged Markdown resolve within the package; development
links point to the source repository. AgentLink does not redistribute the selected
vendor bridges in its own tarball. Those packages retain their own dependencies,
licenses, authentication and terms.

## Fixes made during this audit

1. **Windows external path casing.** An external profile pointing into a managed
   installation with an uppercase installation key initialized successfully, but
   reference detection returned nothing and pruning deleted the installation.
   Windows keys are now normalized and pruning reuses the runtime's existing
   reference resolver. The new regression failed before the fix and passes after
   it, covering saved-profile retention, acquired leases and final cleanup.
2. **Missing packaged documentation.** Include the referenced ACP qualification
   report and use repository URLs for development documents excluded from the
   package. Installed Markdown links were checked after packaging.
3. **Overbroad guarantees.** README now states that managed startup writes leases
   and an explicitly chosen home can be inside a repository. Architecture wording
   distinguishes AgentLink's immutable-install convention from the OS user's
   authority to change files. No new runtime feature or dependency was added.

## Is the niche still useful?

Yes, as a narrowly scoped local utility for people and application authors sharing
agent installations and exact launch profiles across multiple ACP clients. It is
not a novel protocol or an empty market. The following comparison is based on the
projects' current documentation, not a benchmark of their implementations.

| Existing option | Overlap and implication |
|---|---|
| [ACP Registry](https://agentclientprotocol.com/get-started/registry) | Already provides curated agent discovery/distribution metadata. AgentLink should consume its individual manifest format, not maintain a competing catalogue. |
| [Zed](https://zed.dev/docs/ai/external-agents) and [JetBrains](https://www.jetbrains.com/help/ai-assistant/acp.html) | Already install agents from the registry and support custom launches. A user staying inside one editor may need no extra manager. |
| [acpr](https://github.com/agentclientprotocol/acpr) | Already launches registry agents through npm/Python runners or cached binaries. AgentLink's opportunity is explicit pinned management and reusable local profiles, not merely launching ACP. |
| [acp-agent](https://github.com/trajs-ai/acp-agent) | Direct overlap in discovery, installation, launch, cache and updates; it also offers HTTP/WebSocket serving and daemon-managed servers. Its stdio mode does not require a daemon. AgentLink must earn use through its small local scope, shared profiles and tested lifecycle behavior. |

The concrete value demonstrated here is that Roundtable uses stable profile names
while a central bridge update changes the next connection and existing sessions
retain their installation. Another useful case is a custom or internal ACP command
that is not in a registry. Zero npm runtime dependencies is a maintenance benefit;
Node and the chosen bridges still have their own footprint. These observations
support a utility niche, not a claim of market demand or a defensible commercial
advantage. Validate a second real client and feedback from a few users before
adding features. Keep effort, budgets, model catalogues, conversations and vendor
fallback in the client.

## Publication conditions and order

The maintainer authorized completion of these conditions in AL-005. The scoped
beta identity, exact document policy and public repository protections are now
configured. The six-platform fixture matrix passed; its only skips are four
Windows-specific checks on Linux/macOS. The items below preserve the audit's
original release sequence; AL-005 contains the current publication receipt.

1. **Resolve the public-document policy before changing visibility.** The existing
   global Git privacy hook says internal documents stay out of a public tree; its
   private-repository exception is currently enabled. Three tracked files match
   its public-tree rules: `docs/process/review-checklist.md`,
   `docs/process/source-document-review.md`, and
   `docs/vendor-review-2026-11-04.md`. Their reviewed content is sanitized engineering
   guidance/research, but the provenance review also exposes source-project names
   and document structure. Make an explicit public-content decision for these
   exact files and reconcile the guard narrowly. The maintainer's release instruction
   authorizes retaining these audited documents. The local guard now supports exact
   approved document paths while retaining its content and tool-configuration checks;
   this repository disables the broad private exception. Do not carry that exception
   into publication as evidence of a passed public gate. If excluding them, address
   their reachable history and references as well as the current tree.
2. **Prepare one concrete release identity.** The candidate is still
   `@local/agentlink@0.2.1` with `private: true`; the repository checker deliberately
   requires that flag. Recommend `@prplkane/agentlink` and a new beta version. npm's
   public registry returned 404 for that scoped name on the audit date, which does
   not reserve it or verify publishing authority. `agent-link` already exists and
   must not be assumed available. Align metadata, source version, install examples,
   publication policy and the changelog in the release PR; then inspect/install
   that exact tarball. The current artifact is a qualification candidate.
3. **Review and merge the prepared changes, then expose the audited repository.**
   Preserve Apache-2.0, NOTICE and third-party attribution. Read back visibility,
   branch protection, private vulnerability reporting, secret scanning and push
   protection after the change, enabling available protections with the user's
   publication authorization. Current main is unprotected; workflow tokens are
   read-only and cannot approve PRs. Existing Actions commits were verified to
   exist in their upstream repositories. Keep the owner's manual-test trigger
   preference unless they change it.
4. **Qualify the release claims.** Windows/Node 24 and the stated live provider
   scenarios are qualified. Run the configured Windows/Linux/macOS Node 22/24
   fixture matrix before claiming that broader matrix is validated, or clearly
   mark an initial beta as Windows-qualified with other platforms unqualified.
   No hosted test dispatch, paid compute or new live vendor call was made here.
5. **Publish AgentLink first, then adopt the released artifact in Roundtable.**
   Keep ACP optional and the direct adapters available. Verify the released
   AgentLink through the five integration checks, then review/release Roundtable's
   adapter and session-binding fix. The current installed Roundtable remains
   unchanged. Effort display/selection and per-profile accounting are Roundtable
   follow-ups, not prerequisites for expanding AgentLink.

## Remaining limits

AgentLink is not a sandbox. Selected executables and installation hooks run with
the user's permissions; explicit environment/argument settings and diagnostics
can contain sensitive values. Native checksums are verified when supplied and
do not independently establish publisher trust. External managed-store reference
tracking recognizes absolute paths, not arbitrary symlink aliases or embedded
path arguments; use managed bridge references for those cases.

Windows descendants orphaned before their parent exits and manual stale-lock
recovery remain documented limitations. Live cancellation, permission challenges,
large-output behavior, live central updates, Claude/agy chairman roles and another
real editor client remain unqualified. The prior successful low-effort Codex
chairman run and provider results are in [ACP qualification](acp-qualification.md).
None of these unrun checks is represented as passing.
