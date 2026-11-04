# Review checklist

- The change solves the requested problem and preserves AgentLink's ACP scope.
- Runtime dependencies, startup work and retained files have a justified cost.
- Permissions, process lifetime and persistent state have relevant failure checks.
- Protocol output is clean; credentials and real user data are absent from the diff.
- Tests cover observable behavior; expectations were not weakened to obtain a pass.
- Commands/results and unavailable coverage are recorded honestly.
- Behavior, configuration and release documentation match the implementation.
- The work record, changed paths and handoff are current.

Adapted from both projects' review guidance. Career Hub's resume-selection checks
and Roundtable's debate/export assumptions do not apply here.
