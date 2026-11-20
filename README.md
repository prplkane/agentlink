# AgentLink

Connect ACP clients to agent CLIs through named profiles and centrally managed bridges.

AgentLink saves the launch command for each profile. Any client that speaks the
Agent Client Protocol (ACP) can use that name to open a session with the selected
agent. The client owns the conversation, and the agent supplies its capabilities.

Requires Node.js 22 or newer. The public beta, `0.3.0-beta.4`, has no npm runtime
dependencies. See the [qualification results](docs/acp-qualification.md) for tested
providers, platforms and known limits.

## Install and configure

Install the packaged release once:

~~~sh
npm install -g @prplkane/agentlink@beta
~~~

From a source checkout, substitute `node /absolute/path/to/src/cli.mjs` for
`agentlink`.

~~~sh
# Native ACP in an already installed agent:
agentlink add kimi --command kimi

# Install and centrally manage the selected existing ACP bridges:
agentlink add codex --provider codex
agentlink add claude --provider claude

# Native ACP in a recent Antigravity CLI (review vendor terms for your use):
agentlink add agy --provider antigravity

# Or use a bridge that you install and update yourself:
agentlink add personal-claude --provider claude --external

agentlink list
agentlink check kimi
~~~

Codex and Claude recipes install their upstream npm bridges on demand.
Other recipes, including Antigravity's `agy acp`, locate installed native ACP
commands. AgentLink never downloads
all providers. A bridge's dependencies and vendor runtime are separate from
AgentLink's own footprint.

Adding/checking an agent sends only `initialize`, not a session, prompt, login,
or coding task. The selected executable still runs; its startup behavior is
owned by its vendor. Complete any required vendor sign-in using its supported
login flow. Discovery reports advertised authentication methods.

## Connect applications through standard ACP

Configure an ACP client to launch:

~~~sh
agentlink acp kimi
~~~

For an exact executable/argument configuration, including a Windows-safe native
Node launcher:

~~~sh
agentlink config kimi
~~~

The output has ordinary `command` and `args` fields. It invokes the centrally
installed AgentLink, rather than a project-local SDK or vendor bridge path.
The ACP client still needs its normal launch entry and a selected profile name;
this does not add an automatic agent catalogue method to ACP.

Roundtable or another application can open several connections concurrently,
including different agents. Connections have separate child processes and
sessions. Profiles, installed bridge versions and configuration are shared.
Clients retain ownership of session setup, working directories, permission
decisions, task deadlines and their own conversation history.

For example, Codex can coordinate a Roundtable review while each seat and the
chairman use a saved AgentLink profile. See the [illustrated Roundtable workflow](https://github.com/prplkane/roundtable#review-in-codex-with-agentlink-seats)
or the [cross-project testing guide](docs/laptop-testing.md#roundtable-integration).

The gateway forwards JSON-RPC in both directions: initialization/version
negotiation, capabilities, authentication, prompts, streaming, cancellation,
client filesystem/terminal requests, and vendor extensions. Unsupported methods
remain the connected agent's own errors. It does not simulate missing features.

Terminal-auth descriptors receive one launcher marker so a standard ACP client
can relaunch AgentLink interactively, even for environment-only login methods.
That marker is removed before the underlying bridge runs. No custom ACP method
or application SDK is introduced.

Runtime connections resolve saved configuration, acquire any required installation
leases, and start the selected bridge.
They never install, update, discover, or send a test prompt.
The ACP entry point loads only the runtime modules. Installation, discovery and
the compatibility client load only for management commands. External profiles
do not need the installation lease lock; managed profiles briefly acquire it.

## Choose a model and effort once for a profile

Use the provider profile your projects already launch. Inspect the bridge's
live choices, then replace the example IDs below with values from the output.

~~~sh
agentlink models agy
agentlink models agy --model MODEL_ID
agentlink defaults agy --model MODEL_ID --effort EFFORT_ID
agentlink defaults agy
agentlink defaults agy --clear-model --clear-effort
~~~

`models` opens a temporary session with the profile's launch settings and an
empty working directory. It sends no prompt. The JSON shows the saved defaults,
the bridge's current model and effort, and each advertised choice's ID and
name. Use `--model` to preview the effort levels for a particular model.
An unavailable selector appears as `null`. Inspection ignores saved pins so it
can show replacements after a vendor retires a model.

`defaults` with no flags shows the saved choices. Setting a model or effort
validates the resulting pair in a temporary session before saving it. An
omitted flag keeps its previous setting. Use `--clear-effort` alongside a
model change to follow that model's own reasoning default. Clearing both
returns to vendor defaults and works offline.

All ACP clients launching that profile inherit the choices on their next
`session/new`, including on an open connection. Running and resumed sessions
keep their settings. A client may explicitly override a choice for its session.
If a saved ID disappears, session creation reports the unavailable choice so
you can replace it once for every project. AgentLink can only detect a retired
model once the bridge stops advertising that ID. While a bridge still lists
it, the saved choice is accepted and any failure comes from the vendor. If
the profile file cannot be read when a session is created, only that request
fails; the connection and its other sessions stay open. Bridge updates still
check ACP initialization. Actual model and effort support is checked in the session.

## Discover an unfamiliar agent

~~~sh
# Inspect without saving:
agentlink inspect --command new-agent

# Discover, initialize and save locally:
agentlink add my-agent --command new-agent

# A custom help convention:
agentlink add unusual --command unusual-cli --help-args '["help"]'

# An exact launch recipe, including a standalone ACP server:
agentlink add custom --command custom-cli --acp-args '["serve","--protocol","acp"]'
agentlink add standalone --command /absolute/path/to/acp-server --acp-args '[]'
~~~

Discovery checks known recipes, then bounded `--help` / `-h` output, advertised
help aliases and relevant subcommands. Explicit `--help-args` replaces the
default help invocations. Recognizable help from a nonzero exit can still be
used. It never executes shell snippets or downloads URLs found in help text.

The saved profile includes launch arguments, a help hash when available,
capabilities and initialization status. It is personal configuration; adding
an unfamiliar compatible agent does not require a repository change.

`refresh` rediscovers help-derived external launches. Explicit `--acp-args`
(including an empty array) and managed bridge arguments are rechecked as saved;
refresh does not discard their options. To change an exact recipe, use `update`
with new `--acp-args`, or supply `--command` to request discovery again.

Inconclusive discovery does not prove an agent lacks ACP. Supply an exact launch
command or an existing bridge when needed. If there is no usable ACP
implementation, a separate bridge must supply that translation.

`--skip-check` can save a direct configuration as pending. Managed installations
always pass initialization before being activated. Initialization establishes a
protocol connection, not full task compatibility.

## Manage bridges and versions centrally

~~~sh
agentlink bridge list
agentlink bridge show codex
agentlink bridge update codex

# Multiple profiles can reference one managed bridge:
agentlink add work-codex --bridge codex

# Install another existing bridge using a package or registry entry:
agentlink bridge install custom --package some-acp-bridge --version 1.2.3
agentlink add custom --bridge custom
agentlink add another --manifest /absolute/path/to/agent.json
~~~

The package name/version above is illustrative. Use `--version` to pin a real
release or npm tag. npm tags are resolved once to an exact installed version.
There are no background updates. `bridge update` is an explicit update request.

Manifest input is an individual entry in the
[ACP registry format](https://github.com/agentclientprotocol/registry/blob/main/FORMAT.md).
Supported distributions:

| Distribution | Installation |
|---|---|
| `npx` | Pinned npm package in AgentLink's shared store; requires npm |
| `binary` | Raw file, ZIP or tar.gz for this platform; checks supplied SHA-256 |
| `uvx` | Pinned Python package in a shared virtual environment; requires Python with venv/pip |

Python entries use pip installation rather than running uvx on every connection.
Multiple command packages can select an entry with `--bin`.
Archives containing links, unsupported formats, or unsafe paths are rejected.
Those bridges can still be installed externally and connected with `--command`.

`--source` accepts an explicit package artifact, including a local tarball or
wheel. `--offline` requires local artifacts or package-manager cache and disables
registry downloads by AgentLink. It is not a network sandbox for third-party
install hooks or executable startup.

An update verifies the new launch, including profiles with custom arguments,
before atomically switching the shared bridge record. Failure preserves the
active record. Existing sessions retain leases on their old installed version.
New connections resolve the current shared version.
When adding or updating a profile also changes a bridge, both are prepared
before publication. If bridge publication fails, the profile is restored before
managed connections can resume.

~~~sh
agentlink update kimi --command /new/location/kimi
agentlink refresh kimi
agentlink show kimi
agentlink doctor
agentlink remove work-codex

# A referenced bridge cannot be removed:
agentlink bridge remove custom

# Explicitly remove unused versions after sessions finish:
agentlink bridge prune
agentlink bridge prune --cache
~~~

Pruning retains active installations and live leases. `--cache` also clears
AgentLink's package cache, reducing disk usage at the expense of offline reuse.
Externally installed bridges are never uninstalled.

## Local storage and limits

Default storage is `~/.agentlink/`; `AGENTLINK_HOME` or `--home` selects a different
absolute directory. Use `agentlink where --json` to inspect it. The default is
outside project repositories; keep any custom home outside them too. AgentLink
accepts an absolute custom path without checking whether it is inside a repository.

For ACP launches, place `--home` before `acp`:

~~~sh
agentlink --home /absolute/user-store acp kimi
~~~

Arguments after the profile are reserved for the agent's terminal-auth
invocation and are forwarded, not parsed as management options.

AgentLink stores profiles, bridge metadata, installation files, package cache,
short-lived leases and operation locks. It does not store prompts, responses,
or conversation history. Agents may maintain their own history and credentials.
Explicit `--env` settings and command arguments are saved as plain configuration;
use existing vendor login/environment handling for secrets.

Current boundaries:

- Local stdio connections. The gateway preserves ACP v1/v2 negotiations; it
  does not translate between incompatible protocol versions.
- Default per-message bound: 16 MiB. No lifetime response-size or task timeout
  is imposed by the gateway.
- Native artifact bounds: 256 MiB download, 512 MiB extracted contents,
  10,000 entries. ZIP64, tar.bz2 and platform installers are unsupported.
- Installation hooks and agent processes run as the user, not in a sandbox.
- HTTPS artifact redirects are checked at every hop; redirects to HTTP fail
  before contacting that destination.
- Managed Python on Windows requires an executable path shorter than 260
  characters. A deeper store fails early with `PYTHON_PATH_TOO_LONG`; select a
  shorter absolute `--home` or use an externally installed bridge.
- On Windows, normal disconnect/termination stops a still-running bridge tree.
  Descendants already orphaned by an abrupt parent exit are not guaranteed to
  be contained; this version does not use native Windows Job Objects.
- An abruptly killed management process can leave a lock. The diagnostic names
  its owner and path; remove a stale lock only after that process has stopped.

`agentlink doctor [--json]` checks local profiles, launch files, managed
installation metadata, connection leases and locks without starting agents or changing anything.
An abandoned lease appears as a note. Run `agentlink bridge prune` to remove it.
It exits with status 1 for detected errors. It does not test sign-in or ACP
compatibility; use `check PROFILE` for initialization.

## Verification and development

~~~sh
npm test
npm run test:maturity
npm pack
~~~

Tests use local fixture agents and locally produced npm packages, wheels and
binary archives. They cover independent ACP clients, shared updates, rollback,
leases/pruning, discovery, authentication forwarding and process cleanup.
The separate maturity check starts 50 batches of eight managed clients with
synthetic profiles, checks model and effort inheritance on every prompt, and
verifies lease cleanup after each batch.
Python installation coverage runs when Python is available. No vendor account
or paid model call is needed.
A GitHub Actions workflow runs the offline suite on Windows, Linux and macOS
with Node 22 and 24 and Python 3.13. Results are on the repository's
[Actions page](https://github.com/prplkane/agentlink/actions).

See [laptop testing](docs/laptop-testing.md) for real-agent checks and
[architecture](docs/architecture.md) for the maintenance boundaries.

The original library exports and `examples/connect.mjs` remain
for compatibility. That helper is text-only ACP v1. New integrations should use
the standard gateway; the helper's limitations do not define the gateway.

## Working on this repository

Read [CONTRIBUTING.md](https://github.com/prplkane/agentlink/blob/main/CONTRIBUTING.md) and the shared
[AGENTS.md](https://github.com/prplkane/agentlink/blob/main/AGENTS.md). Work records for
non-trivial changes are kept locally and are not part of the repository; see the
[working agreement](https://github.com/prplkane/agentlink/blob/main/docs/work/README.md).

The [source-document review](https://github.com/prplkane/agentlink/blob/main/docs/process/source-document-review.md) describes
the guidance adapted from Roundtable and Career Hub, grouped by project, with
explicit reasons for each inclusion and exclusion. See
[repository setup](https://github.com/prplkane/agentlink/blob/main/docs/process/repository-setup.md) for actual hosted settings.

## License

[Apache License 2.0](LICENSE), copyright 2026 prplkane.
[NOTICE](NOTICE) retains attribution for adapted process documentation.
