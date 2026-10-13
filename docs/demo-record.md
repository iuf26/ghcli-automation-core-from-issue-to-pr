# Demo execution record

## Real Windows run

The sections below record the original live workflow deliveries. Subsequent
review fixes and current branch validation are recorded under
[Post-review repairs](#post-review-repairs); old run hashes are not approvals
for the updated code. [Fresh repaired-code rehearsals](#fresh-repaired-code-rehearsals)
record the later successful headless skill invocations.

On 10 October 2026, the actual Copilot CLI 1.0.93-1 ran the persisted project
extension in a fresh process on the user's Windows PC. GitHub CLI authentication,
Node.js 24.13.0, and repository access were available. No internal MCP service
was used.

| Artifact | Actual result |
| --- | --- |
| Scaffold | PR #4, open, targets `main` |
| Bug ticket | Issue #1, still open |
| Student ticket | Issue #3, overdue task view |
| Feature ticket | Issue #2, capacity comparison |
| Linked implementation | PR #5, open, `Fixes #1` |
| Demo commit | `54f13d1459dd4c93485d75c6d158e051ae16a24c` |
| Reviewed scaffold base | `33eccf158ddc6371976d760e626ef28efb663faa` |
| Successful workflow | `5f19d9bf-ee45-4190-b672-42ac4cadf502`, `ready_for_pr`, zero revision rounds |

The demo PR explicitly targets the approved scaffold branch,
the unmerged scaffold branch. No code was pushed directly to `main`, neither PR
was merged, and the issue was not closed. The repository remains private by the
owner's choice.

## What actually executed

The skill/runbook was read, and the version-controlled project extension was
loaded by a new CLI process, not recreated as a session-only workflow.
The direct workflow command was:

```powershell
$env:GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS = "true"
copilot --experimental --allow-tool=read --allow-tool=search --allow-tool=write --disable-builtin-mcps workflow run issue-to-pr --args @.demo-runs\input.json --result-file .demo-runs\result.json
```

The reviewed input selected issue `1` and the approved scaffold branch as `base`.
Commit identities below retain execution provenance; account-specific repository
URLs and branch names are omitted from this public-facing record. Issue/PR
numbers refer to that original repository, not an unrelated copy.
The explicit environment opt-in loaded trusted project JavaScript; it did not
grant additional GitHub permissions. The command exited 0 and its current
result was `ready_for_pr`.

The actual workflow performed parallel code/documentation discovery, aggregated
evidence, validated a two-task plan, and implemented its tasks sequentially.
The plan corrected remaining effort and added planner regressions, then added
CLI output coverage and updated the seeded-bug note. The independent project-fit
and engineering-quality judges both returned **pass**, with no findings.
Native check subprocesses then passed.

The outer delivery agent followed the skill's publication boundary: verified
branch/HEAD, live issue freshness and diff hash, inspected the four-file diff,
committed only those files, pushed the feature branch, created the linked PR
using the repository template, and verified its live base/head.
The direct workflow did **not** itself commit or open the PR.

| Executable evidence | Result |
| --- | --- |
| `node --test` inside the actual workflow | Exit 0, 19/19 tests |
| `node scripts\check.mjs` inside the actual workflow | Exit 0, syntax/skill metadata passed |
| `node --test tests\planner.test.mjs tests\cli.test.mjs` | Exit 0, 9/9 tests |
| `node src\cli.mjs summary examples\tasks.json` | Exit 0, total 3, completed 1, remainingMinutes 150 |
| All-done and empty project assertions | Passed, remainingMinutes 0 |
| `git diff --check` | Exit 0 |
| `node scripts\report-hash.mjs` before staging | Matched `7eaed9b746b389ddbaf3fbc8bb6fd005414110311a51bea7865a95b471f20aa6` |

Changed implementation files: `src/planner.mjs`, `tests/planner.test.mjs`,
`tests/cli.test.mjs`, and `README.md`. The baseline was reproduced as 240
remaining minutes before the run; the actual corrected sample is 150.
This is real agent/GitHub execution evidence, distinct from deterministic unit
tests using fake agent outputs.

## An observed failure, not a hidden workaround

The first real run, `e9e877a8-e616-436b-8240-fcc69691360e`, returned **blocked**
after its one allowed revision. Both critics passed, but the extension used
`process.execPath` to run tests. In the bundled CLI host that executable is
Copilot, so it rejected `--test` and the check script arguments.

Direct shell tests passed, but those passes did not override the blocked gate;
no PR was published from that run. The scaffold was repaired to invoke `node`
from PATH and a regression test was added. The blocked diff/report were
preserved locally, and a clean repaired-base run generated the implementation
afresh. No stale journal was resumed or old code silently reapplied.

The CLI process can exit 0 with a workflow result of `blocked`; always inspect
both process outcome and the current result's status. An old result file is not
evidence for a new failed run.

## Second issue class: architecture design

The same committed skill/registered extension was executed in another fresh
CLI process for issue #6:
a campus study-room booking architecture, rather than an application bug.
No title-specific route or orchestration/configuration change was added.

The actual output is
PR #7,
open and stacked on the same unmerged scaffold. Its commit is
`3aa8b6ee571c34782d1c21784f103fff7aac8fe7`. Issue #6 remains open.
The adaptive planner chose `docs/study-room-booking.md` and
`tests/study-room-booking-doc.test.mjs` as two sequential tasks.

Successful actual run `a1e8aca6-e4f5-400a-80e5-ab8b0eb81558` returned
`ready_for_pr` with one revision. Both final independent critics passed with
no findings. The revision addressed PostgreSQL UUID/GiST prerequisites and
privileges, same-key idempotency reservation/locking/fingerprint/replay, and
a structure assertion. The proposal includes requirements/assumptions,
components and Mermaid authentication boundary, users/rooms/bookings model,
timezone handling, atomic half-open interval conflict enforcement, minimal
roles/ownership/privacy, API examples and trade-offs.

| Architecture executable evidence | Result |
| --- | --- |
| `node --test tests\study-room-booking-doc.test.mjs` | Exit 0, 7/7 structure checks |
| `node --test` | Exit 0, 23/23 tests |
| `node scripts\check.mjs` | Exit 0, syntax/skill metadata |
| `git diff --cached --check` | Exit 0 |
| Pre-staging report hash | Matched `d56e77097734fc3942aa0d6ff1a500165b8bcea5daf0ae4723ce1b161dbba135` |

The reviewed base was `b4ad12f874947175d579a592f857e4be3a0a48f2`.
The branch/HEAD, hash and issue updatedAt matched before publication.
Only the architecture document and its structure tests changed; the planner and
its seeded bug behavior were not modified by this design PR.

An earlier architecture run, `f19853fe-6c4a-43aa-aa39-048173f70c6c`, was blocked
after one revision because a whitespace-sensitive assertion failed on Markdown
line wrapping, despite both critics passing. No PR was published from that
gate. Its output was preserved locally. One separately authorized clean fresh
attempt incorporated the observed failure through a narrow issue comment;
it did not resume stale output or restore the old files.

The document tests check structure, not architectural correctness. PostgreSQL
schema/concurrency behavior was not executed against a database, and Mermaid
rendering was not validated by a renderer. No service or infrastructure was
deployed. Human architectural review remains required.

## Reuse and remaining human boundary

Both successful commands loaded the committed extension in fresh CLI processes,
demonstrating persistence beyond the authoring session and reuse across two
different issue classes. This is not proof that the core solves arbitrary tasks.
Student issue 3 remains available for a third exercise on a new isolated branch
using the Windows setup in the README; it is not claimed as already executed.
The original live runs above used `workflow run` plus the outer skill delivery
steps, not a single headless parent prompt. The later rehearsals below
independently exercised the documented `-p` skill entry point.

Only human review and an explicit merge decision remain. To reach a public
audience later, the owner must separately decide on repository visibility.
Neither visibility changes nor merges are performed by this demo.

## Post-review repairs

A second review reproduced two defects that the original tests did not cover.
Both were fixed on the existing scaffold PR, then inherited by both demo PRs
through normal Git merges, without rebasing, force-pushing or merging a PR.

**Canonical file scope:** The old lexical guard accepted an approved
`src/linked.txt` path reached through a Windows junction into an out-of-plan
directory. The repair validates the real repository root and each existing
path component with `lstat`/`realpath`; symlinks/junctions are rejected before
context discovery, task assignments, evidence reads and checks. Prospective
output parents, including empty linked directories, are checked. Standalone
evidence/hash collection has the same root audit, and report output cannot follow
a junction in the ignored report directory.

The original Windows junction reproduction now throws
`Symlink/junction path is not allowed: src/linked.txt` before reading evidence.
Regression tests also cover a junction outside the repository, ordinary
existing files, missing nested output paths and a nested working directory.

**Aggregate precision:** Individually valid estimates of
`Number.MAX_SAFE_INTEGER` and `2` previously produced an incorrect rounded
total. Shared `sumMinutes` now detects overflow before adding. The CLI reports
`Cannot process tasks: Total task minutes exceed the safe integer range.`,
returns exit 1 and writes no success JSON. The bug-fix branch filters completed
tasks before summation: all-done large estimates yield 0, done maximum plus
unfinished 2 yields 2, and an exact safe-boundary total succeeds.
The deliberately seeded completed-task behavior remains only on the scaffold
and architecture branches; it is still corrected by PR #5.

| Current validated code | Commit / outcome |
| --- | --- |
| Shared scaffold repairs | `55c0ba833dd4cded68cf80207ca4753596b9fcdb` and `7d0767b936b299f434c20bb56e28dca4121c85ba` |
| Scaffold `node --test` | 28 tests: 27 passed, 0 failed, 1 skipped |
| Bug PR #5 head | `f1948b4c70addf4c8bdeaa4e55b41556cc9638d9` |
| Bug PR #5 `node --test` | 32 tests: 31 passed, 0 failed, 1 skipped |
| Architecture PR #7 head | `e670c39199f47240f4fb9ed3c784941933bc252d` |
| Architecture PR #7 `node --test` | 35 tests: 34 passed, 0 failed, 1 skipped |
| Both final PR changes together in a disposable local fixture | `node --test`: 39 tests, 38 passed, 0 failed, 1 skipped |
| Combined `node scripts\check.mjs` | Exit 0, JavaScript syntax and skill metadata passed |
| Combined sample summary | Exit 0, total 3, completed 1, remainingMinutes 150 |

Each final PR head contains the shared repair commits. The combined fixture
applied only the architecture document/test additions to the final bug branch
and was removed afterward; neither GitHub PR was merged. The committed extension
was reloaded successfully after the changes. The original full agent workflows
were not rerun after these manual repair commits: the table records new native
regression/combination checks, not new agent verdicts or reusable old diff hashes.

The single skipped test is file-symlink creation denied by Windows `EPERM`
without Developer Mode/elevation. All Windows directory-junction regressions ran
and passed. No permission elevation was requested. The guards are runtime
preflight/reinspection checks, not OS sandboxing: do not run concurrent editors
or path-mutating processes, and do not treat them as protection against
filesystem races or hard-link aliasing. Architectural/DB/Mermaid limitations
above remain unchanged.

## Fresh repaired-code rehearsals

On 10 October 2026, two fresh Copilot CLI **1.0.96-2** processes invoked the
installed `issue-to-pr` skill against scaffold commit
`a0438b4f1675c4b7824f30ed1c5c3810be31349d`. Node.js was **24.13.0**.
Each case used a clean disposable worktree at that exact approved base, with
one workflow attempt per issue. No previous journal or generated implementation
was resumed, copied into an input worktree, or used as readiness evidence.

Both parent transcripts contain `skill {"skill":"issue-to-pr"}`, reads of the
persisted skill/runbook, inspection of the registered workflow, and one
`run_dynamic_workflow` call with the existing issue number and explicit scaffold
base. The extension executed real discovery, planning, sequential implementation,
independent critique and native checks. Neither parent recreated the workflow.
The baseline sources were authenticated `gh` and local files; the transcripts
contain no MCP tool calls. Unrelated personal MCP servers were available to the
CLI environment, so this is evidence of no dependency on them, not evidence that
all personal servers were disabled.

The launcher used a fresh `copilot --no-auto-update --experimental -C WORKTREE
--add-dir SCAFFOLD -p PROMPT --allow-all-tools --disable-builtin-mcps
--no-ask-user --output-format=json` process per case. The trusted-extension
environment opt-in was set in the same PowerShell process. Additional deny
rules covered `git push`, `git commit`, PR creation/merge and issue creation/close,
including the dedicated creation tools. The prompt explicitly required the
skill and one registered workflow run, authorized only local implementation
and checks, and stopped at verified readiness. It prohibited staging,
publication and changes to the existing issues/PRs. Both parent processes
exited **0**; readiness was verified from the new workflow reports, not inferred
from that exit code.

| Current-code rehearsal | Bug, issue #1 | Architecture, issue #6 |
| --- | --- | --- |
| Fresh run ID | `22d70958-0026-4e5b-87a6-df6afd3b71c2` | `de4d7aa3-6238-4af8-82d8-9dd6220a870c` |
| Worktree branch | `dev-days-rehearse-bug-a0438b4` | `dev-days-rehearse-design-a0438b4` |
| Result | `ready_for_pr` | `ready_for_pr` |
| Revision rounds | 0 | 1 |
| Final Project fit / Engineering quality | Both pass; no findings | Both pass; no findings |
| Native `node --test` | Exit 0: 31 tests, 30 passed, 1 skipped | Exit 0: 36 tests, 35 passed, 1 skipped |
| Native `node scripts\check.mjs` | Exit 0, syntax/skill metadata passed | Exit 0, syntax/skill metadata passed |
| Live issue `updatedAt`, matching report | `2026-10-10T13:55:51Z` | `2026-10-10T14:23:29Z` |
| Publication | Intentionally not repeated | Intentionally not repeated |

The bug plan selected two sequential tasks: planner/filter regressions, then CLI
coverage and README correction. Four files changed: `src/planner.mjs`,
`tests/planner.test.mjs`, `tests/cli.test.mjs`, and `README.md`.
The actual sample returned total **3**, completed **1**, remainingMinutes **150**.
Separate current-output assertions passed for all-done estimates of
`MAX_SAFE_INTEGER` and `2` returning **0**, done maximum plus unfinished `2`
returning **2**, and an exact safe-boundary sum. Unfinished maximum plus `2`
threw; an actual CLI subprocess returned **1**, empty stdout and the explicit
safe-integer-range error. The original precision defect did not recur.

The architecture plan selected the proposal and its structure tests, not
application edits. Only `docs/study-room-booking.md` and
`tests/study-room-booking-doc.test.mjs` changed. Its first critique found an
inconsistent retry contract: rollback of a conflict did not explain how its
promised response replay was durable. The single permitted revision specified
atomic successful outcomes, separate terminal-conflict persistence, lease-based
in-progress recovery and non-replayed transient failures; it strengthened the
structure tests and whitespace handling. Final critics passed and all **8**
document checks passed within the full native suite. These are a newly generated
proposal and checks, not the previously published PR #7 files.

The parents and an independent verifier checked branch, unchanged baseline HEAD,
live issue freshness and current tree evidence before stopping. The fresh hashes
matched `node scripts\report-hash.mjs`:

| Rehearsal | Reviewed/current diff SHA-256 |
| --- | --- |
| Bug | `0a434200cf6a80ab6986ad9638328cf7a56124d19c46609ccacea677f3e6889a` |
| Architecture | `44b5c8c7ac0ab0528b1b8260d4e23ddb78424d7f861e2d8c5814b07f9a52ecff` |

The independent verifier used the same canonical-root evidence collector and
confirmed exactly one new report identity per worktree. A third disposable
fixture combined only these two fresh outputs on the same scaffold:
`node --test` exited **0** with **39** tests, **38** passed and **1** skipped;
`node scripts\check.mjs`, sample summary and `git diff --check` each exited **0**.
The overflow/done-filter assertions also passed on this combination.
All directory-junction/root/report-path regressions ran and passed during these
actual workflow checks. The one skip remains Windows file-symlink creation
denied by `EPERM`; it is not a skipped junction regression.

Reports, parent JSONL transcripts, the fresh bug diff, generated design files
and combination output were preserved locally under the ignored
`.demo-runs\fresh-rehearsal-evidence-a0438b4` directory. These records are local
execution evidence, not a portable checked diff for another commit or a
publication approval. The disposable worktrees were removed after preservation.

No repair-caused orchestration blocker occurred. No duplicate issue or PR was
created, and the existing demo PR contents/heads were not changed for these
rehearsals. PR #5 and PR #7
remain the historical real linked publication evidence. Both issues remain open,
all three PRs remain open, and the repository remains private.
The scaffold receives only this execution-record update, not either rehearsal's
generated implementation.

### Repeat locally without duplicate publication

Use an authenticated clone with Node.js 22+, `git`, `gh`, and a workflow-capable
Copilot CLI. Review the extension before enabling it. Disable unrelated
personal MCP servers/configurations as described in the
[runbook](../skills/issue-to-pr/references/runbook.md). From the scaffold checkout:

```powershell
gh auth status
copilot --no-auto-update --version
copilot skill add .\skills
copilot skill list
git fetch origin
$base = gh pr view 4 --json headRefName --jq '.headRefName'
# After the scaffold lands, use the repository default branch instead.
git worktree add -b demo-bug-rehearsal .demo-runs\local-bug $base
Set-Location .demo-runs\local-bug
$env:GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS = "true"
copilot --no-auto-update --experimental -p "Use the issue-to-pr skill for issue 1 against $base. Run the persisted registered workflow once. Local editing and checks are authorized. Stop at verified ready_for_pr; do not stage, commit, push, create or edit issues or PRs, merge, or close anything. Use gh and local sources, not MCP tools. Preserve/report any blocked result; do not retry outside the workflow's one revision." --allow-all-tools --deny-tool="shell(git push:*)" --deny-tool="shell(git commit:*)" --deny-tool="shell(gh pr create:*)" --deny-tool="shell(gh pr merge:*)" --deny-tool="shell(gh issue close:*)" --deny-tool=create_pull_request --deny-tool=create_issue --disable-builtin-mcps --no-ask-user
Remove-Item Env:GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS
```

For the architecture case, create a separate clean worktree from the same base,
use a different branch/directory, and replace issue `1` with `6`. Never run both
editing workflows in one worktree. These commands use the then-current scaffold;
the exact SHA above identifies this recorded rehearsal, not future runs.
Inspect the new `.demo-runs\RUN_ID.json`, require `ready_for_pr`, and follow
the runbook's freshness/hash verification. A `blocked` result is not deliverable.
Broad tool permission and deny rules are not an OS sandbox. The path guards
still do not cover filesystem races/hard-link aliases. Automated document checks
and passing critics still do not prove architecture, database concurrency,
security or Mermaid rendering. Two successful issue classes demonstrate reuse,
not correctness for every possible issue.

## Focused agent profiles after the rehearsals

The profiles were subsequently renamed to `context`, `implementer` and `critic`.
Their instructions now spell out each discovery area, read-only planning versus
file-scoped execution, requirement-by-requirement business-fit review, and
technical correctness/regression review. The workflow references these names;
the two independent critic calls and bounded revision remain unchanged.

New regressions verify the profile routing in initial and revision rounds,
delivery of the original issue/comments to both critics, and read/search-only
tools for context and critique. `node --test` passed with 30 tests: 29 passed,
one expected Windows file-symlink permission skip. `node scripts\check.mjs`
passed. These are deterministic checks, not a new live agent rehearsal.
The earlier run IDs above used the previous profiles and do not establish how
the revised instructions affect agent judgment. Per-requirement evidence is an
agent instruction, not mechanically validated completeness.

## Required Rubber duck consultation

The installed CLI 1.0.96-2 command help lists `/rubber-duck`. The first integration
instructed the critic to consult the built-in agent through its delegation tool.
A required
`rubberDuck.status` and nonempty evidence array are checked by the workflow;
missing/unavailable consultation stops the gate rather than silently passing.
This validates reported evidence, not the truth of a tool invocation.

A fresh read-only `copilot --agent critic -p` integration check actually invoked
`task` with `agent_type: "rubber-duck"`, waited for its critique, reread the
approved planner/CLI source and tests, and assessed its findings. The process
exited 0. Its scope was safe-integer aggregation and explicit CLI failure output,
not a whole issue-to-PR run. The transcript is retained only in ignored local
evidence. This is real consultation evidence, not an assumed automatic call.

After this change, `node --test` passed with 31 tests: 30 passed and one expected
Windows file-symlink permission skip. Existing revision, blocking critique,
failed-check, path-scope and precision regressions passed; new cases reject
missing, unavailable or malformed consultation evidence. Syntax/skill metadata
checks passed. The earlier workflow runs retain their original evidence; this
extra review was not retroactively claimed for them.

The subsequent real registered-workflow check,
`6bec9636-6e23-4f45-a348-fed781f49e50`, exposed a host/agent difference:
isolated workflow critics did not have `rubber-duck` in their delegation catalog,
even though the ordinary CLI critic check above did. The workflow stopped with
`Project fit lacks completed Rubber duck consultation evidence`; no PR or
readiness result was produced. Its output and log were preserved locally, not
silently treated as successful.

The final integration keeps critic as a `ctx.agent` subagent. Each critic requests
the actual consultation in structured output with lens-specific focus questions;
the workflow executes the supported slash command with a guarded review packet.
Assessment-stage critic subagents receive the requests and actual returned
critique. The two requests share one consultation per round.
Shell/edit/write tools are denied in that subprocess. Failed commands,
empty/oversized output, a changed diff, a skipped tool request or missing
assessment evidence fail closed. Reporting completed JSON alone does not
satisfy the gate.

A tool-bridge attempt was also stopped after isolated critic sessions issued
tool calls but received no results. It is not claimed as a successful review
and is not used by the final implementation. Request and assessment are now
separate supported subagent calls; conversation memory is not assumed between
them.

The first structured-request run,
`536e3426-33ef-4b9c-89c6-0e9946119fed`, also stopped correctly: the native
consultation used a relative packet path, and its reviewer tried to resolve
that path outside the approved fixture. It reported no completed review, and
both assessment critics rejected it. The repair passes the exact canonical
absolute packet path and approved repository root to the slash command.

The final fresh registered-workflow run,
`2a347f0e-cc97-4e32-8063-43af147b925e`, started from
`9afe06aaf1fb47b097224d41e58bb9c3ee8f9c48` for issue 1 and returned
`ready_for_pr` with no revision. Both request-stage critic subagents supplied
their focus questions. The actual read-only CLI `/rubber-duck` consultation
completed, and both assessment-stage critics independently checked its cited
claims and returned `pass` with completed consultation evidence. Optional
future-status/test-strength suggestions were not treated as invented blocking
requirements.

| Final verification | Result |
| --- | --- |
| Native checks inside the fresh workflow | `node --test`: 37 tests, 36 passed, 1 expected Windows file-symlink skip; syntax/skill metadata passed |
| Independent final report verification | Branch/HEAD, live open issue timestamp and reviewed diff hash matched |
| Fresh generated sample | total 3, completed 1, remainingMinutes 150 |
| Latest scaffold regression suite | 34 tests, 33 passed, 1 expected skip |
| Latest runtime combined with the existing published bug/design outputs | 45 tests, 44 passed, 1 expected skip; syntax/metadata, sample 150 and whitespace checks passed |
| Public tracked-source audit | 24 files checked; no selected company/account identifiers, local user paths or credential signatures found |

The fresh reviewed hash was
`2750055237ee1e9fda4957662165d51f61a52d9cd2920c8cb1fa130f94d743a3`.
The check stopped before publication to avoid a duplicate issue-1 PR. Existing
PRs were not merged or rewritten, and no issue was closed. Failed and stopped
attempts and the successful report remain in ignored local evidence.
This verifies the revised orchestration on the bug issue, not a new architecture
agent run or a CI deployment. The combined checks preserve existing published
application/design behavior; they do not execute database concurrency or prove
review completeness.

## Critic coordination and three-cycle feedback

The revised workflow separates review coordination from specialist review.
`critic` supplies bounded assignments for `requirements-reviewer` and
`engineering-reviewer`; the host runs them in parallel and returns both reports
to the critic. The critic aggregates their findings. Only then does the main
workflow request actual CLI Rubber duck critique and reconcile both sources in
one default-agent decision call. There is no second pair of specialist reviews
after Rubber duck.

At most three total implementation/review cycles are allowed, including the
initial attempt. Each revision gets specialist, critic, Rubber duck and check
feedback. Both aggregation boundaries preserve original reviewer identities,
verdicts and exact unresolved findings. Dropped blockers, missing assessments
or mutated reviewed trees fail explicitly. Reported Rubber duck assessment is
fallible evidence, not proof that every concern was interpreted correctly.

The final scaffold suite passed: `node --test` reported 41 tests, 40 passed,
one expected Windows file-symlink permission skip. Syntax/skill metadata passed.
Combined with existing published bug/design outputs, 52 tests reported 51 passed
and the same skip; syntax, whitespace and sample 150 checks passed.
Tests exercise true concurrent reviewer start/fan-in, critic-only blockers,
main-decision blockers, three complete cycles, confirmed Rubber duck feedback,
third-cycle native review packets and host-assigned identity preservation.
These deterministic tests do not substitute for a fresh live agent run.

A fresh registered issue-1 verification from
`3f81cadc2474ec5c352ae1c00bdb97b1409a9f96` was stopped after the
critic-coordination model call produced no further events for approximately
17 minutes. Implementation had completed, but no critic report or Rubber duck
packet was produced. This is a stopped transport attempt, not a successful
review or an executable-check failure. Its private transcript and generated
diff are preserved in ignored local evidence; no duplicate PR was published.

The public quick start was simplified to four setup steps and one user
instruction. A full review of pushed scaffold commit
`38fd45b8ec12cb8f45aee26975f2bd05850e7fb2` applied the developer rulebook and
correctness/interface/test checklist independently; both returned no significant
findings. This is an AI review, not approval by a human or a guarantee.

## Fresh student issue-to-PR delivery

The revised flow subsequently completed end to end for student issue #3,
the explicit-date overdue view. A fresh Copilot CLI 1.0.96-2 `-p` invocation
actually loaded the `issue-to-pr` skill and invoked the persisted registered
workflow. Session `eef1f030-9a5e-4634-b37d-7ffd7aa4918b` ran workflow
`272e3b49-e979-48cc-a5bf-c59883bcf7ac`, which completed with
`ready_for_pr` and `revisionRounds: 0` (one cycle, no retries).

The critic assigned both specialist reviews, they ran independently, and the
critic aggregated their passing reports. The main workflow then completed the
real Rubber duck consultation and assessed its optional test-strength suggestions
against source. Both specialists, critic aggregation and main decision passed;
no blocking finding was waived.

The outer skill verified branch/HEAD, live open issue timestamp and reviewed
diff hash before staging and after staging. It committed five approved
application/documentation/test files and used the host PR tool and repository
template to publish **PR #9**, still open and stacked on the unmerged scaffold.
Published head: `fa636302d2d9ebf7e46cc90a8af5c12946191daf`.
Reviewed base/pre-commit HEAD:
`38fd45b8ec12cb8f45aee26975f2bd05850e7fb2`.
The scaffold advanced afterward only in the separate execution record; the PR
explicitly distinguishes that live base from the historically reviewed run base.
No rebase or new-base review was claimed.

| Student delivery verification | Result |
| --- | --- |
| Workflow `node --test` | Exit 0, 48 tests: 47 passed, 1 expected Windows file-symlink skip |
| Workflow `node scripts\check.mjs` | Exit 0 |
| Independent pre-publication tests and syntax | Same passing results |
| Targeted planner/CLI tests | Exit 0, 15 passed |
| Independent committed-PR tests and syntax | Same 47 passed/1 skip; syntax/skill metadata passed |
| `node src\cli.mjs overdue examples\tasks.json 2026-10-12` | Exit 0; only the complete `review` task object |
| Existing sample summary | Still 240 on scaffold/student branch, preserving the intentional unrelated exercise |
| Reviewed diff hash | `3b7c96d0894277ee57868a62c9d7de98999810315ce0c84eaa1ea780e74be930` |

The issue remains open; neither PR was merged. Private transcripts, the real
run envelope, review packet and report remain in ignored local evidence.
The stopped issue-1 transport attempt above remains recorded as stopped;
this successful issue-3 run does not retroactively approve it.

Tracked source contains no detected company-specific/private identifiers or
credential signatures. Existing Git author email and repository/branch ownership
metadata have not been rewritten. A source-only archive excluding `.git` and
ignored logs was exported locally for public-safe distribution; no repository
visibility change or history rewrite was performed.

## Sole Rubber duck critic and selected-model rehearsal

A fresh direct workflow run on 10 October 2026 used scaffold
`96ec4dcda7f09cab84df964a504efb3116edd062`, Copilot CLI 1.0.96-2 and issue #1.
Run `b9db2a28-9c51-40cc-924b-96a0dbf653be` completed `ready_for_pr`.
All execution calls requested `gpt-5.4`. The native Rubber duck reviews
requested `gpt-6-luna`; successful built-in task delegation and that actual model
were verified from JSONL events, not inferred from the outer CLI model alone.
No custom critic, coordinator or specialist-reviewer profiles were loaded.

The run used two of the maximum three total cycles (`revisionRounds: 1`).
The main decision passed with separate project-fit and engineering-quality
evidence. Native `node --test` exited 0 with 45 tests: 44 passed and one expected
Windows file-symlink skip. `node scripts\check.mjs` exited 0.
Independent current-worktree hashing matched
`2e58720bf4ce4584448a09bb07bbc14e353f1a509b7e14560c528740494efd32`.
Only README, planner and planner/CLI tests changed. The issue remained open with
the same `updatedAt` snapshot. This was a direct engineering-flow rehearsal,
not another skill-entry or PR-publication run; no duplicate issue-1 PR was opened.

Earlier simplified-flow attempts were stopped or failed. One real review
exceeded the initial transport buffer; review transport is now separately
bounded at 16 MB while returned critique remains capped at 16,000 characters.
Another completed the correct Luna review after an initial malformed task call,
but the gate incorrectly required every attempted call to succeed. The repaired
gate requires a successfully completed Luna consultation and still rejects
wrong-model calls. Those failures were not retroactively relabeled successes.

## Prepared remote Actions entry point

`.github/workflows/issue-to-pr.yml` runs after maintainer approval or manual
dispatch. Its read-only engineering job executes the existing registered
workflow. A separate write-authorized job verifies the report, patch hash,
approved paths and issue/base freshness before publishing a PR.
The two-job transfer test used real local Git commits, a local bare push target,
tracked and new files; Copilot output and GitHub API responses were test fixtures,
not a hosted Actions run. Actionlint checked the workflow YAML successfully.
The final scaffold `node --test` exited 0 with 38 tests: 37 passed and one
expected Windows file-symlink skip. `node scripts\check.mjs` exited 0.

The original repository is personal-account-owned. Hosted execution still needs
the protected `copilot-demo` environment's `COPILOT_TOKEN`, appropriate account
access/billing, Actions PR permissions, and workflow registration on the default
branch. The scaffold is not merged, and no remote run or automatic activation
is claimed. See [remote setup](remote-automation.md).

## Corrected intended Luna model

On 11 October 2026, the user clarified that the intended reviewer is GPT-5.6
Luna. An authenticated query to Copilot's `/models` catalog returned the exact
the GPT-5.6 Luna ID now stored in the shared skill configuration, with model-picker support enabled.
An actual installed Copilot CLI request with that model selected returned
`MODEL_OK` and exited 0, without reading files or changing code. This validates
the ID and local-account access, not Actions-token or Rubber duck access.
The catalog also exposed `gpt-6-luna` for the verifying account; it was not the
user's intended selection. Account-specific model availability does not prove
access through the Actions token or explain a generic policy-denial response.

The runtime now requests and verifies the configured review model, and the remote publisher
requires that same ID. Tests explicitly reject evidence using the previous
model. Earlier recorded model selections remain historical evidence, not proof
of a fresh GPT-5.6 Luna consultation.

The real self-hosted run `1108e10c-9c26-4af9-8904-af655dd5ccdc` reached review
but received an access-policy denial before successful consultation.
Actions run `38148352296` skipped artifact transfer and publication. This model
correction is not a claim that the policy denial has been resolved; a fresh
authorized run is needed after merging. No automatic retry was launched.

Model IDs are centralized in `skills/issue-to-pr/scripts/config.mjs`.
Runtime invocation, delegation checks, execution agents and publication all
import this file. Documentation and skill metadata reference it rather than
duplicating the active review model ID.

## Issue #14: reported review denial and protected diagnostic evidence

This distinct incident concerns the attempted implementation of daily-priorities
issue #11, not the earlier run recorded above. The
[issue #14 report](https://github.com/iuliaistrate_microsoft/ghcli-automate-anything/issues/14)
identifies:

- Original Actions run:
  [38152421972](https://github.com/iuliaistrate_microsoft/ghcli-automate-anything/actions/runs/38152421972);
  failing [implementation job 114508425789](https://github.com/iuliaistrate_microsoft/ghcli-automate-anything/actions/runs/38152421972/job/114508425789).
- Run base: `2f51fa6753515955142be0fc4c2b8b34334e0ac0`.
- Dynamic workflow run: `f8b5ec20-772e-4e88-a0e8-8141877cbe52`.
- Copilot CLI: `1.0.96-2`.
- Review response: `Access denied by policy settings`.
- Denial request ID: `B267:3ADBF9:13117A0:15CF571:6ACBAF96`.

The reported self-hosted job reached Rubber duck review after startup, approval
validation and CLI installation. The response does not identify the denied
policy. Model access, token/account restrictions and Rubber duck/delegation
restrictions remain hypotheses, not established causes. The presence of
`GH_TOKEN` and `COPILOT_GITHUB_TOKEN` does not establish model or feature
authorization; the earlier local-account probe used different credentials and
does not prove Actions access.

### Maintainer-reported bounded diagnostic (12 October 2026)

The following observations are attributed to the
[maintainer comment](https://github.com/iuliaistrate_microsoft/ghcli-automate-anything/issues/14#issuecomment-6118472571),
not independently verified here from Actions logs or by rerunning probes:

- Reviewed diagnostic entry-point revision:
  `83a40c823f288ba5ddb978b057844a530de2acd7` on isolated branch
  `diagnostic/issue-14-actions-access`.
- Protected Actions run:
  [38208810666](https://github.com/iuliaistrate_microsoft/ghcli-automate-anything/actions/runs/38208810666).
- Copilot CLI: `1.0.96-2`.
- Under the same protected `COPILOT_GITHUB_TOKEN` context, one minimal read-only
  request to the configured execution-model role succeeded, and a separate
  minimal read-only request to the configured review-model role succeeded.
- Only after both successes, one bounded public-safe built-in Rubber duck
  consultation completed with the configured review model.
- No request IDs were returned for these successful probes.
- No alternate identity, model fallback, repository edit, issue #11
  implementation, publication, permission expansion or automatic retry was used.

The shared configuration at `skills/issue-to-pr/scripts/config.mjs` remains the
source of truth for both model roles; this record does not duplicate active model
IDs. Diagnostic success is not a substitute for critique of the actual feature
diff in a fresh implementation run.

### Reported publication outcome and recovery

The same maintainer comment reports that the original run's transfer/upload and
dependent publish job were skipped; no PR existed with head
`copilot/issue-11-run-38152421972-1`; and issue #11 remained open with no
close/reopen event attributable to that run. These are incident-specific reported
GitHub observations. Local simulated regression fixtures are not independent
confirmation of those observations or proof of protected-credential access.

The original denial was not reproduced in the reported bounded diagnostic.
Neither a repository-code defect nor an exact account/enterprise permission or
subscription deficiency is established. No speculative code fix or permission
expansion follows from this evidence.

Recovery is one fresh explicitly authorized issue #11 run, not resumption of
stale outputs or unlimited retries. Mandatory Rubber duck critique, project-fit
and engineering-quality evidence, the three-total-cycle cap, scope/freshness
guards and separate publishing authorization all remain required. Denied or
missing review must never yield `ready_for_pr`, a feature PR or automatic closure.
If denial recurs, preserve its new request ID and escalate sanitized evidence to
the credential owner, enterprise administrator or GitHub Support.

See the [authorized diagnostic decision path](remote-automation.md#review-access-diagnostics)
for the bounded sequence and conditional code-versus-policy response. Issue #14
stays separate from issue #11: automatically applying `copilot-approved` to this
infrastructure ticket would repeat the blocked review dependency and would not
authorize edits to trusted infrastructure. Earlier hosted-runner setup notes and
the reported self-hosted incident do not establish the current deployment
topology. This record includes no secrets, local user paths or raw transcripts.
