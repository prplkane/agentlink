# Source document review and transfer decisions

Reviewed November 5, 2026. The request was to reuse engineering style and
agent coordination, while leaving each project's product engine in its own
repository. These are adapted practices, not a new runtime integration.

Sources were the current development checkouts: Roundtable at
`48dadaebbf45f79dee1522a81d88ede6f8feccf3` and Career Hub at
`a9290dee61c56bf39fd16ca64d9c771c256d86dd`. The relevant tracked source documents
were read without modifying either project. Public export copies, duplicate
worktrees, historical tasks and private user records were not imported.

## Roundtable

Roundtable contributes the small-project discipline, offline test boundary,
untrusted-input rule and clear contribution/review language.

| Source document | What it does | Choice for AgentLink |
|---|---|---|
| [AGENTS.md](https://github.com/prplkane/roundtable-dev/blob/48dadaebbf45f79dee1522a81d88ede6f8feccf3/AGENTS.md) | Routes agents to contribution rules, rejects instructions in external text, and describes Roundtable review invocation. | **Adapt** the trust boundary and offline tests into AGENTS.md. **Leave out** the Roundtable agent command, debate flow and public-only document restriction. |
| [CLAUDE.md](https://github.com/prplkane/roundtable-dev/blob/48dadaebbf45f79dee1522a81d88ede6f8feccf3/CLAUDE.md) | Repeats a subset of agent rules for Claude Code. | **Leave out** the duplicate file. Keep one canonical AGENTS.md; the existing global Git guard excludes CLAUDE.md from commits. |
| [CONTRIBUTING.md](https://github.com/prplkane/roundtable-dev/blob/48dadaebbf45f79dee1522a81d88ede6f8feccf3/CONTRIBUTING.md) | Defines small changes, dependencies, offline tests, PR explanations and maintainer authority. | **Adapt** into CONTRIBUTING.md, engineering style and review checks. **Leave out** the one-server/one-page structure, blanket issue-before-change rule and exact approval/CI promises. |
| [SECURITY.md](https://github.com/prplkane/roundtable-dev/blob/48dadaebbf45f79dee1522a81d88ede6f8feccf3/SECURITY.md) | Explains Roundtable's data, credential, tool-isolation, server and export boundaries. | **Adapt** truthful boundary reporting and synthetic private vulnerability reports. **Leave out** its HTTP token, seat restrictions, quota reads, transcript/export rules and provider guarantees. AgentLink gets its own SECURITY.md. |
| [.github/CODEOWNERS](https://github.com/prplkane/roundtable-dev/blob/48dadaebbf45f79dee1522a81d88ede6f8feccf3/.github/CODEOWNERS) | Identifies the maintainer for review. | **Choose** the ownership pattern. State that enforcement depends on actual hosted rules; do not claim a file alone protects main. |
| [.github/pull_request_template.md](https://github.com/prplkane/roundtable-dev/blob/48dadaebbf45f79dee1522a81d88ede6f8feccf3/.github/pull_request_template.md) | Asks for the problem, new behavior, checks and review notes. | **Adapt** a short PR template, keeping actual results and footprint/privacy checks. Replace product-specific document names and the ban on engineering records. |
| [docs/workflow.md](https://github.com/prplkane/roundtable-dev/blob/48dadaebbf45f79dee1522a81d88ede6f8feccf3/docs/workflow.md) | Operates providers, debate seats, agent reviews, questions, quotas and exports. | **Leave out** the product workflow. Its CLI-first recommendation applies to using Roundtable, not to implementing a new AgentLink engine. |
| [internal/README.md](https://github.com/prplkane/roundtable-dev/blob/48dadaebbf45f79dee1522a81d88ede6f8feccf3/internal/README.md) | Describes the private-to-public exporter, persona conversion and history/privacy checks. | **Adapt** staged/tracked inspection and noreply commit hygiene. **Leave out** the exporter/persona tooling and a separate public repository until requested. |
| [LICENSE](https://github.com/prplkane/roundtable-dev/blob/48dadaebbf45f79dee1522a81d88ede6f8feccf3/LICENSE) | MIT terms and copyright notice. | **Retain** the notice for adapted guidance in docs/licenses/roundtable-MIT.txt; it does not replace AgentLink's chosen root license. |

Roundtable intentionally excludes engineering notes from its public tree.
That blanket restriction conflicts with this request for a private shared
ledger and a selection review. AgentLink therefore keeps compact sanitized
engineering records while excluding raw logs, private paths and user data.

## Career Hub

Career Hub contributes the canonical agent entry point, bounded working style,
risk-based verification and durable cross-agent task records.

| Source document | What it does | Choice for AgentLink |
|---|---|---|
| [AGENTS.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/AGENTS.md) | Defines builder style, scope, tests, ledger claims and handoffs. | **Adapt** into AgentLink's canonical AGENTS.md. **Leave out** Data Home/JD/Vault rules, app audit commands, fixed final-response sections and the blanket one-follow-up-wait limit. |
| [CLAUDE.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/CLAUDE.md) and [GEMINI.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/GEMINI.md) | Point vendor tools to the canonical AGENTS.md instead of duplicating policy. | **Choose the single-source principle**, but **leave out tracked vendor entry files** for now. Direct each coding tool to AGENTS.md; any local bridge file stays local. |
| [CONTRIBUTING.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/CONTRIBUTING.md) | Covers prerequisites, branches, verification, ledger, dependencies and releases. | **Adapt** reviewable changes, docs-with-code and explicit results. **Leave out** Go/Electron builds, browser checks, installer/update-feed releases and its version tooling. |
| [engineering_rules.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/process/engineering_rules.md) | Gives general engineering rules plus Go, browser, YAML, SQL and file safety details. | **Adapt** small functions, bounded input, explicit errors, side-effect ownership and file safety into engineering.md. **Leave out** Go packages, UI tokens, SQLite and domain APIs. |
| [workflow_rules.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/process/workflow_rules.md) | Maps change risk to tests and defines compact verification receipts. | **Adapt** into workflow.md with AgentLink commands. **Leave out** app command examples and rigid time/action budgets that have not been measured here. |
| [testing_strategy.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/process/testing_strategy.md) | Explains observable outcomes, isolation, test tiers, recovery and local/hosted coverage. | **Condense** the general testing principles into workflow.md. **Leave out** the extensive browser/Go/Electron fixture inventory, migration references and exploration tooling. |
| [engineering_work_ledger.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/process/engineering_work_ledger.md) | Tracks owner, scope, states, decisions, checkpoints and handoffs through Backlog.md and Git. | **Adapt** the coordination model into docs/work/. **Leave out** Backlog.md installation, scripts, browser board, old tasks, milestones, fixed WIP quotas and mandatory status-only publishing. No coordination daemon is added. |
| [review_checklist.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/process/review_checklist.md) | Checks scope, dependencies, tests, recovery, privacy and resume selection. | **Adapt** the engineering checks into review-checklist.md. **Leave out** resume selection and experience-bullet checks. |
| [task_template.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/process/task_template.md) | Records outcome, boundaries, files, acceptance and verification. | **Adapt** a smaller task-template.md. Replace product test commands; avoid a mandatory long final-response format. |
| [small_model_playbook.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/process/small_model_playbook.md) | Keeps model tasks bounded and defines exact JD/skills vocabulary handling. | **Adapt only** bounded context, small reversible changes and truthful results into engineering.md. **Leave out** the skills catalogue, JD matching and candidate-evidence rules. No duplicate playbook is added. |
| [SECURITY.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/SECURITY.md) | Defines current-version reporting, synthetic reproductions and security scope. | **Adapt** those general principles. **Leave out** Career Vault specifics and its five-business-day response promise. |
| [agent_workflows.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/guides/agent_workflows.md) | Describes the native application's connection files, scoped tokens, nine product commands and workflow audits. | **Leave out** the entire application interface. AgentLink uses standard ACP and already has its own management CLI. |
| [model_context.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/reference/model_context.md) | Describes job-specific evidence/context packets; marks its old Python commands as retired. | **Leave out** both the engine-specific packet format and stale commands. |
| [acceptance_registry.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/process/acceptance_registry.md) | Tracks implemented/planned Career Hub product capabilities. | **Leave out** its capability catalogue. AgentLink's README, architecture, tests and real-agent validation notes remain its current sources. |
| [m2_release_acceptance.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/docs/process/m2_release_acceptance.md) | Qualifies a Windows installer/update milestone and notes unavailable private Actions compute. | **Leave out** release IDs, installers and qualification machinery. Use the compute note only to choose a conservative hosted-test default, not as proof of today's account status. |
| [.agents/skills/career-hub-assess-job/SKILL.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/.agents/skills/career-hub-assess-job/SKILL.md) | Assesses jobs and handles evidence/vocabulary through the native service. | **Leave out** the product skill and commands. |
| [.agents/skills/career-hub-tailor-resume/SKILL.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/.agents/skills/career-hub-tailor-resume/SKILL.md) | Selects bounded resume context and proposes evidence-backed edits. | **Leave out** the product skill; retain only the general principle that no change can be the correct answer. |
| [.agents/skills/career-hub-write-application/SKILL.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/.agents/skills/career-hub-write-application/SKILL.md) | Drafts application text and controls saving/rendering/submission boundaries. | **Leave out** the product flow and stylistic bans intended for cover letters. Use plain factual technical writing in AgentLink. |
| [.agents/skills/career-hub-audit-workflows/SKILL.md](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/.agents/skills/career-hub-audit-workflows/SKILL.md) | Compares skill contracts with mapped Career Hub source and commands. | **Leave out** the Python audit and mappings. Preserve the general rule that a review signal does not require an edit. |
| [LICENSE](https://github.com/prplkane/career-hub-dev/blob/a9290dee61c56bf39fd16ca64d9c771c256d86dd/LICENSE) | Standard Apache-2.0 license text. | **Choose** Apache-2.0 for AgentLink and retain adaptation provenance in NOTICE. Repository visibility remains private. |

## What the adapted files do

| AgentLink file | Purpose |
|---|---|
| [AGENTS.md](../../AGENTS.md) | Shared instructions, scope, trust boundary, verification and handoff |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | Human/agent development and PR workflow |
| [engineering.md](engineering.md) | Small implementations, bounded context and clear technical writing |
| [workflow.md](workflow.md) | Risk-based test selection and honest verification receipts |
| [review-checklist.md](review-checklist.md) | Compact handoff checks |
| [task-template.md](task-template.md) | Reusable task structure |
| [work ledger](../work/README.md) | Owners, progress, files, decisions and handoffs without a new tool dependency |
| [SECURITY.md](../../SECURITY.md) | AgentLink-specific security boundary and private reporting |
| [.github/pull_request_template.md](../../.github/pull_request_template.md) | Outcome, validation and reviewer context |
| [NOTICE](../../NOTICE) | Source-project attribution and notices |

No original engine code, provider implementation, existing task history or
personal application/debate data was moved. Development instructions and the
ledger are excluded from the runtime npm package.
