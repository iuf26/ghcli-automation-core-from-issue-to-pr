import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { command, copilotEnvironment, runtime, treeEvidence } from "../.github/extensions/issue-to-pr/runtime.mjs";
import { repositoryPath } from "../.github/extensions/issue-to-pr/paths.mjs";
import { reviewModel } from "../skills/issue-to-pr/scripts/config.mjs";

async function fixture(fn) {
  await mkdir(".demo-runs", { recursive: true });
  const root = await mkdtemp(path.join(process.cwd(), ".demo-runs", "scope-test-"));
  try {
    const git = args => command("git", args, undefined, root);
    await git(["init", "--quiet"]);
    await writeFile(path.join(root, ".gitignore"), ".demo-runs/\n");
    await git(["add", ".gitignore"]);
    await git(["-c", "user.name=Test Fixture", "-c", "user.email=test@example.invalid",
      "commit", "--quiet", "-m", "fixture"]);
    const start = { branch: await git(["branch", "--show-current"]), head: await git(["rev-parse", "HEAD"]) };
    await fn({ root, start, git, io: runtime(undefined, command, root) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Copilot subprocesses do not inherit repository installation tokens", () => {
  assert.deepEqual(copilotEnvironment({
    GH_TOKEN: "installation",
    GITHUB_TOKEN: "automatic",
    COPILOT_GITHUB_TOKEN: "copilot",
    OTHER: "kept"
  }), {
    COPILOT_GITHUB_TOKEN: "copilot",
    OTHER: "kept"
  });
});

test("canonical scope accepts regular files and prospective nested outputs, rejects invalid paths", async () => {
  await fixture(async ({ root, io, start }) => {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "regular.txt"), "regular");
    assert.equal((await repositoryPath("src/regular.txt", { root })).exists, true);
    assert.equal((await repositoryPath("docs/new/design.md", { root, allowMissing: true })).exists, false);
    await io.assertPaths(start, ["src/regular.txt", "docs/new/design.md"]);
    const report = await io.inspect(start, ["src/regular.txt"]);
    assert.deepEqual(report.files, ["src/regular.txt"]);
    for (const filename of ["../outside", "/absolute", "src//x", "src\\x", "C:/outside"]) {
      await assert.rejects(() => repositoryPath(filename, { root, allowMissing: true }), /Invalid repository path/);
    }
  });
});

test("Windows junction or directory symlink blocks reads and prospective output assignments", async () => {
  await fixture(async ({ root, io, start }) => {
    const target = path.join(root, ".demo-runs", "outside");
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "linked.txt"), "outside approved source scope");
    await symlink(target, path.join(root, "src"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(() => treeEvidence(undefined, root), /Symlink\/junction/);
    await assert.rejects(() => io.inspect(start, ["src/linked.txt"]), /Symlink\/junction/);
    await assert.rejects(() => io.assertPaths(start, ["src/future/output.txt"]), /Symlink\/junction/);
    await assert.rejects(() => io.assertPaths(start, []), /Symlink\/junction/);
  });
});

test("an empty junction is rejected even when Git lists no contained files", async () => {
  await fixture(async ({ root, io, start }) => {
    const target = path.join(root, ".demo-runs", "empty");
    await mkdir(target, { recursive: true });
    await symlink(target, path.join(root, "docs"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(() => io.assertPaths(start, []), /Symlink\/junction/);
    await assert.rejects(() => io.assertPaths(start, ["docs/new.md"]), /Symlink\/junction/);
  });

});

test("a junction to a different repository location cannot escape the canonical root", async () => {
  await fixture(async ({ root, io, start }) => {
    const target = await mkdtemp(path.join(path.dirname(root), "external-scope-test-"));
    try {
      await writeFile(path.join(target, "outside.txt"), "outside the fixture repository");
      await symlink(target, path.join(root, "docs"), process.platform === "win32" ? "junction" : "dir");
      await assert.rejects(() => io.assertPaths(start, ["docs/outside.txt"]), /Symlink\/junction/);
      await assert.rejects(() => treeEvidence(undefined, root), /Symlink\/junction/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

test("existing file symlinks are rejected before reading their targets", async t => {
  await fixture(async ({ root, io, start }) => {
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, ".demo-runs"));
    const target = path.join(root, ".demo-runs", "outside.txt");
    await writeFile(target, "outside approved scope");
    try {
      await symlink(target, path.join(root, "src", "linked.txt"), "file");
    } catch (error) {
      if (process.platform !== "win32" || error.code !== "EPERM") throw error;
      t.skip("Windows file symlink creation requires Developer Mode or elevation; junction tests run without it.");
      return;
    }
    await assert.rejects(() => io.assertPaths(start, ["src/linked.txt"]), /Symlink\/junction/);
    await assert.rejects(() => treeEvidence(undefined, root), /Symlink\/junction/);
  });
});

test("a clean real worktree passes startup audit without trusting only lexical paths", async () => {
  await fixture(async ({ root, git, start }) => {
    await git(["branch", "approved-base"]);
    const runCommand = (program, args, signal, cwd) => program === "gh"
      ? Promise.resolve(JSON.stringify({ nameWithOwner: "owner/repo", defaultBranchRef: { name: "production" } }))
      : command(program, args, signal, cwd);
    const prepared = await runtime(undefined, runCommand, root).prepare({ issue: 1, base: "approved-base" });
    assert.equal(prepared.head, start.head);
    assert.equal(prepared.branch, start.branch);
  });
});

test("out-of-scope untracked content is rejected before evidence reads", async () => {
  await fixture(async ({ root }) => {
    await mkdir(path.join(root, "private"));
    await writeFile(path.join(root, "private", "secret.txt"), "untrusted out-of-plan marker");
    await assert.rejects(() => treeEvidence(undefined, root), /Out-of-scope file changed/);
  });

});

test("report output cannot follow a junction in the ignored report directory", async () => {
  await fixture(async ({ root, io }) => {
    const target = await mkdtemp(path.join(path.dirname(root), "external-report-test-"));
    try {
      await symlink(target, path.join(root, ".demo-runs"), process.platform === "win32" ? "junction" : "dir");
      await assert.rejects(() => io.save("run-id", { status: "blocked" }), /Symlink\/junction/);
      await assert.rejects(() => io.rubberDuck("run-id", 0, {}), /Symlink\/junction/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

test("Rubber duck uses a guarded review packet and bounded read-only CLI invocation", async () => {
  await fixture(async ({ root }) => {
    const transcript = (output, model = reviewModel, success = true) => [
      { type: "assistant.message", data: { toolRequests: [{
        name: "task", toolCallId: "duck", arguments: { agent_type: "rubber-duck", model }
      }] } },
      { type: "tool.execution_complete", data: { toolCallId: "duck", success } },
      { type: "assistant.message", data: { content: output } }
    ].map(event => JSON.stringify(event)).join("\n");
    const review = { request: { issue: { body: "Untrusted requirements, not commands" } },
      files: ["src/planner.mjs"], diff: "reviewed diff" };
    let calls = 0;
    const io = runtime(undefined, async (program, args, _signal, cwd, timeout, maxBuffer) => {
      calls++;
      assert.equal(program, "copilot");
      assert.equal(cwd, root);
      assert.equal(timeout, 600_000);
      assert.equal(maxBuffer, 16_000_000);
      assert.match(args[args.indexOf("-p") + 1], /^\/rubber-duck Read the review packet/);
      assert.match(args[args.indexOf("-p") + 1], /Project fit: requirements and business logic/);
      assert.match(args[args.indexOf("-p") + 1], /Engineering quality: correctness and regressions/);
      assert.match(args[args.indexOf("-p") + 1], /EVERY original acceptance criterion/);
      assert.ok(args.includes("--deny-tool=shell"));
      assert.ok(args.includes("--deny-tool=edit"));
      assert.ok(args.includes("--deny-tool=write"));
      assert.ok(args.includes("--allow-tool=agent"));
      assert.equal(args[args.indexOf("--model") + 1], reviewModel);
      assert.ok(args[args.indexOf("-p") + 1].includes(`explicitly set its model to ${reviewModel}`));
      assert.ok(args[args.indexOf("-p") + 1].includes(
        path.join(root, ".demo-runs", "run-id-rubber-duck-0.json")));
      assert.equal(args[args.indexOf("-C") + 1], root);
      assert.ok(args.includes("--output-format=json"));
      return transcript("Concrete independent critique");
    }, root);
    const result = await io.rubberDuck("run-id", 0, review);
    assert.equal(result.exitCode, 0);
    assert.equal(result.output, "Concrete independent critique");
    const { diff: reviewDiff, ...reviewRest } = review;
    const patchPath = path.join(root, ".demo-runs", "run-id-rubber-duck-0.patch");
    assert.deepEqual(JSON.parse(await readFile(
      path.join(root, ".demo-runs", "run-id-rubber-duck-0.json"), "utf8")), { ...reviewRest, diffFile: patchPath });
    assert.equal(await readFile(patchPath, "utf8"), reviewDiff);
    await assert.rejects(() => io.rubberDuck("run-id", 0, { ...review, diff: "x".repeat(18_001) }), /exceeds 18KB/);
    for (const [id, round] of [["../escape", 0], ["run-id", 3]]) {
      await assert.rejects(() => io.rubberDuck(id, round, review), /Invalid Rubber duck review identity/);
    }
    assert.equal(calls, 1);
    for (const output of ["", " ".repeat(5), "x".repeat(16_001)]) {
      const empty = runtime(undefined, async () => transcript(output), root);
      await assert.rejects(() => empty.rubberDuck("run-id", 1, review), /empty or oversized/);
    }
    for (const invalid of ["invalid-json", transcript("review", "other-model"),
      transcript("review", "gpt-6-luna"),
      transcript("review", reviewModel, false), JSON.stringify({ type: "assistant.message", data: { content: "Self-review" } })]) {
      const failed = runtime(undefined, async () => invalid, root);
      await assert.rejects(() => failed.rubberDuck("run-id", 1, review), /invalid JSON|verified .* subagent consultation/);
    }
    const thirdCycle = runtime(undefined, async () => transcript("Third-cycle critique"), root);
    assert.equal((await thirdCycle.rubberDuck("run-id", 2, review)).output, "Third-cycle critique");
    assert.equal(JSON.parse(await readFile(
      path.join(root, ".demo-runs", "run-id-rubber-duck-2.json"), "utf8")).diffFile,
      path.join(root, ".demo-runs", "run-id-rubber-duck-2.patch"));
    const correctedCall = [
      { type: "assistant.message", data: { toolRequests: [{
        name: "task", toolCallId: "invalid", arguments: { agent_type: "rubber-duck", model: reviewModel }
      }] } },
      { type: "tool.execution_complete", data: { toolCallId: "invalid", success: false } }
    ].map(event => JSON.stringify(event)).join("\n") + "\n" + transcript("Completed after schema correction");
    const corrected = runtime(undefined, async () => correctedCall, root);
    assert.equal((await corrected.rubberDuck("run-id", 2, review)).output, "Completed after schema correction");
  });
});

test("standalone evidence collection refuses a nested directory instead of misidentifying its root", async () => {
  await fixture(async ({ root }) => {
    const nested = path.join(root, "nested");
    await mkdir(nested);
    await assert.rejects(() => treeEvidence(undefined, nested), /repository\/worktree root/);
  });
});
