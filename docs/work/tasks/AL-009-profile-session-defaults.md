# AL-009 Central model and effort selection

Status: Done
Owner: Codex
Started: 2026-11-19

## Scope and acceptance

Add live option inspection and saved model and effort defaults on existing
profiles. Two independent ACP clients must receive the effective selection
before their first prompt. Check effort against the selected model. An
unavailable choice should explain how to recover. Clearing defaults must
restore bridge behavior, and old profiles must keep their transparent path.

Expected files include the management CLI, profile store, probe, ACP runtime
and wire helpers, their offline fixtures and tests, README and architecture.
Verify with synthetic profiles, the full offline suite, the Roundtable
integration and repository checks.

## Implementation and verification

- Added `models PROFILE [--model ID]` and `defaults PROFILE` with independent
  set and clear flags. Inspection uses the real bridge in a temporary session.
  A failed validation preserves the previous saved profile. Clearing both
  choices restores vendor defaults without launching a bridge.
- The gateway reads preferences on each `session/new`. It applies the model
  before validating effort and returns the settings confirmed by the bridge.
  Active sessions keep their choices. The compatibility library also applies
  profile defaults to its v1 session. The two ACP schemas for select values
  are covered by protocol fixtures.
- Added a cross-project regression for the existing Roundtable seat and
  chairman paths. The same review request inherited a centrally selected
  model for both seat turns and the chairman. No Roundtable edits were needed.
- Tested the working changes over `9f50f84` on Windows x64 with Node 24.19.0.
  `npm test` passed 106 tests with zero skips. The cross-project script
  passed six reported tests against Roundtable 0.6.7 with zero skips.
  Repository checks passed. An offline package installation in a temporary
  prefix listed choices, saved a model and effort, and returned both from an
  independent ACP v2 client using the packaged launch configuration.
- Qualification used synthetic homes and fake agents. Live vendor accounts
  and other operating systems were outside this run. The global installation
  and registry were not modified.

The feature merged in [PR 8](https://github.com/prplkane/agentlink/pull/8).
The [release qualification](AL-010-release-profile-defaults.md) records the
subsequent global installation, live provider checks and platform results.
