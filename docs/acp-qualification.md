# ACP and Roundtable qualification — 2026-11-09

The three real providers completed text prompts and two discussion rounds through
AgentLink and Roundtable. The deterministic small-agent mimic did too. The live
Codex chairman initially reached the test's 60-second deadline. The user-requested
rerun with a separate low-effort chairman profile completed successfully in
12.2 seconds, with a ready live verdict. The offline full-review tests also reached
ready chairman verdicts. No additional AgentLink runtime changes were needed.

## Environment and scope

- Windows, Node 24.19.0. AgentLink base `c087f82`, with the AL-003 changes.
- Roundtable's previous ACP integration `b4141d4` was found in its existing Git
  worktree and replayed onto current main `b032625` (0.6.5), producing `7b6d233`
  before the regression patch. The original checkout and running installed 0.6.3
  board were not changed. Both work branches are `codex/acp-regression-qualification`.
- All AgentLink profiles, bridge installs, projects and Roundtable review records
  used separate temporary directories. Live vendor CLIs used their existing login
  handling. No credentials were copied; inherited API keys were filtered by Roundtable.
- Routine tests used only fake agents and local artifacts. Live calls were explicit,
  bounded synthetic text tests, with the user's agy terms/isolation acknowledgment.
- No new runtime dependencies, daemon, transcript store or orchestration in AgentLink.

## Provider results

| Provider | Tested bridge / model | Setup and text | Live Roundtable discussion | Chairman |
|---|---|---|---|---|
| Codex | `@agentclientprotocol/codex-acp` 2.6.0; `gpt-6-luna` | Managed install/check passes v2; Roundtable v1 text, model selection and usage pass | Initial run: 2/2 replies; about 29.9 s and 54.7 s | Initial timeout at 60 s; low-effort follow-up ready in 12.2 s |
| Claude | `@agentclientprotocol/claude-agent-acp` 0.101.0; `haiku` | Managed install/check passes v2; Roundtable v1 text, model selection, cache/token counts and reported USD cost pass | 2/2 replies; about 11.0 s and 15.8 s | Not separately tested live |
| agy | Native ACP server 1.5.3; `gemini-3.8-flash` | Negotiates v1; text, model selection and token counts pass | 2/2 replies; about 22.2 s and 17.2 s | Not separately tested live |
| Small-agent mimic | Roundtable's deterministic local `fake-acp.mjs` | Standard ACP text and synthetic usage pass | 2/2 replies; about 0.2 s each | Ready in separate offline reviews |

The discussion timings above describe the initial run; the follow-up is recorded
below. These are individual observations, not performance benchmarks or an assessment of
reasoning quality. The mimic is a scripted protocol peer, not a trained model.
Its tokens and cost are synthetic and must not be included in actual spending.

The live review used four distinct lenses (risk, cost, evidence, reversibility),
stateless memory, one critique round, a 250,000-token ACP budget, a 240-second
review deadline and 60-second call deadlines. All eight discussion replies were
usable; no tool activity was reported. The nine planned attempts comprised those
eight replies and one Codex chairman attempt. Three separate short smoke calls
also returned the expected marker. There were no automatic verdict retries.

Review receipt: `2026-11-09-synthetic-integration-review-should-a-fi-058ae631133c419799a65ae996a00820`.
Final state: `done`, verdict `failed` / `timeout`; two completed discussion rounds,
including one completed critique round. The temporary board at
`http://127.0.0.1:60289/` was stopped after recording the result. No recommendation
or chairman dissent is claimed. The saved review offers the explicit `verdict`
recovery action; unknown spending can also prevent another call under its budget.

## Low-effort chairman rerun

On the user's request, a separate temporary `codex-chair-low` profile retained
the existing Codex launch environment and added `model_reasoning_effort: "low"`
inside the bridge-supported `CODEX_CONFIG` JSON. Initialization/session inspection
confirmed advertised effort `low` both before and after selecting `gpt-6-luna`.
Those configuration checks made no model call. This used AgentLink's existing
environment forwarding; no new setting, budget logic or fallback was added to it.

The full four-seat review was rerun with only the chairman profile changed.
The models, seat profiles, one critique round, 250,000-token budget, 240-second
review deadline and 60-second call deadlines remained the same. All eight seat
replies were usable, and the ninth attempt completed chairman synthesis:

- Final state: `done`, verdict `ready`; two completed discussion rounds including
  one completed critique round, with zero failed replies.
- Codex chairman: 12,169 ms; reported 5,676 uncached input, 9,600 cached input and
  292 output tokens. No protocol/tool-policy error or unknown chairman usage.
- One synthetic scenario question was presented to the user. The server's answer
  window expired without a response; the missing trial-cost fact remained unknown.
- The fictional verdict declined to choose either cache option without baseline,
  monitoring and recovery evidence. The strongest dissent favored waiting, while
  whether waiting would produce useful measurements remained unknown.
- No alternate vendor or extra verdict attempt was needed. A successful repeat
  does not prove whether the earlier timeout came from effort, service latency or
  other variation; cache and provider conditions may differ between runs.

Follow-up receipt:
`2026-11-09-synthetic-integration-review-should-a-fi-da6e82d549504d9caf78e1cf6ed71eb4`.
The temporary board was `http://127.0.0.1:53750/` and was stopped after recording
the ready verdict. The installed Roundtable board and user AgentLink profiles were
unchanged. Only documentation/work records were updated for this rerun.

## Reproduced defects and fixes

1. **Malformed v2 initialization.** The probe offered v2 with v1 `clientInfo` and
   `clientCapabilities`. Both current bridges rejected it with `-32602`, naming
   missing `info`. The probe and independent example now send v2 fields and read
   version-appropriate response metadata. Fixtures now represent actual v2 shapes,
   with a strict request regression. The real managed installs then passed.
2. **Windows cleanup masked probe results.** A transient `EBUSY` while removing a
   probe cwd could turn initialization into an install failure. A controlled child
   holding the cwd reproduced it. Bounded filesystem retries preserve successful
   results and original probe errors; persistent cleanup errors remain visible.
3. **Refresh discarded exact arguments.** Refresh failed for the standalone Claude
   script and could replace agy's explicit flags with a discovered default. Manual
   and managed arguments now survive refresh. Failed exact refreshes retain the
   original profile; help-derived profiles can still rediscover stale commands.
4. **Roundtable session-binding race.** A foreign-session update coalesced with the
   `session/new` response was ignored before the awaiting caller assigned the ID.
   Roundtable now binds at the receive boundary and rejects it before prompting.

The Antigravity recipe also now reflects the installed and documented native ACP
command. Native support is a technical fact, not a general approval of wrapper use.

## Verification

| Check | Actual result |
|---|---|
| AgentLink baseline `npm test` | 92 passed, no failures or skips |
| AgentLink final `npm test` | 96 passed, no failures or skips; Python fixture included |
| Roundtable rebased baseline `npm test` | 414 passed, one POSIX-only skip on Windows |
| Roundtable final `npm test` | 415 passed, one POSIX-only skip; no failures |
| Roundtable focused `node --test test/acp.test.js` | 21 passed |
| `node scripts/test-roundtable.mjs <updated-roundtable-checkout>` | 5 passed: full reviews, central update, cancellation, lease cleanup and unknown-usage caps |

Each behavioral fix has a reproduction that failed before the fix. The refresh
test was intentionally narrowed to stale *help-derived* arguments; separate tests
protect exact manual and managed arguments. JS and Python fixture expectations
changed because their former v2 messages incorrectly used the v1 response schema.

Linux/macOS execution, hosted CI, real permission challenges, large live outputs,
live bridge updates and vendor cancellation recovery were not qualified. The
offline suite covers these protocol/lifecycle cases where stated. A timeout was
observed live, but it does not establish every vendor's cancellation behavior.
No matching test-launch processes remained after the run; this is not a guarantee
against already-orphaned Windows descendants.

## Improvements outside the AgentLink runtime

Effort controls, budget grouping and review diagnostics belong to Roundtable or
another ACP client. AgentLink stays a launcher and protocol gateway. A profile
can already pass a bridge-supported default through arguments/environment; no
universal effort setting, budget manager or vendor fallback is needed in AgentLink.

1. Let Roundtable select advertised `thought_level` configuration options, or show
   the inherited effort before starting. Codex advertised `max` at setup; the ACP
   adapter currently refuses an explicit effort override. The existing bridge
   environment option was sufficient for a successful low-effort rerun; a UI control
   would be a Roundtable convenience, not a required AgentLink feature.
2. Have Roundtable show effective permissions/customization beside each ACP profile. These runs
   reported no tools, but Claude advertised `auto` mode and profiles can load
   vendor customizations. A fresh cwd and denied client tools are not a sandbox.
3. Keep protocol contract fixtures separate for v1, v2, native agy and SDK bridges.
   Run the cross-repository test against the matching integration in CI; published
   Roundtable 0.6.3 did not yet include the ACP provider.
4. Add profile-level usage/budget labels in Roundtable. All these different providers
   currently share vendor key `acp`; missing usage in one profile can block another
   under a shared token cap. Preserve the existing fail-closed accounting.
5. Add safe Roundtable timeout diagnostics (stage, elapsed time, last event type). The ACP
   chairman timeout recorded empty progress, so it cannot distinguish provider
   silence from ongoing reasoning. Do not record transcripts or infer missing usage.

## Sources

- [ACP v1 initialization](https://agentclientprotocol.com/protocol/v1/initialization)
  and [v2 initialization](https://agentclientprotocol.com/protocol/v2/initialization)
  define the different request and response fields and downgrade handling.
- [Codex ACP](https://github.com/agentclientprotocol/codex-acp) and
  [Claude ACP](https://github.com/agentclientprotocol/claude-agent-acp) are the tested
  upstream bridges. Versions above were pinned from npm, not inferred from main.
- [Antigravity ACP guide](https://antigravity.google/docs/cli/acp/) documents `agy acp`.
  Its [FAQ](https://antigravity.google/docs/faq) separately describes third-party
  wrapper restrictions. Review those terms for the intended use.
