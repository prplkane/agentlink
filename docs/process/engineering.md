# Engineering and writing style

Make the smallest maintainable change that solves the current problem. Read
the existing owner and consumers before adding an abstraction. Prefer Node's
standard library; a dependency needs a concrete benefit and maintenance cost
in the PR. AgentLink's runtime currently has no npm dependencies.

Keep connection startup independent of installers, discovery, provider recipes
and developer tooling. Use argument arrays with no shell interpolation for
agent launches. Keep protocol bytes on stdout and diagnostics on stderr.
Expose agent capabilities and errors rather than silently inventing support.

Validate inputs at boundaries, bound external data, propagate cancellation and
keep process ownership explicit. Persistent changes need failure recovery and
tests of observable saved state. A failed write is not automatically safe to
retry. Never silently discard an unexpected error or weaken a failing assertion.

Use temporary synthetic homes for tests. Profiles, credentials, package caches,
transcripts and real project files are user data. Do not move them into this
repository or operate on them as test fixtures. Preserve unrelated local edits.

Use plain language in comments, docs, PRs and final reports. State the result,
the reason, the evidence and any material gap. Use concrete commands and stable
error codes. Do not claim a source, test result or permission that was not observed.
No change is a valid review result; there is no quota of edits or recommendations.

Read only context that can change the decision. Keep tool output bounded,
summarize passing checks and inspect verbose output when investigating a failure.
Stop repeating checks when neither inputs nor unresolved evidence changed.

Adapted from Career Hub's general engineering rules and bounded-work guidance,
and Roundtable's small-project contribution principles. Project-specific
backend, browser, database, resume and debate instructions were removed.
