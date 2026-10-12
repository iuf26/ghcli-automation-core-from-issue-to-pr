# Runbook

## Contents

- [Setup](#setup)
- [Interactive](#interactive)
- [Noninteractive prompt](#noninteractive-prompt)
- [Direct workflow run](#direct-workflow-run-checked-diff-not-a-pr-yet)
- [Publication freshness](#publication-freshness)
- [Failures and resume](#failures-and-resume)
- [References](#references)

## Setup

Use Node.js 22+, Git, GitHub CLI and GitHub Copilot CLI with dynamic workflow
support. Live checks used CLI 1.0.96-2; the API is experimental.
Check `copilot workflow run --help` and enable `--experimental`.

Authenticate with `gh auth login` and `copilot login`. Never write tokens into
files. For a fine-grained GitHub token, select only the intended repository and
grant Contents read/write, Pull requests read/write and Issues read (write only
to create example tickets). Do not grant administration or workflow permissions
for ordinary demo fixes. Copilot access requires an eligible account/plan.

From this clone, run `copilot skill add .\skills` once on Windows, then
`copilot skill list`. The source of truth stays under `skills/issue-to-pr`;
do not copy only SKILL.md, because that loses its reference file.
The extension is discovered at `.github/extensions/issue-to-pr/extension.mjs`.
Agents are discovered from `.github/agents`. Start a new trusted session after
pulling changes, or ask Copilot to reload extensions and list workflows.

To reuse this in another Node.js repository, copy the whole extension directory,
the two agent profiles (`context` and `implementer`), and the complete skill. Adapt the trusted check
commands and allowed file prefixes in `workflow.mjs` to that repository before
running. This is a teachable starter, not a universal language/build framework.

The skill's `compatibility` field summarizes environment requirements.
`metadata` stores string-valued version, configuration-path and cycle-budget information for
discovery/documentation; it does not configure the executable workflow.
`node scripts\check.mjs` validates the skill's quoted-scalar frontmatter format,
the 1-500-character compatibility limit and string-only metadata values.

## Interactive

Start `copilot --experimental --model gpt-6.1-sol`, then enter:

```text
Use the issue-to-pr skill to implement issue 3. Base the isolated feature branch
on main. I authorize editing, committing, pushing and opening a PR, not merging.
```

Replace the issue and base. Ask "What dynamic workflows are available?" to verify
registration, and use `/workflows` to inspect the run and its agents.

## Noninteractive prompt

Run `node scripts\solve-issue.mjs HTTPS_ISSUE_URL` from the repository root.
The launcher reads the execution model from shared configuration, passes the
full authorized instruction with `-p`, uses `--no-ask-user`, and enables project
extension loading only in the child process environment.
Start from a clean trusted approved base; the instruction requests an isolated
feature worktree before edits. This is the skill entry point, including commit,
push and PR creation after passing gates, not merely a direct workflow run.

`--allow-all-tools` is broad execution authorization, not a sandbox or a
correctness guarantee. Use it only in an expendable worktree after reviewing
the extension and local instructions. Review permissions with
`copilot help permissions`; deny rules are defense-in-depth, not complete
containment. Remove/disable unrelated personal MCP configurations as well;
`--disable-builtin-mcps` alone does not disable personal servers.

For an untrusted-directory prompt invocation,
`GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS=true` opts into project extension loading.
Set it only after reviewing the extension, and restore its previous value in a
`finally` block when setting it manually. The launcher does not modify the parent
environment. Do not treat it as a permission bypass.

Headless mode does not grant missing GitHub permissions. A denied request is a
failure, not a reason to broaden credentials. GitHub-managed cloud sandboxes
support interactive sessions only; do not combine `--cloud` and `-p`.
Cloud sandboxing is optional, not required for this local demo.

## Direct workflow run (checked diff, not a PR yet)

Put `{"issue":3,"base":"main"}` in an ignored local input file, then run:

```text
copilot --experimental --model gpt-6.1-sol --allow-tool=read --allow-tool=search --allow-tool=write --disable-builtin-mcps workflow run issue-to-pr --args @.demo-runs\input.json --result-file .demo-runs\result.json
```

This path skips the parent skill: it produces a checked diff and evidence, not a
commit or PR. Native extension subprocesses run trusted Git/gh/Node commands;
tool allowlists govern agents, not sandboxing of extension JavaScript.
Direct runs cannot prompt for permissions. Set up auth/trust beforehand.
Verify `/rubber-duck` in `copilot help commands` on the installed CLI.
Rubber duck is the sole critic component. The host invokes one read-only CLI
consultation per cycle, explicitly requesting two sections: project fit covering
every original requirement/business rule, and engineering quality covering
correctness, edge cases and regression coverage. No custom critic or specialist
agent is loaded. A default-agent main decision call assesses each actual finding
against source and records accepted defects and reasoned rejections.
Inspect `report.rubberDuck` and `report.decision`, including `projectFit`,
`engineeringQuality`, findings and consultation evidence. Their schemas validate
structure, not exhaustive review coverage or sound judgment.
Execution calls and the Rubber duck CLI invocation use the model IDs exported
by `skills/issue-to-pr/scripts/config.mjs`. Verify both are available to your account. Model selection
does not guarantee correctness, and failures must not silently switch models.
Confirmed defects and check failures return to implementation, then review again.
There are at most three total cycles (initial plus two revisions); reaching the
cap with any blocker returns `blocked`. Unusable transport/schema results fail
explicitly rather than consuming the cycle budget in a retry loop.
Subprocess permissions are supplied by trusted runtime code; no general
nested-delegation permission is needed by project agent profiles.
Missing CLI support or failed consultation stops the run;
do not fabricate completed evidence or silently skip the extra review.
Do not rely on an old result file: the CLI leaves it unchanged on a failed run.
Check the command exit code and the current run ID.

## Publication freshness

Before staging, confirm `git branch --show-current` equals `report.branch`,
`git rev-parse HEAD` equals `report.head`, and the issue's `updatedAt` equals
`report.issueUpdatedAt`. Compute the diff hash with:

```text
node scripts\report-hash.mjs
```

It includes tracked changes relative to HEAD and untracked non-ignored files.
Compare it to `report.diffHash`. A changed issue or diff needs a new workflow run.
The report is also written to `.demo-runs/RUN_ID.json` and is not committed.
Only run one editing workflow in a worktree at a time.

## Failures and resume

Agent `null` outputs, malformed plans, out-of-scope edits, changed HEAD/branch,
oversized input/diffs and failed commands are explicit failures. Preserve the
worktree and error evidence; do not reset it automatically. Blocking critique or
failed checks after three total cycles return `status: "blocked"`; no PR is allowed.

Use `/workflows` to pause/cancel and inspect errors. Do not resume a run after
changing the worktree: agents and durable steps can replay stale results.
A fresh run requires a clean new branch; transfer only human-reviewed work.
The workflow rechecks the final tree, issue freshness and checks before delivery.

## References

- [Using dynamic workflows](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-dynamic-workflows)
- [Dynamic workflow concepts](https://docs.github.com/en/copilot/concepts/agents/dynamic-workflows)
- [CLI documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli)
- [Custom agent configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)

For exact installed SDK behavior, ask Copilot for the extension and dynamic
workflow authoring guides. The bundled `docs/workflows.md` documents `ctx.agent`,
`ctx.parallel`, structural schemas, journaling and null/error semantics.
