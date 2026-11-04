# Offline validation — AgentLink 0.2.0

Executed on November 4, 2026, on Windows x64 with Node.js v24.19.0.

## Results

- `node --test test/*.test.mjs`: **81 passed, 0 failed, 0 skipped**.
  Final run: 28.19 seconds.
- Offline tarball installation into a clean, temporary npm prefix: passed.
- Installed package version/help, local profile creation and exported native
  launch configuration: passed.
- The independent ACP example shipped inside the installed package initialized
  a fixture agent through the installed gateway: passed.
- Temporary test installations and user stores were removed after testing.

The suite used local agents, locally packed npm packages, a local Python wheel,
and raw/ZIP/tar.gz artifacts. Python/venv/pip coverage ran successfully on this
host. No vendor account, live model request or real-agent installation was used.

## Covered behavior

- Standard ACP v1/v2 negotiation, capabilities, unknown extensions, sessions,
  streaming, permission replies, reverse filesystem calls and cancellation.
- Concurrent projects and distinct profiles; isolated connection processes.
- Terminal authentication relaunch, including environment-only authentication.
- Complete final response delivery when an exiting bridge has a slow reader.
- Shared bridge installation, central version updates, failed-update rollback,
  active-session leases, pruning and externally managed executables.
- Bounded help discovery and custom help commands, local profile persistence,
  initialization failures, malformed streams and process cleanup.
- Artifact identity/checksum verification and bounded archive extraction.

## Package footprint

| Measurement | Result |
|---|---:|
| Artifact | `local-agentlink-0.2.0.tgz` |
| Compressed package | 37,546 bytes |
| Unpacked package contents | 127,896 bytes |
| Included files | 19 |
| npm runtime dependencies | 0 |

These figures cover AgentLink, its examples and bundled documentation. Node.js
and selected third-party bridge dependencies are separate.

SHA-256:

~~~text
458baa244c1175774ce7dcd8e40e25bf79316bc2b2713cce1d7cb5ad9af93e3c
~~~

The package was created with `npm pack --json --offline --ignore-scripts`.
Generated evidence is in `offline-test-results.log`,
`package-metadata.json` and `package-smoke-results.json` at the checkout root.

## Remaining live checks

Use [the laptop guide](laptop-testing.md) to check actual vendor sign-in, tasks,
permissions, updates and client compatibility. Linux/macOS and Node.js 22 have
not been executed in this pass. Windows containment of descendants already
orphaned by an exited bridge remains a documented limitation.

Roundtable's direct CLI adapters were not changed; connecting it requires its
one-time standard ACP client integration.
