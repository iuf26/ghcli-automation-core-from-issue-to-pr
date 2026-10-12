import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSkill } from "../skills/issue-to-pr/scripts/validate.mjs";

test("skill exposes bounded compatibility, string metadata and prerequisites before execution", async () => {
  const source = await readFile("skills/issue-to-pr/SKILL.md", "utf8");
  const fields = validateSkill(source);
  assert.equal(fields.metadata.config, "scripts/config.mjs");
  assert.equal(fields.metadata["max-cycles"], "3");
  for (const trigger of ["solve this issue", "solve an issue with a link", "implement issue"]) {
    assert.ok(fields.description.includes(trigger));
  }
  for (const excluded of ["merging PRs", "backlog triage", "presentation editing"]) {
    assert.ok(fields.description.split("DO NOT USE FOR:")[1].includes(excluded));
  }
  assert.ok(source.indexOf("## Prerequisites") < source.indexOf("## Workflow"));
  for (const requirement of ["Node.js 22+", "gh auth status", "copilot workflow run --help",
    "/rubber-duck", "copilot skill add"]) assert.ok(source.includes(requirement));
});

test("review model ID is defined only in the shared skill config", async () => {
  const { reviewModel } = await import("../skills/issue-to-pr/scripts/config.mjs");
  assert.ok(reviewModel.length > 0);
  const { execFileSync } = await import("node:child_process");
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of tracked) {
    if (file === "skills/issue-to-pr/scripts/config.mjs") continue;
    assert.ok(!(await readFile(file, "utf8")).includes(reviewModel), `Duplicate review model ID in ${file}`);
  }
});

test("metadata validator accepts optional fields but rejects malformed or out-of-bounds values", () => {
  const prefix = '---\nname: issue-to-pr\ndescription: "Implements issues. USE FOR: issue to PR. DO NOT USE FOR: merge."\n';
  const document = extra => `${prefix}${extra}---\n\n# Skill\n`;
  assert.doesNotThrow(() => validateSkill(document("")));
  assert.doesNotThrow(() => validateSkill(document(`compatibility: "${"x".repeat(500)}"\nmetadata:\n  version: "1"\n`)));
  for (const extra of [
    'compatibility: ""\n', `compatibility: "${"x".repeat(501)}"\n`,
    "compatibility: 123\n", "metadata:\n  version: 1\n",
    "metadata: []\n", 'metadata:\n  version: "1"\n  version: "2"\n',
    'compatibility: "one"\ncompatibility: "two"\n'
  ]) assert.throws(() => validateSkill(document(extra)));
  assert.throws(() => validateSkill(document("").replace("name: issue-to-pr", "name: wrong")));
});
