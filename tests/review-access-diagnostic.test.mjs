import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyRubberDuck,
  parseEvents,
  sanitizeFailure,
  topLevelOutput
} from "../scripts/review-access-diagnostic.mjs";
import { reviewModel } from "../skills/issue-to-pr/scripts/config.mjs";

test("diagnostic sanitizes policy failures without retaining transcripts", () => {
  assert.deepEqual(
    sanitizeFailure("Access denied by policy settings (Request ID: A1:B2:C3) secret text"),
    { category: "policy_rejection", requestIds: ["A1:B2:C3"] }
  );
  assert.deepEqual(sanitizeFailure("operation timed out"), { category: "timeout", requestIds: [] });
});

test("diagnostic reads only the final top-level assistant output", () => {
  const events = parseEvents([
    JSON.stringify({ type: "assistant.message", parentToolCallId: "nested",
      data: { content: "ignore" } }),
    JSON.stringify({ type: "assistant.message", data: { content: "AUTHORIZED" } })
  ].join("\n"));
  assert.equal(topLevelOutput(events), "AUTHORIZED");
});

test("diagnostic requires a successful matching Rubber duck delegation", () => {
  const call = { toolCallId: "call-1", name: "task",
    arguments: { agent_type: "rubber-duck", model: reviewModel } };
  assert.deepEqual(classifyRubberDuck([
    { type: "assistant.message", data: { toolRequests: [call] } },
    { type: "tool.execution_complete", data: { toolCallId: "call-1", success: true } }
  ]), { status: "succeeded", category: "completed", requestIds: [] });
  assert.equal(classifyRubberDuck([]).category, "delegation_not_invoked");
  assert.equal(classifyRubberDuck([
    { type: "assistant.message", data: { toolRequests: [{ ...call,
      arguments: { ...call.arguments, model: "different-model" } }] } }
  ]).category, "model_mismatch");
});
