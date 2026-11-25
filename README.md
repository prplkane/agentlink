# AgentLink

[![npm beta](https://img.shields.io/npm/v/@prplkane/agentlink/beta?label=npm%20beta)](https://www.npmjs.com/package/@prplkane/agentlink)
[![Node.js](https://img.shields.io/node/v/@prplkane/agentlink)](package.json)
[![License](https://img.shields.io/npm/l/@prplkane/agentlink)](LICENSE)

Configure a coding agent once and reuse it across local apps that support the
**Agent Client Protocol (ACP)**.

ACP defines how an app talks to an agent. AgentLink saves how to start that agent and
which model and reasoning level to use in a named **profile**. Apps share the profile
while keeping their connections and conversations separate.

## Quick start

Install the public beta with Node.js 22 or newer. This example sets up Claude. Sign in
through your provider before starting a live session.

```sh
npm install -g @prplkane/agentlink@beta
agentlink add claude --provider claude
agentlink config claude
```

The second command installs and checks the **bridge**, the adapter that lets the agent
speak ACP. The last command prints the executable and arguments to enter in your app's
ACP settings. If the app accepts a launch command, use `agentlink acp claude`.

## Share a model across apps

Suppose an editor and a code-review tool both use the `claude` profile. By default they
follow the agent's own settings. To choose a model and reasoning level for both, list the
available models, check the effort levels for the one you want, then save the pair.

```sh
agentlink models claude
agentlink models claude --model MODEL_ID
agentlink defaults claude --model MODEL_ID --effort EFFORT_ID
```

Use the IDs advertised by the agent. Each new session picks up the change, and an app
can override it for that session. If the bridge stops offering a saved ID, AgentLink
reports it when an app opens a session. Choose a replacement once for the profile, or
return to the provider's choices with `agentlink defaults claude --clear-model --clear-effort`.

## Keep temporary work out of provider history

An ACP v1 app can request a temporary provider chat for an individual task. The
bridge reports whether it can disable local conversation persistence, archive the
chat when the app closes it, or leave history to the provider. Apps that require
native non-saving sessions can reject providers that lack them. The client can
leave out the preference for conversations the user wants to keep. [Session history negotiation](docs/architecture.md#session-history)

## Manage connections

| Task | Command |
| --- | --- |
| List built-in provider configurations | `agentlink providers` |
| List configured profiles for an app's picker | `agentlink list --json` |
| Add Codex with a managed bridge | `agentlink add codex --provider codex` |
| Connect an installed command-line agent with ACP support | `agentlink add my-agent --command my-cli` |
| Update the shared Claude bridge | `agentlink bridge update claude` |
| Verify that a profile can start and negotiate ACP | `agentlink check claude` |
| Diagnose local profiles, installations, locks, and leases | `agentlink doctor` |

A managed update switches new connections to the verified bridge. Running connections
keep their version. For agents with native ACP support, such as Antigravity's `agy`,
update the command-line tool through its provider. [Setup and troubleshooting](docs/laptop-testing.md) ·
[Version pins and offline installs](docs/laptop-testing.md#custom-bridges-and-offline-installs)

## Compatibility and local data

AgentLink runs on demand and uses standard ACP over local stdin and stdout. The client
and bridge need a protocol version in common. Each bridge advertises the models, effort
levels, and commands it supports.

Profiles and managed installations live in `~/.agentlink/` by default. Run `agentlink where`
to find the active directory. Launch arguments and explicit environment settings are saved
as plain configuration, so keep credentials in the provider's sign-in mechanism.
Conversation history stays with the app and agent.

[Example ACP client](examples/acp-check.mjs) · [Architecture](docs/architecture.md) ·
[Release notes and test results](https://github.com/prplkane/agentlink/releases) ·
[Contributing](https://github.com/prplkane/agentlink/blob/main/CONTRIBUTING.md) · [Apache-2.0 license](LICENSE)
