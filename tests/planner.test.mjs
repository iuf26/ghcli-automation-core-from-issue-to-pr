import test from "node:test";
import assert from "node:assert/strict";
import { nextTasks, sumMinutes, summarize, validateTasks } from "../src/planner.mjs";

const task = (overrides = {}) => ({
  id: "project", title: "Team project", status: "todo", minutes: 60, due: "2026-10-12", ...overrides
});

test("validates tasks without changing the input", () => {
  const input = [task()];
  assert.deepEqual(validateTasks(input), input);
  assert.notEqual(validateTasks(input)[0], input[0]);
});

test("rejects malformed tasks, duplicates and impossible dates", () => {
  for (const input of [null, [null], [task({ title: "" })], [task({ minutes: -1 })],
    [task({ minutes: 1.5 })], [task({ status: "unknown" })],
    [task({ due: "2026-02-30" })], [task(), task()]]) {
    assert.throws(() => validateTasks(input));
  }
});

test("summarizes an unfinished task and an empty project", () => {
  assert.deepEqual(summarize([task()]), { total: 1, completed: 0, remainingMinutes: 60 });
  assert.deepEqual(summarize([]), { total: 0, completed: 0, remainingMinutes: 0 });
});

test("aggregate effort rejects unsafe integer totals instead of rounding", () => {
  const tasks = validateTasks([task({ id: "large", minutes: Number.MAX_SAFE_INTEGER }),
    task({ id: "extra", minutes: 2 })]);
  assert.throws(() => sumMinutes(tasks), /safe integer range/);
  assert.throws(() => summarize(tasks), /safe integer range/);
  assert.equal(sumMinutes([task({ minutes: Number.MAX_SAFE_INTEGER - 2 }), task({ minutes: 2 })]),
    Number.MAX_SAFE_INTEGER);
});

test("next tasks exclude completed work and sort by deadline then id without mutation", () => {
  const tasks = [task({ id: "z" }), task({ id: "done", status: "done" }),
    task({ id: "a" }), task({ id: "early", due: "2026-10-11" })];
  const before = structuredClone(tasks);
  assert.deepEqual(nextTasks(tasks).map(item => item.id), ["early", "a", "z"]);
  assert.deepEqual(tasks, before);
});
