import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { allowedPath, runtime } from "../.github/extensions/issue-to-pr/runtime.mjs";
import { runIssueWorkflow, validatePlan } from "../.github/extensions/issue-to-pr/workflow.mjs";
import { executionModel } from "../skills/issue-to-pr/scripts/config.mjs";

const task = { id: "fix", goal: "Fix remaining effort", files: ["src/planner.mjs", "tests/planner.test.mjs"],
  acceptance: ["Completed tasks consume zero remaining minutes"] };
const plan = { summary: "Fix and regression-test effort", tasks: [task] };
const evidence = { summary: "Located code", citations: ["src/planner.mjs:25"],
  acceptance: task.acceptance, uncertainties: [] };
const pass = {
  verdict: "pass", evidence: ["Confirmed review against source"], findings: [],
  projectFit: ["src/planner.mjs:25 satisfies completed-exclusion requirement"],
  engineeringQuality: ["tests/planner.test.mjs:15 covers edge cases"],
  rubberDuck: { status: "completed", evidence: ["Assessed both Rubber duck review sections"] }
};
const block = { ...pass, verdict: "block",
  findings: [{ file: "src/planner.mjs", line: 25, reason: "Wrong total", fix: "Exclude done" }] };

function harness({ decide = () => pass, checksFail = false, nullContext = false } = {}) {
  const events = [];
  const calls = [];
  const ctx = {
    args: { issue: 1, base: "main" }, runId: "test-run",
    phase: name => events.push(name), log: text => events.push(text),
    step: async (_key, producer) => producer(),
    parallel: async thunks => Promise.all(thunks.map(thunk => thunk())),
    agent: async (prompt, options) => {
      calls.push({ prompt, ...options });
      events.push(options.label);
      if (options.agent === "context") return nullContext ? null : evidence;
      if (options.label.startsWith("Plan")) return structuredClone(plan);
      if (options.label.startsWith("Main review decision")) return decide(Number(options.label.split(" ").at(-1)));
      return "Edited assigned files";
    }
  };
  const io = {
    prepare: async () => ({ repo: "owner/repo", branch: "fix", head: "sha", base: "main", baseSha: "sha" }),
    issue: async () => ({ number: 1, url: "https://github.com/owner/repo/issues/1", updatedAt: "same",
      body: "Completed tasks must not consume remaining effort.", comments: [{ body: "Preserve total task count." }] }),
    assertPaths: async (_start, filenames) => events.push(`paths:${filenames.join(",")}`),
    inspect: async () => ({ diff: "actual diff", files: task.files, diffHash: "hash" }),
    rubberDuck: async (_id, round, review) => {
      events.push(`Rubber duck ${round}`);
      assert.match(review.request.issue.body, /Completed tasks/);
      assert.equal(review.diff, "actual diff");
      assert.deepEqual(review.files, task.files);
      assert.equal("critique" in review, false);
      return { command: "copilot -p /rubber-duck", exitCode: 0,
        output: "Project fit: criteria satisfied. Engineering quality: no defects." };
    },
    checks: async () => {
      events.push("Native checks");
      return ["node --test", "node scripts/check.mjs"].map(command => ({
        command, exitCode: checksFail ? 1 : 0, output: checksFail ? "failure" : "passed"
      }));
    },
    save: async (_id, report) => events.push(`saved:${report.status}`)
  };
  return { ctx, io, events, calls };
}

test("Rubber duck is the sole critic component; main decision receives original issue and both review areas", async () => {
  const { ctx, io, events, calls } = harness();
  const report = await runIssueWorkflow(ctx, io);
  assert.equal(report.status, "ready_for_pr");
  assert.equal(report.revisionRounds, 0);
  assert.deepEqual(calls.map(call => call.label), [
    "Code context", "Documentation", "Plan 0", "Implement 0:fix", "Main review decision 0"
  ]);
  const decision = calls.at(-1);
  assert.equal(decision.agent, undefined);
  assert.ok(calls.every(call => call.model === executionModel));
  for (const text of ["Completed tasks must not consume remaining effort", "Preserve total task count",
    "actual diff", "Project fit", "Engineering quality", "Actual returned /rubber-duck critique"]) {
    assert.ok(decision.prompt.includes(text));
  }
  assert.ok(events.indexOf("Implement 0:fix") < events.indexOf("Rubber duck 0"));
  assert.ok(events.indexOf("Rubber duck 0") < events.indexOf("Main review decision 0"));
  assert.ok(events.indexOf("Main review decision 0") < events.indexOf("Native checks"));
  assert.equal(report.decision.verdict, "pass");
  assert.equal("critiques" in report, false);
  assert.equal("coordination" in report, false);
  assert.equal(events.at(-1), "saved:ready_for_pr");
});

test("context discovery fans out and completes before planning; edits remain sequential", async () => {
  const { ctx, io, events } = harness();
  const agent = ctx.agent;
  let starts = 0;
  let release;
  const bothStarted = new Promise(resolve => { release = resolve; });
  ctx.agent = async (prompt, options) => {
    if (options.agent === "context") {
      starts++;
      if (starts === 2) release();
      await bothStarted;
      events.push(`finished:${options.label}`);
    }
    return agent(prompt, options);
  };
  await runIssueWorkflow(ctx, io);
  assert.equal(starts, 2);
  for (const label of ["Code context", "Documentation"]) {
    assert.ok(events.indexOf(`finished:${label}`) < events.indexOf("Plan 0"));
  }
  assert.ok(events.indexOf("paths:") < events.indexOf("Code context"));
  assert.ok(events.indexOf(`paths:${task.files.join(",")}`) < events.indexOf("Implement 0:fix"));
});

test("only context and implementer profiles remain, with focused tool permissions", async () => {
  assert.deepEqual((await readdir(new URL("../.github/agents/", import.meta.url))).sort(),
    ["context.agent.md", "implementer.agent.md"]);
  for (const profile of ["context", "implementer"]) {
    const content = await readFile(new URL(`../.github/agents/${profile}.agent.md`, import.meta.url), "utf8");
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.match(frontmatter[1], new RegExp(`^name: ${profile}$`, "m"));
    const tools = JSON.parse(frontmatter[1].match(/^tools: (\[.*\])$/m)[1]);
    assert.deepEqual(tools, profile === "implementer" ? ["read", "search", "edit"] : ["read", "search"]);
  }
});

test("failed, missing, empty or oversized Rubber duck output cannot reach decision/checks", async () => {
  for (const value of [null, { exitCode: 1, output: "failed" }, { exitCode: 0, output: "" },
    { exitCode: 0, output: " ".repeat(3) }, { exitCode: 0, output: "x".repeat(16_001) }, "throw"]) {
    const { ctx, io, events } = harness();
    io.rubberDuck = async () => {
      if (value === "throw") throw new Error("Rubber duck process failed");
      return value;
    };
    await assert.rejects(() => runIssueWorkflow(ctx, io), /Rubber duck/);
    assert.equal(events.includes("Main review decision 0"), false);
    assert.equal(events.includes("Native checks"), false);
  }
});

test("main decision requires usable consultation and evidence for both project fit and engineering quality", async () => {
  for (const value of [
    { ...pass, projectFit: [] }, { ...pass, engineeringQuality: [" "] },
    { ...pass, engineeringQuality: [null] },
    { ...pass, rubberDuck: undefined },
    { ...pass, rubberDuck: { status: "unavailable", evidence: ["No review"] } },
    { ...pass, rubberDuck: { status: "completed", evidence: [] } }
  ]) {
    const { ctx, io, events } = harness({ decide: () => value });
    await assert.rejects(() => runIssueWorkflow(ctx, io), /lacks/);
    assert.equal(events.includes("Native checks"), false);
    assert.equal(events.some(event => event.startsWith("saved:")), false);
  }
});

test("null, contradictory or malformed review decisions fail closed", async () => {
  for (const value of [null, { ...pass, findings: block.findings }, { ...block, findings: [] },
    { ...pass, evidence: [] }, { ...block, findings: [{ ...block.findings[0], line: 0 }] }]) {
    const { ctx, io } = harness({ decide: () => value });
    await assert.rejects(() => runIssueWorkflow(ctx, io), /no usable output|Invalid/);
  }
});

test("confirmed Rubber duck defects return to implementation for at most three total cycles", async () => {
  const { ctx, io, calls, events } = harness({ decide: round => round < 2 ? block : pass });
  const result = await runIssueWorkflow(ctx, io);
  assert.equal(result.status, "ready_for_pr");
  assert.equal(result.revisionRounds, 2);
  assert.equal(result.plans.length, 3);
  assert.equal(calls.filter(call => call.label.startsWith("Main review decision")).length, 3);
  assert.equal(events.filter(event => event.startsWith("Rubber duck")).length, 3);
  assert.match(calls.find(call => call.label === "Plan 1").prompt, /Wrong total/);
  assert.match(calls.find(call => call.label === "Implement 2:fix").prompt, /Exclude done/);
  assert.equal(calls.some(call => call.label === "Plan 3"), false);
});

test("persistent review or executable-check failure returns blocked at the three-cycle cap", async () => {
  for (const options of [{ decide: () => block }, { checksFail: true }]) {
    const { ctx, io, calls } = harness(options);
    const result = await runIssueWorkflow(ctx, io);
    assert.equal(result.status, "blocked");
    assert.equal(result.revisionRounds, 2);
    assert.equal(calls.filter(call => call.label.startsWith("Implement")).length, 3);
  }
});

test("review or main-decision mutation cannot reach executable checks", async () => {
  for (const stage of ["Rubber duck 0", "Main review decision 0"]) {
    const { ctx, io, events } = harness();
    const inspect = io.inspect;
    io.inspect = async (...args) => ({
      ...await inspect(...args), diffHash: events.includes(stage) ? "changed" : "hash"
    });
    await assert.rejects(() => runIssueWorkflow(ctx, io), /changed the reviewed diff/);
    assert.equal(events.includes("Native checks"), false);
  }
});

test("unsafe discovery/assignment paths prevent agents from reading or editing", async () => {
  for (const phase of ["discovery", "assignment"]) {
    const { ctx, io, events } = harness();
    io.assertPaths = async (_start, filenames) => {
      if ((phase === "discovery") === (filenames.length === 0)) throw new Error("Unsafe path");
    };
    await assert.rejects(() => runIssueWorkflow(ctx, io), /Unsafe path/);
    assert.equal(events.some(event => event.startsWith("Implement")), false);
    if (phase === "discovery") assert.equal(events.includes("Code context"), false);
  }
});

test("missing context, no diff, check mutation and stale issue fail explicitly", async () => {
  for (const mode of ["context", "diff", "checks", "issue"]) {
    const { ctx, io, events } = harness({ nullContext: mode === "context" });
    if (mode === "diff") io.inspect = async () => ({ diff: "", files: [], diffHash: "hash" });
    if (mode === "checks") {
      const inspect = io.inspect;
      io.inspect = async (...args) => ({
        ...await inspect(...args), diffHash: events.includes("Native checks") ? "changed" : "hash"
      });
    }
    if (mode === "issue") {
      const issue = io.issue;
      io.issue = async (...args) => ({
        ...await issue(...args), updatedAt: events.includes("Native checks") ? "new" : "same"
      });
    }
    await assert.rejects(() => runIssueWorkflow(ctx, io), /no usable output|no reviewable|changed/);
  }
});

test("plan validation bounds tasks and denies traversal/configuration edits", () => {
  assert.deepEqual(validatePlan(plan), plan);
  for (const filename of ["../secret", "src/../../secret", ".github/extensions/evil.mjs",
    "tests/workflow.test.mjs", "package.json", "scripts/check.mjs", "src/.hidden/file"]) {
    assert.equal(Boolean(allowedPath(filename)), false);
    assert.throws(() => validatePlan({ ...plan, tasks: [{ ...task, files: [filename] }] }));
  }
  for (const tasks of [[], [task, task], Array(4).fill(task)]) {
    assert.throws(() => validatePlan({ ...plan, tasks }));
  }
});

test("runtime rejects unsafe input, default branch, dirty tree and wrong base", async () => {
  for (const options of [{ branch: "main" }, { dirty: true }, { head: "different" }]) {
    const io = runtime(undefined, async (program, args) => {
      if (program === "gh") return JSON.stringify({ nameWithOwner: "owner/repo", defaultBranchRef: { name: "main" } });
      if (args[0] === "branch") return options.branch ?? "feature";
      if (args[0] === "status") return options.dirty ? " M src/planner.mjs" : "";
      return args.at(-1) === "HEAD" ? options.head ?? "sha" : "sha";
    });
    await assert.rejects(() => io.prepare({ issue: 1, base: "main" }), /feature branch|clean worktree|approved base/);
  }
  const io = runtime(undefined, async () => { throw new Error("Must not execute for invalid input"); });
  for (const args of [{ issue: 0, base: "main" }, { issue: 1, base: "--exec" },
    { issue: 1, base: "a/../main" }, { issue: "1", base: "main" }]) {
    await assert.rejects(() => io.prepare(args), /positive issue number/);
  }
});

test("runtime records real command failures but propagates missing executables", async () => {
  const failed = runtime(undefined, async () => {
    throw Object.assign(new Error("Test failed"), { code: 1, stdout: "assertion failed", stderr: "" });
  });
  assert.ok((await failed.checks()).every(check => check.exitCode === 1 && check.output === "assertion failed"));
  const missing = runtime(undefined, async () => {
    throw Object.assign(new Error("Missing executable"), { code: "ENOENT" });
  });
  await assert.rejects(() => missing.checks(), /Missing executable/);
});

test("extension checks invoke Node from PATH, not the bundled Copilot host executable", async () => {
  const programs = [];
  const io = runtime(undefined, async program => { programs.push(program); return "passed"; });
  assert.ok((await io.checks()).every(check => check.exitCode === 0));
  assert.deepEqual(programs, ["node", "node"]);
});
