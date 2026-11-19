# AL-010 Qualify and publish central profile defaults

Status: Done
Owner: Codex
Started: 2026-11-19

## Scope and acceptance

Install the next beta globally, qualify the installed Roundtable launcher with
Codex, Claude and native Antigravity, and restore temporary preferences. Exercise
model retirement, session isolation, concurrent managed startup and packaging.
Review outgoing content, run the local release gate and platform checks, and
publish the qualified archive under the beta tag. Expected files include
version and release documentation, focused regression tests and the fixes
required by qualification. Keep user profiles and raw responses outside Git.

## Local qualification

- The Windows lease regression failed against the previous lock implementation.
  The fix retries transient sharing errors within the acquisition deadline and
  keeps a persistent access denial visible to the caller.
- Windows x64, Node 24.19.0: 107 offline regression tests passed with zero
  skips. All seven cross-project checks passed with Roundtable 0.6.7,
  including launcher discovery, inherited settings, completion and cancellation.
- The operational test passed 50 batches of eight simultaneous managed
  sessions. All 400 prompts returned the expected model, effort and unique
  marker, and every batch released its leases. Median batch time was 430 ms
  and p95 was 636 ms on this laptop with a synthetic bridge.
- On the installed feature build, Roundtable used its normal global launcher
  and real ACP profiles for three bounded text calls. Each generated the
  requested marker with no tool use. The session response confirmed the
  centrally selected model and low effort for Codex, Claude and native agy.
  Every profile was restored byte-for-byte. Raw text and account settings
  are excluded from this record.
- The release archive contains 33 files and zero runtime npm dependencies.
  Every installed file matched the source and the unpacked candidate.
  After the lock fix, the installed Roundtable adapter again confirmed both
  selected values in a fresh session for each provider, and the three profile
  files again matched their original bytes.
- The local privacy gate passed for the staged source, unpacked archive and
  reachable Git history. Semgrep scanned 30 targets with zero findings or
  scan errors. Trivy reported no findings and identified no language or
  configuration targets for dependency or misconfiguration analysis. Safe
  Chain was unavailable. Platform results and registry integrity belong to
  the release receipt.

## Release receipt

[PR 8](https://github.com/prplkane/agentlink/pull/8) merged at `03edf20`.
Its tree matches the [six-job qualification](https://github.com/prplkane/agentlink/actions/runs/44572995454)
of `a901b6a`. Both Windows jobs passed 107 tests. Each Linux and macOS job
passed 98 tests and skipped nine Windows-only cases. The exact archive was
also installed into an isolated offline prefix. A rejected effort change
preserved both previously saved settings.

The public npm `beta` tag resolved to `0.3.0-beta.3` after publisher
confirmation. The downloaded tarball matched npm's SHA-512 integrity value.
Its SHA-256 matched the qualified local archive and the GitHub release asset
(`5de2eccbe54d1acdb7f1f0dc715a3b62edefd8958659c7a80e006b013c339f98`).
All 33 files in the public package matched the global installation byte for
byte. [npm package](https://www.npmjs.com/package/@prplkane/agentlink/v/0.3.0-beta.3)
· [GitHub prerelease](https://github.com/prplkane/agentlink/releases/tag/v0.3.0-beta.3)
