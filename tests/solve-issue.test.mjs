import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { launchOptions, main } from "../scripts/solve-issue.mjs";
import { executionModel } from "../skills/issue-to-pr/scripts/config.mjs";

const repository = "https://github.com/example/planner";
const issue = `${repository}/issues/11`;

test("simple issue launcher supplies configured model, unattended permissions and bounded PR instructions", () => {
  const env = { EXAMPLE: "preserved" };
  const result = launchOptions(issue, repository, "main", env);
  assert.equal(result.args[result.args.indexOf("--model") + 1], executionModel);
  const prompt = result.args[result.args.indexOf("-p") + 1];
  for (const text of [issue, "open a linked PR", "isolated feature worktree", "Rubber duck",
    "three total cycles", "explicit blocker", "not merge or issue closure"]) assert.ok(prompt.includes(text));
  assert.ok(result.args.includes("--no-ask-user"));
  assert.ok(result.args.includes("--allow-all-tools"));
  assert.equal(result.env.GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS, "true");
  assert.deepEqual(env, { EXAMPLE: "preserved" });
  assert.equal(launchOptions(issue, repository, "main", { COPILOT_CLI_PATH: "native.exe" }).program, "native.exe");
});

test("launcher rejects other repositories, non-issues, URL injection and invalid bases", () => {
  for (const url of [
    "https://github.com/another/planner/issues/11", `${repository}/pull/11`,
    `${repository}/issues/0`, `${repository}/issues/9007199254740992`,
    `${issue}?command=run`, `${issue}#comment`, "http://github.com/example/planner/issues/11",
    "https://user:password@github.com/example/planner/issues/11"
  ]) assert.throws(() => launchOptions(url, repository, "main"));
  for (const base of ["", "../main", "main;execute"]) {
    assert.throws(() => launchOptions(issue, repository, base));
  }
});

test("launcher checks clean checkout/open issue and propagates CLI errors without publishing itself", async () => {
  let launches = 0;
  const read = async (program, args) => ({ stdout: program === "git"
    ? args[0] === "status" ? "" : "main"
    : args[0] === "repo" ? JSON.stringify({ url: repository }) : '{"state":"OPEN"}' });
  const launch = (program, args, options) => {
    launches++;
    assert.equal(options.shell, false);
    assert.equal(options.stdio, "inherit");
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 0, null));
    return child;
  };
  await main([issue], read, launch);
  assert.equal(launches, 1);
  await assert.rejects(() => main([], read, launch), /Usage/);
  await assert.rejects(() => main([issue], async () => ({ stdout: " M README.md" }), launch), /clean checkout/);
  await assert.rejects(() => main([issue], async (program, args) =>
    program === "gh" && args[0] === "issue" ? { stdout: '{"state":"CLOSED"}' } : read(program, args),
  launch), /open issue/);
  await assert.rejects(() => main([issue], read, () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 1, null));
    return child;
  }), /exited 1/);
  await assert.rejects(() => main([issue], read, () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("error", new Error("CLI not installed")));
    return child;
  }), /CLI not installed/);
});
