# AgentLink 0.2.1 — fixes and offline validation

Executed November 5, 2026, on Windows x64, Node.js v24.19.0.

## Changes

- Failed profile validation or saving no longer publishes a replacement shared
  bridge. Combined changes prepare the installation first and publish under
  the lease lock; publication errors roll back the profile.
- Explicit cancellation interrupts a blocked final output drain and releases
  the connection lease. Normal slow readers still receive the complete reply.
- Archive byte/entry accounting happens before ZIP decompression, including
  root entries. Data-bearing directories and regular files named as the root
  are rejected. HTTPS download redirects are validated before every hop.
- Terminal-auth argument edits preserve other JSON bytes, including large
  numeric IDs and extension values.
- ACP startup imports only runtime modules. External profiles outside the
  managed store avoid lease locks/writes. Managed leases remain atomic but
  skip a disk durability flush because they only protect a living process.
- External profiles pointing into managed installations now retain leases
  while running, even if their profile and bridge records are removed.
- `agentlink doctor` performs read-only checks of launch files, installation
  metadata and locks. It does not start agents or clear locks.
- Deep Windows Python interpreter paths fail before invoking the installer,
  with `PYTHON_PATH_TOO_LONG` and instructions to choose a shorter store.
- The legacy interactive example strips terminal control sequences from agent
  output and displays permission labels on one line.

## Verification

`node --test test/*.test.mjs`: **92 passed, 0 failed, 0 skipped**, 30.25 seconds.
This includes a real local Python wheel/venv installation, local npm packages,
native archive fixtures, fault injection for saves/publication, blocked output,
and the existing ACP v1/v2, permission, cancellation, discovery and lifecycle
tests. No live agent account or model call was used.

The packaged release was installed into an isolated npm prefix using offline
mode. Version/help/doctor, profile creation, the exported installed CLI path,
ACP v2 initialization/session/prompt, and the shipped independent ACP example
passed. Every packaged source module matched the workspace.

The included GitHub Actions matrix targets Windows, Linux and macOS on Node
22/24 with Python 3.13. It has not run here. Setup actions are pinned to
verified upstream commits; their configuration follows the official
[Node setup](https://github.com/actions/setup-node) and
[Python setup](https://github.com/actions/setup-python) documentation.

## Startup measurement

The baseline is a source snapshot of 0.2.0 taken before these edits. Both
versions launched the same local fixture and shared the same profile store.
The timer ran from process spawn through the complete initialize response.
One warm-up per case was excluded; nine samples per case rotated execution
order. This measures warmed filesystem caches, not a cold machine boot.

| Launch | 0.2.0 median | 0.2.1 median | Reduction |
|---|---:|---:|---:|
| External profile | 125.21 ms | 110.29 ms | 14.92 ms / 11.9% |
| Managed profile | 130.87 ms | 115.73 ms | 15.14 ms / 11.6% |
| Direct fixture, no gateway | 47.13 ms | 47.13 ms | Reference only |

The remaining gateway overhead was approximately 63 ms for external and
69 ms for managed profiles. These are local fixture measurements, not vendor
startup guarantees. AgentLink still has a separate Node process per connection.
Clients can reuse an ACP connection for multiple tasks/sessions rather than
starting a fresh process for each prompt.

Raw samples and the comparison script are in `.benchmarks/startup-results.json`
and `.benchmarks/startup.mjs`. Full test output is in
`.benchmarks/final-tests.log`; package metadata and smoke results are alongside
it. These local evidence files are excluded from the package and Git.

## Package

| Measurement | Result |
|---|---:|
| Artifact | `local-agentlink-0.2.1.tgz` |
| Compressed | 42,893 bytes |
| Unpacked | 145,761 bytes |
| Runtime npm dependencies | 0 |

Node.js, configured bridges and their dependencies are separate.

SHA-256: `a0d9d329048b58b22d5c7ca89e31359f99fad9883400a0e5945afb50bc9f64c7`

## Remaining boundaries

- Real vendor authentication, tasks and editor/client compatibility require
  the [laptop pass](laptop-testing.md).
- Linux/macOS and Node 22 have not been executed locally in this pass.
- Very deep Windows Python paths require a shorter AgentLink home or an
  externally installed bridge; this release does not virtualize those paths.
- Windows descendants orphaned before their parent exits cannot be guaranteed
  to be contained without native Job Objects. Normal live-tree cleanup is tested.
- Multi-file publication rollback covers ordinary errors, not sudden machine
  loss. An interrupted operation can leave a lock for deliberate recovery.
- Roundtable still needs its one-time standard ACP client integration.
