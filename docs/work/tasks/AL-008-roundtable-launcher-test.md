# AL-008. Verify Roundtable discovery of the installed launcher

Status: Ready for review
Owner: Codex
Started: 2026-11-18

## Scope and acceptance

Extend `scripts/test-roundtable.mjs` to exercise a Roundtable ACP seat through
an offline npm installation in a temporary prefix. On Windows the seat must
find the launcher through mixed-case `Path`. Use a synthetic profile, omit
`ROUNDTABLE_AGENTLINK_CLI`, and verify the reply from the selected fake bridge.
Keep the existing full-review coverage through the source launcher.

Share the npm test helper in `test/support.mjs` and describe the check in
`docs/laptop-testing.md`. Run the cross-project check against Roundtable
before and after its launcher fix, both projects' full suites, and AgentLink's
repository check.

## Verification

- Tested the AgentLink changes on `48b4068` with Windows and Node 24.19.0.
- With Roundtable `55ac6f7`, all four source-launcher cases passed. The new
  installed-launcher case failed with `ENOENT` in Roundtable's ACP adapter.
- With the existing Roundtable fix `afa7fdf`, the cross-project script passed
  all six tests. The installed launcher returned the selected profile's stance.
- AgentLink's `npm test` passed all 101 tests. Roundtable's `npm test` passed
  422 with one POSIX permissions test skipped. AgentLink's repository check passed.
- Linux and macOS were not exercised in this run.
