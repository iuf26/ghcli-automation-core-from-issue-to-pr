import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  issueNumber, authorizeEvent, exportTransfer, importTransfer, validateReport, main
} from "../scripts/remote-issue.mjs";
import { treeEvidence } from "../.github/extensions/issue-to-pr/runtime.mjs";
import { executionModel, reviewModel } from "../skills/issue-to-pr/scripts/config.mjs";

test("remote input is an issue number, never shell or prompt text", () => {
  assert.equal(issueNumber("3"), 3);
  for (const value of ["", "0", "-1", "1; echo secret", "3\n", "9007199254740992"]) {
    assert.throws(() => issueNumber(value));
  }
});

test("approval requires a maintainer and a live matching label on an open issue", () => {
  const issue = { number: 3, state: "OPEN", labels: [{ name: "copilot-approved" }] };
  const event = { action: "labeled", label: { name: "copilot-approved" }, issue: { number: 3 } };
  assert.doesNotThrow(() => authorizeEvent(event, "write", issue));
  assert.doesNotThrow(() => authorizeEvent({}, "admin", issue));
  assert.throws(() => authorizeEvent(event, "read", issue));
  assert.throws(() => authorizeEvent(event, "write", { ...issue, labels: [] }));
  assert.throws(() => authorizeEvent(event, "write", { ...issue, state: "CLOSED" }));
  assert.throws(() => authorizeEvent({ ...event, issue: { number: 4 } }, "write", issue));
  assert.throws(() => authorizeEvent({ ...event, issue: { number: 3, pull_request: {} } }, "write", issue));
});

test("publishing requires matching identity, both review areas, Luna and passing checks", () => {
  const expected = { repo: "owner/repo", issue: 3, base: "main", sha: "a".repeat(40), branch: "copilot/issue-3" };
  const report = {
    status: "ready_for_pr", repo: expected.repo, issueNumber: 3, base: "main",
    head: expected.sha, baseSha: expected.sha, branch: expected.branch, runId: "run-1",
    diffHash: "b".repeat(64), revisionRounds: 0, files: ["src/planner.mjs"],
    rubberDuck: { model: reviewModel, exitCode: 0, output: "Actual critique" },
    decision: { verdict: "pass", findings: [], projectFit: ["criterion"],
      engineeringQuality: ["boundary"], rubberDuck: { status: "completed", evidence: ["actual review"] } },
    checks: [{ command: "node --test", exitCode: 0 }, { command: "node scripts/check.mjs", exitCode: 0 }]
  };
  assert.doesNotThrow(() => validateReport(report, expected));
  for (const change of [
    { status: "blocked" }, { issueNumber: 4 }, { baseSha: "c".repeat(40) },
    { revisionRounds: 3 }, { files: [".github/workflows/issue-to-pr.yml"] },
    { checks: [{ exitCode: 0 }, { exitCode: 1 }] },
    { rubberDuck: { ...report.rubberDuck, model: "different-model" } },
    { rubberDuck: { ...report.rubberDuck, model: "gpt-6-luna" } },
    // Synthetic review failures, not evidence of protected-credential access.
    { rubberDuck: { ...report.rubberDuck, exitCode: 1, output: "Access denied by policy settings" } },
    { rubberDuck: undefined },
    { rubberDuck: { ...report.rubberDuck, output: "" } },
    { decision: { ...report.decision, rubberDuck: undefined } },
    { decision: { ...report.decision, rubberDuck: { status: "failed", evidence: ["request rejected"] } } },
    { decision: { ...report.decision, rubberDuck: { status: "completed", evidence: [] } } },
    { decision: { ...report.decision, rubberDuck: { status: "completed", evidence: [" "] } } },
    { decision: { ...report.decision, projectFit: [] } },
    { decision: { ...report.decision, engineeringQuality: [] } },
    { decision: { ...report.decision, findings: [{ reason: "defect" }] } }
  ]) assert.throws(() => validateReport({ ...report, ...change }, expected));
});

test("Actions keeps publication credentials outside the generation job and omits private logs", async () => {
  const yaml = await readFile(".github/workflows/issue-to-pr.yml", "utf8");
  const [implement, publish] = yaml.split("  publish:");
  assert.match(implement, /persist-credentials: false/);
  assert.doesNotMatch(implement, /contents: write|pull-requests: write|local-transcript/);
  assert.doesNotMatch(implement, /upload-artifact/);
  assert.doesNotMatch(yaml, /actions\/(?:upload-artifact|download-artifact)@/);
  assert.doesNotMatch(yaml, /actions\/(?:checkout|setup-node)@v4/);
  assert.match(yaml, /actions\/checkout@v7/);
  assert.match(yaml, /actions\/setup-node@v7/);
  assert.match(implement, /reviewed-report: \$\{\{ steps\.transfer\.outputs\.report \}\}/);
  assert.match(implement, /remote-issue\.mjs export/);
  assert.match(publish, /needs: implement/);
  assert.match(publish, /remote-issue\.mjs import/);
  assert.match(publish, /needs\.implement\.outputs\.reviewed-report/);
  assert.match(publish, /contents: write/);
  assert.doesNotMatch(publish, /COPILOT_TOKEN|npm install|node --test/);
  assert.match(yaml, /cancel-in-progress: false/);
});

test("reviewed transfer uses bounded job outputs instead of artifact storage", async () => {
  const original = process.cwd();
  await mkdir(".demo-runs", { recursive: true });
  const fixture = await mkdtemp(path.join(original, ".demo-runs", "job-output-transfer-"));
  try {
    process.chdir(fixture);
    await mkdir(".demo-runs/remote", { recursive: true });
    const report = JSON.stringify({ status: "ready_for_pr" });
    const patch = "diff --git a/file b/file\n";
    await writeFile(".demo-runs/remote/report.json", report);
    await writeFile(".demo-runs/remote/change.patch", patch);
    const output = path.join(fixture, "github-output.txt");
    await exportTransfer({ GITHUB_OUTPUT: output });
    const values = Object.fromEntries((await readFile(output, "utf8")).trim().split("\n")
      .map(line => line.split(/=(.*)/s).slice(0, 2)));
    await rm(".demo-runs/remote", { recursive: true });
    await importTransfer({
      REVIEWED_REPORT_B64: values.report,
      REVIEWED_PATCH_B64: values.patch
    });
    assert.equal(await readFile(".demo-runs/remote/report.json", "utf8"), report);
    assert.equal(await readFile(".demo-runs/remote/change.patch", "utf8"), patch);
    await assert.rejects(() => importTransfer({
      REVIEWED_REPORT_B64: "not base64",
      REVIEWED_PATCH_B64: values.patch
    }), /Invalid or oversized report transfer/);
  } finally {
    process.chdir(original);
    await rm(fixture, { recursive: true, force: true });
  }
});

test("remote jobs transfer the exact reviewed tracked and new files before committing and publishing", async () => {
  const original = process.cwd();
  await mkdir(".demo-runs", { recursive: true });
  const fixture = await mkdtemp(path.join(original, ".demo-runs", "remote-transfer-"));
  const execute = promisify(execFile);
  const git = async args => (await execute("git", args, { cwd: fixture, encoding: "utf8" })).stdout.trim();
  try {
    const template = await readFile(".github/pull_request_template.md", "utf8");
    await mkdir(path.join(fixture, "src"));
    await mkdir(path.join(fixture, ".github"));
    await writeFile(path.join(fixture, ".gitignore"), ".demo-runs/\n");
    await writeFile(path.join(fixture, "src", "task.mjs"), "export const value = 1;\n");
    await writeFile(path.join(fixture, ".github", "pull_request_template.md"), template);
    await git(["init", "-b", "main"]);
    await git(["config", "core.autocrlf", "false"]);
    await git(["config", "user.name", "Test"]);
    await git(["config", "user.email", "test@example.invalid"]);
    await git(["add", "."]);
    await git(["commit", "-m", "Fixture"]);
    const sha = await git(["rev-parse", "HEAD"]);
    const origin = path.join(fixture, ".demo-runs", "origin.git");
    await mkdir(path.join(fixture, ".demo-runs"));
    await execute("git", ["init", "--bare", origin]);
    await git(["remote", "add", "origin", origin]);
    await git(["push", "origin", "main"]);
    const eventPath = path.join(fixture, ".demo-runs", "event.json");
    await writeFile(eventPath, "{}");
    const env = { ISSUE_NUMBER: "3", GITHUB_REPOSITORY: "owner/repo", GITHUB_REF_NAME: "main",
      GITHUB_SHA: sha, GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1", GITHUB_ACTOR: "maintainer",
      GITHUB_EVENT_PATH: eventPath, COPILOT_GITHUB_TOKEN: "test-placeholder",
      GITHUB_STEP_SUMMARY: path.join(fixture, ".demo-runs", "summary.md") };
    let created = false;
    let baseTip = sha;
    let issueState = "OPEN";
    const fakeExternal = async (program, args, options) => {
      if (program === "gh") {
        let stdout = "";
        if (args.includes("--permission")) throw new Error("Unexpected request");
        if (args.some(arg => arg.endsWith("/permission"))) stdout = "write";
        else if (args.some(arg => arg.includes("/git/ref/heads/"))) stdout = baseTip;
        else if (args[0] === "issue") stdout = JSON.stringify({ number: 3, state: issueState,
          updatedAt: "unchanged", labels: [] });
        else if (args[0] === "pr") { created = true; stdout = "https://github.com/owner/repo/pull/1"; }
        else if (args.join(" ") !== "auth setup-git") throw new Error(`Unexpected gh call ${args}`);
        return { stdout, stderr: "" };
      }
      if (program === "copilot") {
        assert.equal(args[args.indexOf("--model") + 1], executionModel);
        await writeFile("src/task.mjs", "export const value = 2;\n");
        await mkdir("tests");
        await writeFile("tests/task.test.mjs", "export const checked = true;\n");
        const evidence = await treeEvidence();
        await writeFile(".demo-runs/12345678-1234-1234-1234-123456789abc.json", JSON.stringify({
          status: "ready_for_pr", repo: "owner/repo", issueNumber: 3, base: "main",
          baseSha: sha, head: sha, branch: "copilot/issue-3-run-1-1",
          runId: "12345678-1234-1234-1234-123456789abc", revisionRounds: 0,
          issueUpdatedAt: "unchanged", ...evidence,
          rubberDuck: { model: reviewModel, exitCode: 0, output: "Fixture only" },
          decision: { verdict: "pass", findings: [], projectFit: ["criterion"],
            engineeringQuality: ["boundary"], rubberDuck: { status: "completed", evidence: ["fixture review"] } },
          checks: [{ command: "node --test", exitCode: 0 },
            { command: "node scripts\\check.mjs", exitCode: 0 }]
        }));
        return { stdout: "fixture transcript", stderr: "" };
      }
      return execute(program, args, options);
    };
    process.chdir(fixture);
    await main("implement", env, fakeExternal);
    assert.equal(created, false);
    const patch = await readFile(".demo-runs/remote/change.patch", "utf8");
    assert.match(patch, /src\/task\.mjs/);
    assert.match(patch, /tests\/task\.test\.mjs/);
    // Restore only this test-owned fixture to reproduce the fresh publisher checkout.
    await git(["switch", "main"]);
    await git(["restore", "--source=HEAD", "--staged", "--", "."]);
    await rm("tests/task.test.mjs");
    await rm("src/task.mjs");
    await git(["restore", "--source=HEAD", "--staged", "--worktree", "src/task.mjs"]);
    baseTip = "c".repeat(40);
    await assert.rejects(() => main("publish", env, fakeExternal), /base moved/);
    baseTip = sha;
    issueState = "CLOSED";
    await assert.rejects(() => main("publish", env, fakeExternal), /open issue/);
    issueState = "OPEN";
    assert.equal(created, false);
    await main("publish", env, fakeExternal);
    assert.equal(created, true);
    assert.equal(await git(["branch", "--show-current"]), "copilot/issue-3-run-1-1");
    assert.equal(await readFile("src/task.mjs", "utf8"), "export const value = 2;\n");
    assert.equal(await readFile("tests/task.test.mjs", "utf8"), "export const checked = true;\n");
    assert.match(await readFile(".demo-runs/remote/pr-body.md", "utf8"), /Fixes #3/);
    assert.equal(await git(["status", "--porcelain"]), "");
  } finally {
    process.chdir(original);
    await rm(fixture, { recursive: true, force: true });
  }
});

test("simulated denied review cannot transfer a publishable bundle or authorize publication", async t => {
  // These command/API fixtures are regressions only: they do not probe credentials,
  // run a real Rubber duck consultation or confirm any incident's GitHub state.
  for (const outcome of ["command rejection", "denied review in a claimed ready report"]) {
    await t.test(outcome, async () => {
      const original = process.cwd();
      await mkdir(".demo-runs", { recursive: true });
      const fixture = await mkdtemp(path.join(original, ".demo-runs", "remote-denied-"));
      const execute = promisify(execFile);
      const git = async args => (await execute("git", args, { cwd: fixture, encoding: "utf8" })).stdout.trim();
      try {
        await mkdir(path.join(fixture, "src"));
        await writeFile(path.join(fixture, ".gitignore"), ".demo-runs/\n");
        await writeFile(path.join(fixture, "src", "task.mjs"), "export const value = 1;\n");
        await git(["init", "-b", "main"]);
        await git(["config", "core.autocrlf", "false"]);
        await git(["config", "user.name", "Test"]);
        await git(["config", "user.email", "test@example.invalid"]);
        await git(["add", "."]);
        await git(["commit", "-m", "Fixture"]);
        const sha = await git(["rev-parse", "HEAD"]);
        await mkdir(path.join(fixture, ".demo-runs"));
        const eventPath = path.join(fixture, ".demo-runs", "event.json");
        await writeFile(eventPath, "{}");
        const env = { ISSUE_NUMBER: "3", GITHUB_REPOSITORY: "owner/repo", GITHUB_REF_NAME: "main",
          GITHUB_SHA: sha, GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1", GITHUB_ACTOR: "maintainer",
          GITHUB_EVENT_PATH: eventPath, COPILOT_GITHUB_TOKEN: "test-placeholder",
          GITHUB_STEP_SUMMARY: path.join(fixture, ".demo-runs", "summary.md") };
        const calls = [];
        const fakeExternal = async (program, args, options) => {
          calls.push({ program, args: [...args] });
          if (program === "gh") {
            let stdout;
            if (args.join(" ") === "api repos/owner/repo/collaborators/maintainer/permission --jq .permission") {
              stdout = "write";
            } else if (args.join(" ") === "api repos/owner/repo/git/ref/heads/main --jq .object.sha") {
              stdout = sha;
            } else if (args.join(" ") === "issue view 3 --repo owner/repo --json number,state,updatedAt,labels") {
              stdout = JSON.stringify({ number: 3, state: "OPEN", updatedAt: "unchanged", labels: [] });
            } else {
              throw new Error(`Unexpected gh call ${args}`);
            }
            return { stdout, stderr: "" };
          }
          if (program === "copilot") {
            assert.equal(args[args.indexOf("--model") + 1], executionModel);
            await writeFile("src/task.mjs", "export const value = 2;\n");
            if (outcome === "command rejection") {
              throw Object.assign(new Error("Access denied by policy settings"), {
                code: 1, stdout: "", stderr: "Access denied by policy settings"
              });
            }
            const evidence = await treeEvidence();
            await writeFile(".demo-runs/12345678-1234-1234-1234-123456789abc.json", JSON.stringify({
              status: "ready_for_pr", repo: "owner/repo", issueNumber: 3, base: "main",
              baseSha: sha, head: sha, branch: "copilot/issue-3-run-1-1",
              runId: "12345678-1234-1234-1234-123456789abc", revisionRounds: 0,
              issueUpdatedAt: "unchanged", ...evidence,
              rubberDuck: { model: reviewModel, exitCode: 1, output: "Access denied by policy settings" },
              decision: { verdict: "pass", findings: [], projectFit: ["fixture criterion"],
                engineeringQuality: ["fixture boundary"],
                rubberDuck: { status: "completed", evidence: ["synthetic claim, not actual review"] } },
              checks: [{ command: "node --test", exitCode: 0 },
                { command: "node scripts/check.mjs", exitCode: 0 }]
            }));
            return { stdout: "synthetic denied-review transcript", stderr: "" };
          }
          return execute(program, args, options);
        };
        const assertNoPublication = () => {
          assert.equal(calls.some(({ program, args }) => program === "gh" &&
            (args[0] === "pr" || args[0] === "issue" && args[1] !== "view")), false);
          assert.equal(calls.some(({ program, args }) => program === "git" &&
            ["commit", "push"].includes(args[0])), false);
        };
        process.chdir(fixture);
        await assert.rejects(() => main("implement", env, fakeExternal),
          outcome === "command rejection" ? /Access denied by policy settings/ : /publication denied/);
        assertNoPublication();
        for (const file of ["change.patch", "pr-body.md"]) {
          await assert.rejects(() => readFile(`.demo-runs/remote/${file}`), { code: "ENOENT" });
        }
        if (outcome === "command rejection") {
          await assert.rejects(() => readFile(".demo-runs/remote/report.json"), { code: "ENOENT" });
        } else {
          const report = JSON.parse(await readFile(".demo-runs/remote/report.json", "utf8"));
          assert.throws(() => validateReport(report, {
            repo: "owner/repo", issue: 3, base: "main", sha, branch: "copilot/issue-3-run-1-1"
          }), /publication denied/);
        }
        // Reproduce a fresh publisher checkout, retaining only the failed transfer evidence.
        await git(["switch", "main"]);
        await git(["restore", "--source=HEAD", "--staged", "--worktree", "."]);
        await git(["branch", "-D", "copilot/issue-3-run-1-1"]);
        await assert.rejects(() => main("publish", env, fakeExternal), /change\.patch/);
        assertNoPublication();
        assert.equal(calls.filter(({ program }) => program === "copilot").length, 1);
        await assert.rejects(() => readFile(".demo-runs/remote/pr-body.md"), { code: "ENOENT" });
        await assert.rejects(() => readFile(env.GITHUB_STEP_SUMMARY), { code: "ENOENT" });
        assert.equal(await git(["rev-parse", "HEAD"]), sha);
        assert.equal(await git(["status", "--porcelain"]), "");
      } finally {
        process.chdir(original);
        await rm(fixture, { recursive: true, force: true });
      }
    });
  }
});
