import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { run } from "../src/cli.mjs";

function capture() {
  const output = [];
  const errors = [];
  return { output, errors, io: { out: text => output.push(text), error: text => errors.push(text) } };
}

test("CLI outputs parseable task data", async () => {
  const { output, errors, io } = capture();
  assert.equal(await run(["next", "examples/tasks.json"], io), 0);
  assert.deepEqual(JSON.parse(output[0]).map(task => task.id), ["review", "project"]);
  assert.deepEqual(errors, []);
});

test("CLI reports missing files and bad arguments with nonzero exit codes", async () => {
  const { errors, io } = capture();
  assert.equal(await run(["summary", "examples/missing.json"], io), 1);
  assert.match(errors[0], /Cannot process tasks/);
  assert.equal(await run(["unknown", "examples/tasks.json"], io), 2);
  assert.equal(await run(["next", "examples/tasks.json", "--oops"], io), 2);
});

test("CLI reports aggregate overflow with a useful error and no success output", async () => {
  await mkdir(".demo-runs", { recursive: true });
  const directory = await mkdtemp(path.join(process.cwd(), ".demo-runs", "overflow-test-"));
  const filename = path.join(directory, "tasks.json");
  try {
    await writeFile(filename, JSON.stringify([
      { id: "large", title: "Large", status: "todo", minutes: Number.MAX_SAFE_INTEGER, due: "2026-10-12" },
      { id: "extra", title: "Extra", status: "doing", minutes: 2, due: "2026-10-12" }
    ]));
    const { output, errors, io } = capture();
    assert.equal(await run(["summary", filename], io), 1);
    assert.deepEqual(output, []);
    assert.match(errors[0], /Cannot process tasks:.*safe integer range/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
