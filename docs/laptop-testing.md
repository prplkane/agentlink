# Testing AgentLink 0.2.1 on another laptop

Bring `local-agentlink-0.2.1.tgz`. Node.js 22 or newer with npm is required.
AgentLink has no npm runtime dependencies; the agents and selected bridges have
their own dependencies. Do not copy profiles blindly between machines because
external executable paths are machine-specific.

## Install once

~~~sh
npm install -g ./local-agentlink-0.2.1.tgz
agentlink --version
agentlink --help
agentlink where
agentlink doctor
~~~

The version should be `0.2.1`. Installation of this tarball alone downloads no
vendor bridge.

## Configure the agents you have

For an installed native ACP agent:

~~~sh
agentlink add kimi --command kimi
~~~

For centrally managed Codex and Claude bridges:

~~~sh
agentlink add codex --provider codex
agentlink add claude --provider claude
~~~

These commands download only the selected upstream bridges and their
dependencies, then check initialization. Complete vendor sign-in separately,
or through a compatible client's standard ACP authentication flow.

To retain control of an already installed bridge:

~~~sh
agentlink add codex-external --provider codex --external
~~~

For another executable:

~~~sh
agentlink inspect --command your-agent
agentlink add personal --command your-agent
~~~

If help discovery is inconclusive, supply the documented help invocation with
`--help-args` or exact ACP launch arguments with `--acp-args`. Supply argument
arrays as quoted JSON. A bridge that has no ACP launch mode cannot be created
merely by changing its flags.

For a known existing distribution outside the built-in recipes, use
`agentlink add NAME --manifest PATH-OR-URL` with an individual ACP registry entry.
Only use a distribution you intend to install and execute.

## Check the standard ACP connection

~~~sh
agentlink check kimi --json
agentlink check codex --json
agentlink check claude --json
agentlink config codex
~~~

Save diagnostics for failed checks. `initialize-passed` is an initialization
result, not proof that a logged-in agent can complete a task.

Copy the ordinary executable and argument fields from `agentlink config NAME`
into your ACP client's launch configuration. On Windows this selects Node
directly and avoids requiring the client to execute a `.cmd` shell shim.

With the source checkout, this independent ACP example performs initialization
through the actual gateway:

~~~sh
node examples/acp-check.mjs codex
~~~

It sends no coding task and does not authenticate automatically. Vendor startup
itself may access the network.

## Verify your actual workflow

In your chosen ACP application, test one small task with each agent, then:

1. Open two projects and use the same saved agent name in each.
2. Confirm streamed responses, the intended working directory and permission
   requests reach the requesting project.
3. Cancel a task; confirm the cancellation and subsequent connection work.
4. Use different configured agents simultaneously.
5. Run an explicit bridge update or select a known version. Confirm new
   connections use it while an existing session can finish on the old version.
6. End those sessions, then run `agentlink bridge prune` to remove unused versions.

## Roundtable integration

Use a Roundtable checkout containing `src/adapters/acp.js`. Its new **AgentLink
(ACP)** choice connects seats and the chairman to saved profiles. Existing direct
CLI choices remain available. No AgentLink SDK is imported into Roundtable.

Before testing vendors, this command from the AgentLink checkout runs a full
offline review through the actual Roundtable server and AgentLink gateway:

~~~sh
node scripts/test-roundtable.mjs /absolute/path/to/roundtable
~~~

It creates temporary profiles and managed fake bridges, verifies two discussion
rounds and a ready chairman verdict, updates a bridge centrally, then checks
cancellation and missing-usage behavior. No real user store or vendor CLI is used.
The integration script is developer tooling and is not included in the npm package.

For real agents on the other laptop:

1. Configure/check profiles with the commands above and complete vendor sign-in.
2. Start the updated Roundtable. If AgentLink is not globally installed, set
   `ROUNDTABLE_AGENTLINK_CLI` to its absolute `src/cli.mjs` path in the shell that
   starts Roundtable. Set `AGENTLINK_HOME` there only when using a custom shared store.
3. Choose **AgentLink (ACP)** for two seats and the chairman. Enter the saved
   profile names, leave Model/effort at default and use stateless memory.
4. Use trusted profiles configured to disable their own tools. Roundtable denies
   client tools and stops reported activity, but ACP cannot sandbox an agent's
   built-in tools or suppress all customization. The profile controls its billing.
5. Run a small review and wait for the chairman verdict. Verify cancellation,
   then explicitly update a bridge and run another review with the same profile names.

This client currently supports ACP v1 text reviews, fresh sessions and optional
advertised model selection. It does not offer session resume, web research or
automatic login through ACP. Optional end-turn token usage is not guaranteed;
when a bridge omits it, Roundtable's seat cap stops further calls for that seat.
That may prevent critique rounds even though initialization succeeds. The chairman
can still summarize usable replies. Report this as a vendor qualification gap,
not a successful full review. AgentLink forwards the bridge's capabilities unchanged.

## Useful diagnostics

~~~sh
agentlink show codex
agentlink bridge show codex
agentlink list --json
agentlink check codex --timeout 15000 --json
agentlink doctor --json
~~~

Report the OS, Node version, bridge package/version, initialization result, exact
operation that failed and its stderr. Remove credentials, prompts and private
paths before sharing diagnostics.

`doctor` only reads local configuration and files; it does not launch an agent,
repair locks or test credentials. For `PYTHON_PATH_TOO_LONG` on Windows, choose
a shorter absolute `AGENTLINK_HOME` or `--home` before configuring a managed
Python bridge. Profiles and installations belong to that selected home.

No live vendor results are claimed by the offline suite. This laptop pass is
where account access, vendor-specific features and actual task behavior are
verified.
