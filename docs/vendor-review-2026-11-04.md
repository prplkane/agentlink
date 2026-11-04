# AgentLink vendor and integration review

Reviewed 4 November 2026.

Scope update: this is a historical market review. The implementation scope is
now installed agent CLIs, ACP, automatic connection discovery, and one per-user
profile store shared by projects. The broader editor and model-provider catalogue
recommendations below are not part of the current implementation.

AgentLink has a useful boundary: connect a host application to installed coding agents through the Agent Client Protocol (ACP). Keep that core and expand the catalogue around separate agent, model-provider, and editor records. Start interoperability testing with Kimi Code CLI, OpenCode using GLM, and Qwen Code using a local model. Retain the Codex and Claude bridges as comparison cases.

The local baseline is **25 passing offline tests** from `npm test` on Windows. Vendor routes below are documented candidates; none was installed, authenticated, or exercised against a model in this review. Documentation on a repository's main branch may precede a released binary. These recommendations rank integration fit, not coding quality, latency, or price.

**The project is an ACP client prototype.** [README.md](../README.md) accurately describes its narrow scope. [src/client.mjs](../src/client.mjs) implements process launch, ACP v1 initialization, one session, serial text prompts, streaming updates, cancellation, deadlines, and bounded output. [src/providers.mjs](../src/providers.mjs) has three launchable recipes: Codex and Claude through external bridges, and native Kimi. Antigravity is explicitly unavailable for the proposed consumer-plan route.

The existing tests cover useful failure cases: malformed messages, split UTF-8, unexpected IDs, cancellation, timeouts, crashes, bounded stderr, and ordinary process-tree cleanup. They establish fixture behavior, not vendor interoperability or full ACP conformance.

The changes needed before expanding support are:

| Priority | Finding in the current project | Consequence and proposed change |
| --- | --- | --- |
| First | Every `session/request_permission` is cancelled, and other agent requests receive `-32601` (`client.mjs`, lines 197–202). | Coding operations requiring approval cannot proceed. Add a host callback that presents the actual permission options, validates the response, and retains cancellation as the default. Add user-question handling separately. |
| First | Initialization returns capabilities and authentication methods but the client has no authentication flow, model/mode/config selection, or resume API (`client.mjs`, lines 63–105). | Pre-authenticated, default-configured agents are the practical starting point. Expose negotiated capabilities and add only the supported operations needed by the host. |
| First | The registry identifies products but has no tested version, OS, lifecycle, authentication, or evidence status (`providers.mjs`, lines 2–26). | A recipe can look supported even when it has never run. Separate documented candidates from tested combinations and record both agent and bridge versions. |
| Before production | Protocol v1 and prompt completion semantics are fixed (`client.mjs`, lines 68–74 and 100–103). | Test v1 explicitly. Evaluate ACP v2 as a separate implementation: its prompt response acknowledges acceptance, while foreground completion arrives through state updates. Changing the version number alone is insufficient. [ACP v2 flow](https://agentclientprotocol.com/protocol/v2/overview) |
| Before production | Launches inherit the supplied process environment by default; process ownership is not a sandbox (`client.mjs`, lines 18–37 and 246–263). | The host must choose credentials, workspace access, and a provider permission profile. Cleanup skips tree termination after the root has already exited; the README documents the Windows orphan limitation. Test OS containment and that failure case before production. |
| For editor delivery | AgentLink implements the client side of ACP. | A custom application or editor extension can consume the library. Registering AgentLink itself as an agent in Zed or JetBrains would require a separate ACP server/proxy, which the project does not implement. Editors can already connect directly to many of these agents. |

**Treat agent execution, model inference, and the editor as separate choices.** For example, a custom application can use AgentLink to start OpenCode, while OpenCode uses GLM through Z.ai. Alternatively, AgentLink can start Qwen Code configured for local inference. The agent owns the coding loop and tools; the model endpoint supplies inference; the editor or application owns the user interface. MCP connects tools to an agent and does not replace the ACP connection between host and agent.

**The directly documented agent options cover most of the requested range.** Commands below identify advertised entry points. AgentLink still requires an explicit absolute executable path; on Windows, use a native executable or Node plus the installed entry file, rather than a `.cmd` shim.

| Product | CLI or programmatic route | Model access and AgentLink fit | Primary evidence |
| --- | --- | --- | --- |
| Moonshot Kimi Code CLI | Native ACP: `kimi acp`; terminal interface; ACP editor integrations. | Kimi authentication and compatible provider configuration. Existing recipe matches the current project. Windows installation requires Git Bash. First test candidate. | [Current repository](https://github.com/MoonshotAI/kimi-code), [ACP reference](https://moonshotai.github.io/kimi-code/en/reference/kimi-acp) |
| OpenCode | Native ACP: `opencode acp`; terminal and editor integration. | Good first agent for the GLM path. Z.ai documents separate OpenCode selections for its API and Coding Plan. Add a candidate recipe. | [ACP](https://opencode.ai/docs/acp/), [GLM integration](https://docs.z.ai/devpack/tool/opencode) |
| Qwen Code | Native ACP: `qwen --acp`; CLI, desktop, web, editor integrations, and SDKs. | Supports multiple provider protocols and local Ollama/vLLM models. Best initial candidate for exercising the same host against hosted and self-hosted inference. | [Repository](https://github.com/QwenLM/qwen-code), [ACP launch](https://qwenlm.github.io/qwen-code-docs/en/users/integration-zed/) |
| OpenAI Codex | `codex-acp` bridge; official app-server and SDK are alternative integration surfaces. | Existing bridge starts Codex app-server and translates its protocol. Use the bridge for the common ACP interface; evaluate app-server separately if Codex-specific capabilities become central. | [Bridge](https://github.com/agentclientprotocol/codex-acp), [official app-server documentation](https://learn.chatgpt.com/docs/app-server) |
| Anthropic Claude | `claude-agent-acp` bridge over the Claude Agent SDK; Claude Code CLI ecosystem. | Existing bridge is a sensible candidate. Track the bridge and SDK as separate dependencies. Its default protocol setting serves v1 and draft v2; a v2-only configuration rejects v1 clients. | [Bridge and protocol behavior](https://github.com/agentclientprotocol/claude-agent-acp) |
| Google Gemini CLI | Native ACP: `gemini --acp`; VS Code companion and ACP editor integrations. | Direct addition to the catalogue. Keep its authentication and product identity separate from Antigravity. | [ACP mode](https://geminicli.com/docs/cli/acp-mode/), [IDE integration](https://geminicli.com/docs/ide-integration/) |
| Cursor | Native ACP: `agent acp`; CLI and Cursor editor. | Supports pre-authentication and session modes. Its blocking question and plan-approval extensions require deliberate host behavior; current generic `-32601` replies are not full feature support. | [Cursor ACP](https://cursor.com/docs/cli/acp) |
| GitHub Copilot | Native ACP: `copilot --acp --stdio`; IDE products; SDK/headless-server ecosystem. | Current ACP documentation still labels the surface public preview. It supports configured BYOK providers as well as GitHub authentication. Add a candidate, with release-specific checks. | [ACP server](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server), [CLI](https://github.com/github/copilot-cli) |
| Cline | Native ACP: `cline --acp`; CLI, VS Code, JetBrains, desktop, and SDK. | Broad provider choice, including GLM and local Ollama/LM Studio. Strong second configurable-agent candidate after the first interoperability tests. | [CLI reference](https://github.com/cline/cline/blob/main/apps/cli/README.md), [surfaces](https://github.com/cline/cline), [local models](https://docs.cline.bot/running-models-locally/overview) |
| Augment Auggie | Native ACP: `auggie --acp`. | A documented vendor-agent option. Both 0.x and prerelease 1.x documentation exist, so pin the selected release rather than mixing their features. | [0.x ACP](https://docs.augmentcode.com/cli/v0/acp/agent), [1.x ACP](https://docs.augmentcode.com/cli/acp/agent) |
| Mistral Vibe | CLI and `vibe-acp` editor integration. | Configurable models and providers. Windows is reported to work, but the project officially targets UNIX; rank below the initial Windows candidates. | [Maintainer documentation](https://github.com/mistralai/mistral-vibe) |
| A custom agent | Implement an ACP agent process and connect it with `new AcpClient(...)`. | Already possible without a built-in registry entry if the process meets this client's v1 profile. The custom agent must supply the model integration, coding tools, and session behavior. | [Current client](../src/client.mjs), [ACP v1 communication model](https://agentclientprotocol.com/protocol/v1/overview) |

**Z.ai supplies both model access and a development environment.** GLM belongs in the model-provider catalogue. Z.ai also offers **ZCode**, an Agentic Development Environment with its own agent and support for other frameworks. The reviewed ZCode documentation establishes a desktop/ADE configuration path; it does not establish a standalone ACP server entry point for AgentLink. OpenCode using GLM is the more concrete initial integration. [ZCode](https://docs.z.ai/devpack/tool/zcode), [supported tools and protocols](https://docs.z.ai/devpack/tool/others)

The billing profile must distinguish standard API keys from Coding Plan keys. Since 16 October 2026, newly created keys have separate billing types; changing the endpoint does not change that type. The Coding Plan is limited to supported tools and product environments, so a plan should not be represented as unrestricted API access for a custom product. Record the key type and permitted usage alongside the selected endpoint, without storing the secret in the catalogue. [Key management](https://docs.z.ai/devpack/notice/api-key-management), [usage policy](https://docs.z.ai/devpack/usage-policy)

**Self-hosting has two independent parts: the agent and inference.** Running a CLI on your computer can still send code to a hosted model. A fully local candidate runs both the agent and a local model; a privately hosted candidate can run inference on an internal GPU server. AgentLink currently connects to a local subprocess, so a remote deployment would run AgentLink alongside that process or add a separate runner/transport layer.

| Setup | Concrete path | Tradeoff |
| --- | --- | --- |
| Local agent, hosted inference | AgentLink → OpenCode → Z.ai GLM. | Low inference operations burden; provider billing and data handling remain part of the setup. [Z.ai integration](https://docs.z.ai/devpack/tool/opencode) |
| Local agent and local inference | AgentLink → Qwen Code → local Ollama, or Cline → Ollama/LM Studio. | Greater control over inference location; model capability, memory, context, and tool-call behavior need workload tests. [Qwen providers](https://github.com/QwenLM/qwen-code), [Cline local models](https://docs.cline.bot/running-models-locally/overview) |
| Private inference server | Configurable agent → an internally served compatible model, for example Qwen Code with vLLM. | Shared GPU operations and model serving become your responsibility. API compatibility alone does not establish agent quality. [Qwen local-model support](https://github.com/QwenLM/qwen-code) |
| Fully custom runtime | An owned ACP agent → selected API or local model server. | Maximum control over tools and behavior, with the largest implementation and maintenance cost. AgentLink remains the client. |
| Separate terminal workflow | Aider → Ollama. | Useful local-model alternative; the reviewed Aider documentation establishes its own CLI workflow, not a native ACP route. Keep it outside the direct ACP shortlist until an adapter is verified. [Aider and Ollama](https://aider.chat/docs/llms/ollama.html) |

Ollama and LM Studio are inference/runtime choices in these combinations, not replacements for an ACP coding agent. Ollama's OpenAI compatibility covers a subset of that API, and its local server can also access cloud models. Select a genuinely local model when testing an offline configuration. [Ollama API compatibility](https://docs.ollama.com/api/openai-compatibility)

**Editors should have their own compatibility records.** An editor supporting ACP as a client does not automatically expose its built-in agent as an ACP server.

| Editor or environment | Relevant integration | Implication for this project |
| --- | --- | --- |
| Zed | Native external-agent client with an ACP registry and custom-agent configuration. | Useful reference client for comparing behavior against AgentLink. External agents retain their own authentication and billing. [External agents](https://zed.dev/docs/ai/external-agents) |
| JetBrains IDEs | AI Assistant supports registry and custom ACP agents without requiring a JetBrains AI service subscription. | Useful second reference client. Current documentation excludes ACP agents in WSL, which matters for Windows-only testing. [JetBrains ACP](https://www.jetbrains.com/help/ai-assistant/acp.html) |
| VS Code | Vendor extensions, configurable agents such as Cline, and community ACP-client extensions. | Track the exact extension and publisher. ACP-client availability here is extension-specific. [ACP client catalogue](https://agentclientprotocol.com/get-started/clients), [Cline surfaces](https://github.com/cline/cline) |
| Cursor | Editor plus an independently documented CLI ACP server. | Distinguish the editor integration from the `agent acp` process AgentLink can launch. [Cursor ACP](https://cursor.com/docs/cli/acp) |
| Devin Desktop / Windsurf lineage | Current Devin Desktop hosts third-party and custom ACP agents. | Treat it as an editor/client candidate. The old Cascade documentation describes a legacy agent whose conversations can no longer be started or opened. [ACP client](https://docs.devin.ai/desktop/acp), [Cascade lifecycle](https://docs.devin.ai/desktop/cascade) |
| ZCode | Z.ai development environment with model-provider configuration. | Useful GLM product comparison; a separate AgentLink server route remains unverified. [ZCode integration](https://docs.z.ai/devpack/tool/zcode) |
| Neovim and Emacs | ACP-capable plugins, including CodeCompanion/Avante and agent-shell. | Useful additional host surfaces; record plugin and version rather than claiming editor-wide support. [ACP client catalogue](https://agentclientprotocol.com/get-started/clients) |

**Keep a watchlist with explicit lifecycle and evidence status.** The ACP agent catalogue also lists Kiro, Goose, Factory Droid, Qoder, Junie, and Pi through an adapter. Those are discovery candidates here, not verified launch recipes. The catalogue still links the archived Python Kimi CLI, demonstrating why each entry needs checking against its maintainer. [ACP agent catalogue](https://agentclientprotocol.com/get-started/agents), [archived Kimi project](https://github.com/MoonshotAI/kimi-cli)

Three cases should not be promoted using old assumptions:

- **Antigravity has a CLI and IDE products, but consumer-plan embedding is restricted.** Its FAQ says wrapping `agy -p` in third-party coding agents or applications is unsupported under consumer plans. Retain the current unavailable status for that specific route; do not label the entire product as lacking a CLI. [Official FAQ](https://antigravity.google/docs/faq)
- **Continue is now a legacy codebase.** Its maintainer README says the repository is read-only and no longer actively maintained after a final 2.0.0 release of the CLI and editor integrations. Evaluate only with an explicit maintenance/fork plan. [Continue](https://github.com/continuedev/continue)
- **The old OpenHands CLI is unmaintained.** Its ACP instructions remain for legacy users and point new local installations toward Agent Canvas. Do not use `openhands acp` as a new default merely because it remains listed in ACP catalogues. [OpenHands lifecycle notice](https://docs.openhands.dev/openhands/usage/cli/ide/overview)

**Evolve the registry as evidence-backed metadata.** Keep the launch planner small. Add agent identity and maintainer, available surfaces, native/bridge/custom integration, transport and supported protocol versions, OS launch recipes, required external dependencies, authentication mechanisms, and model-provider configuration references. Track lifecycle, documentation review date, source URLs, tested versions, OS, and test outcomes separately. Keep observed capabilities separate from catalogue expectations.

Use statuses such as `documented-native`, `documented-bridge`, `catalogue-listed`, `legacy`, and `unsupported-plan-route`. Reserve `tested` for a recorded agent/bridge/version/OS combination. Importing registry metadata should not automatically install or execute a package. Keep installed executable paths and credential references in local configuration. The upstream ACP Registry is useful discovery input, while this project's registry remains a record of installed, selected agents. [ACP Registry](https://agentclientprotocol.com/get-started/registry)

**The next implementation should prove three paths before broadening the list.**

1. Exercise the existing Kimi recipe against a pinned Kimi Code CLI release, including its Windows Git Bash dependency.
2. Add a documented OpenCode candidate and test GLM with an explicitly chosen API/billing profile.
3. Add a Qwen Code candidate and test an actually local model. Cline is the next configurable-agent comparison.
4. Run the same checks on the existing Codex and Claude bridges, recording the underlying runtime versions too.
5. Expand to Gemini CLI, Cursor, and Copilot after authentication, approvals, and capability handling are usable. Keep Cursor-specific blocking questions in its profile.

Each real-agent check should cover launch and version capture; unauthenticated behavior; initialization and negotiated capabilities; a text-only round trip; an allowed and a denied edit in a disposable workspace; terminal execution where enabled; cancellation during tool work; timeout/crash handling; and child cleanup. Test the current 500 ms cancellation grace against real agents rather than assuming it is sufficient. Record resume and model/config selection as unavailable until the client implements them.

For the self-hosted path, verify that the chosen model and auxiliary tools do not make unintended hosted calls. Compare task completion, edit correctness, elapsed time, model usage or subscription consumption, and operational burden on the same small set of tasks. That evidence can support a cost or quality ranking later; the current review supports an integration shortlist.
