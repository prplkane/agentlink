# AgentLink implementation

AgentLink is one per-user installation that exposes configured agents through
standard ACP. The first release uses on-demand local subprocesses, not a daemon.
An application selects a profile in its launch arguments. It supplies its own
ACP client, so no AgentLink SDK or custom RPC contract is required.

## Runtime path

`ACP client -> agentlink acp PROFILE -> resolved bridge/native ACP executable`

The launcher reads the profile and, for managed profiles, the active shared
bridge record. It creates a lease before starting the bridge. Launch arguments
are arrays; there is no shell interpretation. The caller's working directory
and standard ACP session parameters are preserved.
The ACP command does not import management, installer, archive, discovery or
legacy client modules. External launches outside the managed store need no
lease lock or filesystem writes. External profiles that explicitly point into
the managed store still acquire leases so pruning cannot remove running files.

The wire layer validates newline-delimited UTF-8 JSON-RPC and bounds individual
frames. It preserves messages rather than maintaining a list of supported ACP
methods. Backpressure follows Node streams. It does not initialize or create a
session on the application's behalf, approve tools, retry a prompt, or record
conversation content.

The exception to byte-preserving forwarding is an initialize response containing
terminal authentication methods. Their argv receives an AgentLink marker so a
client's subsequent standard interactive relaunch is recognized even if the
upstream method only supplies environment variables. The launcher strips that
marker and appends the original arguments to the original bridge invocation.
Only the affected argument spans are rewritten. Large numeric IDs, numeric
extensions, unrelated fields and whitespace retain their original JSON bytes.

The connection owns one bridge process. On client EOF it allows a short exit
grace, then stops the process tree where the host supports it. Existing ACP
sessions stay with that process when profiles or installations change.
Normal shutdown drains queued responses even for slow readers. Explicit
termination cancels both pumps and interrupts a blocked output drain, allowing
the connection to release its installation lease.

## Management path

Profiles live in `profiles/NAME.json`. They contain a launch definition and
discovery metadata. A managed profile additionally references a bridge ID; the
saved executable snapshot is not used as its active version pointer.

Bridge records live in `bridges/ID.json`. Each contains a selected version, an
installation key and launch metadata. Installation directories are immutable
after publication and keyed by distribution, exact version, source and platform
(plus Node module ABI for npm packages).

Two bridge IDs using the same installation identity reuse the same files.
Different profiles referencing one bridge ID receive its next central update.
Separate bridge IDs can deliberately pin different versions.

Installations are not activated until the installer finishes, the actual package
identity is checked where available, ACP initialization succeeds, and existing
dependent profile configurations pass initialization. The active record is
replaced atomically. A failed candidate never replaces that pointer.
Combined profile/bridge changes validate discovery options up front and
prepare the installation before publication. Under the lease lock, the profile
is saved and the bridge record is published; a publication error restores the
previous profile (or removes a newly added one). If rollback itself fails, the
command reports `ROLLBACK_FAILED` for manual recovery. This is recovery from
ordinary operation failures, not a power-loss-safe multi-file transaction.
An abrupt process death can leave the publication lock for explicit recovery.

Management mutations are serialized separately from short lease operations.
Installing a bridge therefore does not block established connections or the
startup of already configured agents. Pruning runs under both locks, retains
active installations, externally referenced paths and live leases, and deletes
only checked descendants of the managed installation directory.
Profile and bridge metadata are flushed before publication. A live-process
lease is atomically written without a durability flush: it does not need to
survive a machine restart when its owning process cannot survive either.

No automatic deletion of previous versions occurs during an update. Users can
prune after sessions finish and optionally clear the download cache. External
installations remain user-owned.

## Discovery

Known recipes are shortcuts, not a supported-vendor boundary. An unknown agent
can be configured through bounded help parsing or explicit launch metadata and
saved locally without changing source code.

Default help probes are `--help` and `-h`. Alternative help commands and nested
ACP commands are followed when advertised in command/option rows. An explicit
help argument array handles other conventions. Help is treated as data, never
as executable shell instructions or installation authority.

The probe performs initialization only and recognizes negotiated ACP v1 or v2.
It saves advertised capabilities and authentication metadata. This does not
verify model access, permissions enforcement, or complete task behavior.

## Modules

| File | Responsibility |
|---|---|
| `cli.mjs`, `runtime.mjs` | Small ACP launch entry, saved records and live-process leases |
| `management-cli.mjs`, `doctor.mjs` | Management commands and read-only local diagnostics |
| `gateway.mjs`, `wire.mjs`, `terminal-auth.mjs` | ACP forwarding, framing, backpressure and lossless auth argument edits |
| `profiles.mjs`, `storage.mjs` | User profiles, atomic records and operation locks |
| `bridges.mjs`, `artifacts.mjs` | Selected distributions, shared installations, integrity and bounded extraction |
| `discovery.mjs`, `probe.mjs` | Help/metadata matching and initialization-only checks |
| `process.mjs`, `child-process.mjs` | Executable resolution, bounded probes/installers and shared process cleanup |
| `providers.mjs` | Small documented launch/install recipes |
| `index.mjs` | Management coordination and compatibility library exports |
| `client.mjs` | Original optional ACP v1 text client; not the gateway protocol engine |

## Validation boundaries

Tests run independent ACP callers against fake agents, install locally created
artifacts, and exercise updates and failures without vendor accounts.
Windows is the execution host for this implementation pass. Python fixture
installation is optional on hosts without Python. Linux/macOS and real-agent
behavior still need their own execution results.

Windows process-tree cleanup uses taskkill while the owned bridge is alive.
Native Job Object containment is not implemented, so descendants orphaned by a
previously exited parent are a known limitation. Process ownership is not a
sandbox. Abrupt process death may leave a lock or lease; stale locks produce a
diagnostic, and pruning removes leases whose process no longer exists.
Very deep Python virtual environments can exceed Windows launcher limits.
Installation detects an interpreter path of 260 or more characters before
running venv/pip and requests a shorter store. No path virtualization layer,
extra service or native dependency is added.

Relevant specifications:

- [ACP stdio transport](https://agentclientprotocol.com/protocol/v1/transports)
- [Initialization and capabilities](https://agentclientprotocol.com/protocol/v1/initialization)
- [Terminal authentication](https://agentclientprotocol.com/protocol/v1/authentication)
- [Registry distribution format](https://github.com/agentclientprotocol/registry/blob/main/FORMAT.md)
