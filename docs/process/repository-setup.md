# Private repository setup

Repository: [prplkane/agentlink](https://github.com/prplkane/agentlink).
Created and settings verified on November 5, 2026, using the authenticated
owner account. The owner selected Apache-2.0 and manual hosted tests.

## Verified configuration

| Setting | Verified state |
|---|---|
| Visibility / default branch | Private / `main` |
| Issues | Enabled |
| Wiki / projects / discussions | Disabled |
| Merge methods | Squash only; automatic merging disabled |
| Branch cleanup | Delete merged branches enabled |
| Actions token | Read-only; cannot approve pull requests |
| Allowed actions | GitHub-owned actions only; full SHA pinning required |
| Test triggers | `workflow_dispatch` only; no push/PR/scheduled test trigger |
| Test matrix | Windows/Linux/macOS, Node 22/24, Python 3.13 |
| Dependabot alerts | Enabled; verified with HTTP 204 |
| Dependabot security updates | Enabled and not paused |
| Action version updates | Monthly grouped PRs, at most three open |
| Ownership / PR guidance | CODEOWNERS names `@prplkane`; PR template included |

No hosted test run was started. Local verification is required before handoff.
The workflow is ready for an explicit manual run when compute is available.
Dependabot updates propose changes; they do not auto-merge them.

## Account limits

GitHub refused the branch-rules API with HTTP 403 and:
`Upgrade to GitHub Pro or make this repository public to enable this feature.`
Main therefore has **no enforced branch protection or required review rule**.
CODEOWNERS and contribution instructions document the desired workflow, but
are not enforcement. Private visibility was preserved and no upgrade was made.

Repository-level Secret Protection and Code Security/CodeQL were not enabled.
The personal private repository exposes no `security_and_analysis` settings.
Local secret/security checks remain the current gate; no paid product was enabled.

The existing global Git privacy hook is retained. This private development
repository uses its documented `leakguard.internal=true` opt-in for sanitized
engineering records. Tool-local files such as `CLAUDE.md` remain ignored;
all agents can be directed to the shared [AGENTS.md](../../AGENTS.md).

## Local publication receipt

- Staged tree and local links/package policy: passed, 64 tracked files.
- Negative policy fixture: a tracked synthetic environment file was rejected.
- Offline fixture suite: 92 passed, 0 failed, 0 skipped (36.24 seconds).
- Gitleaks 8.30.1 staged scan: no leaks.
- Semgrep 1.172.0: 79 JavaScript/GitHub Actions rules, 24 targets, no findings
  or parse errors. Its default ignore patterns exclude fixture/test targets.
  `--config auto` required telemetry, so explicit `p/javascript` and
  `p/github-actions` rules were used with metrics disabled.
- Trivy 0.73.0 filesystem scan: no reported secrets/findings. It found no
  dependency lockfiles or supported infrastructure configuration targets;
  this is not evidence of a dependency-vulnerability or Actions configuration scan.
- Safe Chain: unavailable, recorded as a skipped optional check. No project
  dependencies were installed.
- Package dry-run: license and attribution included; work records, agent
  instructions, scripts and scratch data excluded from the runtime package.
- Existing global privacy hook retained; initial commit/push receipt is in
  [AL-001](../work/tasks/AL-001-private-repository.md).
- Outgoing Git history passed Gitleaks before the first push. GitHub's main
  head matched bootstrap `ed2734d65c77a8411fb4af5f56bedce5bbc5f45e`.
- GitHub recognized Apache-2.0 and confirmed private visibility after the push.
  The registered test workflow is active with zero runs.

Verdict: **GO for this initial private publication**, with the documented
scanner coverage and hosted-plan limits. This receipt is not permission for
a later public release or evidence of live-agent compatibility.

Raw scan/test artifacts remain outside the repository. Generated tarballs,
scratch installations, credentials and logs are not tracked or uploaded.
