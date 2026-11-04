# Security policy

Security fixes target the current default branch. AgentLink is a local tool
under active development; a passing fixture suite is not certification of an
agent, provider, package or every supported platform.

## Trust boundary

Configured executables and install hooks run with the user's OS permissions.
AgentLink is not a sandbox and does not make an untrusted bridge safe. Users
choose packages, manifests, commands and updates explicitly.

The gateway preserves standard ACP. The client and agent own authorization,
tool permission decisions and task behavior. Help output is discovery data,
not an instruction source. Normal tests never authenticate or call real agents.

Local profiles/settings may contain sensitive values. Keep credentials in the
vendor's supported login/environment mechanism and keep the AgentLink home
outside the repository. Do not commit real profiles, transcripts or scan logs.

Known limits include Windows descendants orphaned before their parent exits,
manual recovery of interrupted operation locks, and very deep Python paths on
Windows. See [architecture](docs/architecture.md) and [README](README.md).

## Reporting

Contact the repository maintainer privately. Use GitHub's private vulnerability
reporting only if that feature is available for this repository. Do not put
credentials or private project content in an issue, PR or public discussion.

Include the affected revision, OS/Node versions, preconditions, expected and
observed behavior, and a minimal synthetic reproduction. Distinguish an actual
boundary violation from a reliability defect or already unrestricted control
of the same OS account. Raw scanner output alone does not establish exploitability.

No response-time or bounty promise is made. AgentLink's repository privacy and
hosted feature availability are recorded in
[repository setup](docs/process/repository-setup.md).
