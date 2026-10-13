import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readmePromise = readFile(new URL("../README.md", import.meta.url), "utf8");

function normalizeWhitespace(source) {
  return source.replace(/\s+/g, " ").trim();
}

function section(source, heading) {
  const start = source.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `Missing section ${heading}`);
  const bodyStart = start + heading.length + 1;
  const next = source.indexOf("\n## ", bodyStart);
  return source.slice(bodyStart, next === -1 ? undefined : next + 1);
}

function subsection(source, heading) {
  const start = source.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `Missing subsection ${heading}`);
  const bodyStart = start + heading.length + 1;
  const nextHeadings = ["\n### ", "\n## "]
    .map(token => source.indexOf(token, bodyStart))
    .filter(index => index !== -1);
  const end = nextHeadings.length === 0 ? undefined : Math.min(...nextHeadings) + 1;
  return source.slice(bodyStart, end);
}

test("README presents structured prerequisites and local validation checks before execution", async () => {
  const source = await readmePromise;
  assert.ok(source.indexOf("## Prerequisites and setup") < source.indexOf("## Choose an issue"));

  const prerequisites = section(source, "## Prerequisites and setup");
  for (const heading of ["### Local skill prerequisites", "### Quick validation",
    "### Install the local skill", "### Optional hosted GitHub Actions path"]) {
    assert.ok(prerequisites.includes(heading), `Expected ${heading} in README prerequisites`);
  }

  const local = subsection(prerequisites, "### Local skill prerequisites");
  for (const requirement of ["Node.js 22+", "GitHub CLI (`gh`)", "GitHub Copilot CLI",
    "experimental dynamic workflows", "/rubber-duck", "Access to the models configured",
    "scripts/config.mjs", "repository write access"]) {
    assert.ok(local.includes(requirement), `Expected local prerequisite ${requirement}`);
  }
  assert.match(
    local,
    /eligible Copilot plan\/account, or equivalent entitlement, for the account that will run the required Copilot CLI features and configured models/i,
  );

  const quickValidation = subsection(prerequisites, "### Quick validation");
  for (const requirement of ["gh auth status", "copilot login",
    "copilot workflow run --help", "copilot help commands", "/rubber-duck"]) {
    assert.ok(quickValidation.includes(requirement), `Expected quick validation item ${requirement}`);
  }
  assert.match(
    quickValidation,
    /copilot help commands` should list `\/rubber-duck`/i,
    "Expected the README to validate /rubber-duck availability explicitly",
  );
});

test("README keeps the entitlement disclaimer and operational safety caveats", async () => {
  const source = await readmePromise;
  const prerequisites = section(source, "## Prerequisites and setup");
  const prerequisitesNormalized = normalizeWhitespace(prerequisites);
  const quickValidation = subsection(prerequisites, "### Quick validation");
  const quickValidationNormalized = normalizeWhitespace(quickValidation);
  const unattended = section(source, "## Run it unattended");
  const unattendedNormalized = normalizeWhitespace(unattended);

  assert.match(
    prerequisitesNormalized,
    /does \*\*not\*\* currently perform an up-front entitlement or subscription validator/i,
  );
  assert.match(
    quickValidationNormalized,
    /If your account, policy or model access does not allow these features, the workflow will stop later with a blocker/i,
  );
  assert.match(
    quickValidationNormalized,
    /`--allow-all-tools` does not bypass missing permissions or account policy/i,
  );
  assert.match(
    unattendedNormalized,
    /this is not a sandbox/i,
  );
  assert.match(
    unattendedNormalized,
    /Headless mode cannot bypass account policies, and a zero exit alone does not prove PR delivery/i,
  );
  assert.match(
    unattendedNormalized,
    /Check the returned PR link or blocker/i,
  );
});

test("README documents installing the full skills directory without npm install", async () => {
  const source = await readmePromise;
  const prerequisites = section(source, "## Prerequisites and setup");
  const install = subsection(prerequisites, "### Install the local skill");
  const installNormalized = normalizeWhitespace(install);

  for (const requirement of ["copilot skill add ./skills", "complete skill directory",
    "not only `SKILL.md`"]) {
    assert.ok(install.includes(requirement), `Expected install guidance ${requirement}`);
  }
  assert.match(installNormalized, /No `npm install` is needed just to add the skill\./i);
});

test("README separates local repository write access from hosted Copilot token requirements", async () => {
  const source = await readmePromise;
  const prerequisites = section(source, "## Prerequisites and setup");
  const local = subsection(prerequisites, "### Local skill prerequisites");
  const hosted = subsection(prerequisites, "### Optional hosted GitHub Actions path");

  assert.match(local, /local PR delivery needs repository write access/i);
  for (const requirement of ["COPILOT_TOKEN", "Copilot Requests", "eligible Copilot plan/account",
    "configured models"]) {
    assert.ok(hosted.includes(requirement), `Expected hosted prerequisite ${requirement}`);
  }
  assert.match(hosted, /do \*\*not\*\* treat that token as a repository-write credential requirement/i);
});
