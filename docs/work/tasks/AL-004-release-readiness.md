# AL-004: ACP integration release readiness

Status: Ready for review
Owner: Codex
Started: 2026-11-09

## Outcome

Audit whether AgentLink can be made public, including source/history privacy,
security, packaging and its current ACP niche. The user wants a go/no-go before
publication, followed by Roundtable adoption. Keep AgentLink lightweight; no
publication or repository visibility change is part of this audit.

## Scope

Inspect package contents, perform isolated offline package installation checks,
run the available local privacy/security tools, and record release prerequisites.
Expected repository edits: this record, a sanitized release-readiness report,
README/package documentation fixes, and a confirmed Windows reference-retention
fix in `src/runtime.mjs`, `src/bridges.mjs` and `test/bridges.test.mjs`, with behavior
documentation and changelog updates.
No new ACP features, global installation, repository visibility change, push,
merge or registry publication is assumed by this preparation step.

## Acceptance

- Package contents include their required runtime files and intended user docs.
- Installed package launchers work in a synthetic temporary environment.
- Local scans report their actual findings and coverage gaps.
- Distinguish a prepared candidate from a published release and name the next step.

## Verification plan

Inspect `npm pack --dry-run --json --offline --ignore-scripts` for both projects,
then install local tarballs into temporary prefixes and test their launchers with
fake ACP agents. Use Gitleaks, Semgrep and Trivy where installed; keep artifacts
outside both repositories. Run repository checks for any packaging/doc changes.

## Checkpoints and decisions

- AL-003's live rerun reached a ready verdict with a low-effort Codex chairman.
- Current candidates are AgentLink 0.2.1 and Roundtable 0.6.5, with local staged
  changes. Versions have not yet been bumped for release.
- Gitleaks, Semgrep and Trivy are available. Safe Chain is unavailable; its optional
  check is skipped. The planned package installation uses only our local artifacts.
- Dry-run contents: AgentLink 28 files, 50,135 packed bytes; Roundtable 71 files,
  315,942 packed bytes. No runtime dependencies or private stores are bundled.
- Public-readiness review supersedes the earlier scope question. Git history,
  current source and hosted metadata are inspected without publishing them.
- Standard source security audit completed with no reportable vulnerabilities.
  Independent source review and focused installation review are distinct from
  the local scanner/privacy gate. The sealed scan describes the pre-fix snapshot.
- A synthetic Windows reproduction confirmed that an external path containing
  an uppercase installation key initializes successfully but is not recognized
  by reference tracking; pruning then deletes its still-referenced installation.
  Normalize key case on Windows and share the existing reference resolver between
  startup and pruning. Test saved-profile retention, live leases and final removal.

## Final receipt

Outcome: **conditional GO for a Windows-qualified public beta**, with publication
conditions recorded in [public release readiness](../../public-release.md).
The audit is complete; publication is not performed or implied. The user asked for
the decision before publishing AgentLink and then adopting it in Roundtable.

Tested revision/diff: base `c087f82` plus AL-003 and this local retention fix.
No release version bump. The source security scan is sealed at its pre-fix
snapshot; the subsequent two-file runtime patch received source/diff review,
focused static checks and the verification below. No reportable source security
vulnerability was found. The Windows case issue is a confirmed reliability defect,
now fixed, rather than a crossing of the documented same-user security boundary.

Changes: normalize Windows installation keys in the existing runtime reference
resolver, reuse it for pruning, add saved-reference/live-lease/final-prune coverage,
correct README/storage claims, include the qualification document in the package,
and point source-only development links to the repository. Zero new runtime
dependencies, protocol features, orchestration or global configuration changes.

Actual verification on Windows / Node 24.19.0:

- The new path-case regression failed before the fix. All three focused external
  reference/lease checks passed afterward.
- Final `npm test`: 97 passed, zero failures, skips or cancellations (41.59 s),
  including the offline Python installation fixture.
- Both local tarballs installed offline into an isolated temporary npm prefix,
  with lifecycle scripts disabled. Installed AgentLink version/help/config/doctor
  and the independent gateway initialization example passed. All 19 installed
  source modules match the candidate; packaged Markdown links resolve.
- The existing five-check Roundtable integration harness passed with imports and
  launch paths redirected to both installed packages. Only its fake peer came
  from the checkout. Full reviews, shared updates, cancellation, lease cleanup and
  unknown-usage caps passed; no live vendor or installed user profile was used.
- AgentLink package: 29 files, 54,180 compressed / 178,071 unpacked bytes.
  SHA-256: `541546a17571332660f2c647efc1b7c94325454b6f8aa3e4c12a0618e12bcabe`.
- Repository checks passed for 70 staged/tracked files; whitespace checks passed.
- Gitleaks found no secrets in the three reachable commits, staged changes or
  sole hosted Dependabot log. Its full-directory alerts were two ignored benchmark
  installation hashes, verified against the identity-hash implementation.
- Privacy review covered current files, 90 historical blobs, commit metadata,
  remote refs and hosted inventories. No private personal data was found. Public
  handles, source-project provenance and synthetic identifiers are disclosed in
  the readiness report rather than described as anonymous.
- Semgrep's broad scan: 79 rules / 25 targets, no findings or parse errors. The
  final runtime patch: 68 rules / two files, no findings. Trivy reported none but
  had no dependency-lockfile or supported infrastructure targets. Safe Chain was
  absent, so its optional check is skipped.

Limits: Linux/macOS and Node 22 remain unexecuted; the only hosted run is
Dependabot, not the test matrix. Live qualification remains AL-003's separate
evidence. Arbitrary vendor/package code, Windows orphan containment, and external
symlink/embedded-argument ownership remain outside the stated guarantees.

Release conditions: reconcile the existing public-tree guard's three engineering
document matches, select a public package identity/new version and update its
publication policy, then prepare the release PR and public repository protections.
The npm registry already contains `agent-link`; the suggested scoped name returned
404 but is not reserved. Keep manual CI unless the owner changes that preference.
Publish AgentLink before a Roundtable release that adopts its released artifact.
The original Roundtable checkout and installed board remain unchanged; no push,
merge, registry release or repository visibility change occurred.
