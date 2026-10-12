import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { treeEvidence, allowedPath } from "../.github/extensions/issue-to-pr/runtime.mjs";
import { executionModel, reviewModel } from "../skills/issue-to-pr/scripts/config.mjs";

const execute = promisify(execFile);
const directory = ".demo-runs/remote";
const transferLimit = 500_000;

function decodeTransfer(value, name) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) ||
      value.length > transferLimit) {
    throw new Error(`Invalid or oversized ${name} transfer.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new Error(`Invalid ${name} transfer encoding.`);
  return decoded;
}

export async function exportTransfer(env = process.env) {
  if (!env.GITHUB_OUTPUT) throw new Error("GitHub output file is required for reviewed transfer.");
  const report = await readFile(`${directory}/report.json`);
  const patch = await readFile(`${directory}/change.patch`);
  const encoded = {
    report: report.toString("base64"),
    patch: patch.toString("base64")
  };
  if (!report.length || !patch.length ||
      encoded.report.length + encoded.patch.length > transferLimit) {
    throw new Error("Reviewed transfer is empty or exceeds the bounded job-output limit.");
  }
  await appendFile(env.GITHUB_OUTPUT,
    `report=${encoded.report}\npatch=${encoded.patch}\n`, { encoding: "utf8" });
}

export async function importTransfer(env = process.env) {
  const report = decodeTransfer(env.REVIEWED_REPORT_B64, "report");
  const patch = decodeTransfer(env.REVIEWED_PATCH_B64, "patch");
  JSON.parse(report.toString("utf8"));
  if (!patch.toString("utf8").trim()) throw new Error("Reviewed patch transfer is empty.");
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/report.json`, report);
  await writeFile(`${directory}/change.patch`, patch);
}

export function issueNumber(value) {
  if (!/^[1-9][0-9]*$/.test(value ?? "") || !Number.isSafeInteger(Number(value))) {
    throw new Error("Supply a positive safe integer issue number.");
  }
  return Number(value);
}

export function authorizeEvent(event, permission, issue) {
  if (!["admin", "maintain", "write"].includes(permission)) {
    throw new Error("Only a repository maintainer with write access may approve execution.");
  }
  if (event.issue?.pull_request || issue.state !== "OPEN") throw new Error("An open issue is required.");
  if (event.action && (event.action !== "labeled" || event.label?.name !== "copilot-approved" ||
      event.issue?.number !== issue.number ||
      !issue.labels.some(label => label.name === "copilot-approved"))) {
    throw new Error("The approval label is missing, stale or belongs to another issue.");
  }
}

export function validateReport(report, expected) {
  const evidence = value => Array.isArray(value) && value.length > 0 &&
    value.every(entry => typeof entry === "string" && entry.trim().length > 0);
  if (report.status !== "ready_for_pr" || report.repo !== expected.repo ||
      report.issueNumber !== expected.issue || report.base !== expected.base ||
      report.head !== expected.sha || report.baseSha !== expected.sha ||
      report.branch !== expected.branch || !/^[a-zA-Z0-9-]+$/.test(report.runId ?? "") ||
      !/^[a-f0-9]{64}$/.test(report.diffHash ?? "") ||
      !Number.isInteger(report.revisionRounds) || report.revisionRounds < 0 || report.revisionRounds > 2 ||
      report.decision?.verdict !== "pass" || report.decision?.findings?.length !== 0 ||
      report.rubberDuck?.model !== reviewModel || report.rubberDuck?.exitCode !== 0 ||
      !report.rubberDuck?.output?.trim() ||
      report.decision?.rubberDuck?.status !== "completed" ||
      !evidence(report.decision?.projectFit) || !evidence(report.decision?.engineeringQuality) ||
      !evidence(report.decision?.rubberDuck?.evidence) ||
      report.checks?.length !== 2 || report.checks.some(check => check.exitCode !== 0) ||
      report.checks[0].command !== "node --test" ||
      !/^node scripts[/\\]check\.mjs$/.test(report.checks[1].command) ||
      !Array.isArray(report.files) || !report.files.length ||
      report.files.some(file => !allowedPath(file))) {
    throw new Error("Missing matching ready-for-PR evidence; publication denied.");
  }
}

export async function main(mode, env = process.env, executeCommand = execute) {
  const issue = issueNumber(env.ISSUE_NUMBER);
  const repo = env.GITHUB_REPOSITORY;
  const base = env.GITHUB_REF_NAME;
  const sha = env.GITHUB_SHA;
  if (!repo || !base || !/^[a-f0-9]{40}$/.test(sha ?? "") ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? "") ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? "")) {
    throw new Error("Run this entry point in GitHub Actions with its trusted event metadata.");
  }
  const branch = `copilot/issue-${issue}-run-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const expected = { repo, base, sha, branch, issue };
  const run = async (program, args, options = {}) => {
    const executable = program === "copilot" ? (env.COPILOT_CLI_PATH || program) : program;
    const result = await executeCommand(executable, args, {
      encoding: "utf8", maxBuffer: 16_000_000, timeout: 120_000, windowsHide: true, ...options
    });
    return result.stdout.trim();
  };
  const git = args => run("git", args);
  const gh = args => run("gh", args);
  const liveIssue = async () => JSON.parse(await gh(["issue", "view", String(issue), "--repo", repo,
    "--json", "number,state,updatedAt,labels"]));
  const freshBase = async () => {
    const tip = await gh(["api", `repos/${repo}/git/ref/heads/${base}`, "--jq", ".object.sha"]);
    if (tip !== sha) throw new Error("Approved base moved; start a fresh approved run.");
  };
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const permission = await gh(["api", `repos/${repo}/collaborators/${env.GITHUB_ACTOR}/permission`,
    "--jq", ".permission"]);
  authorizeEvent(event, permission, await liveIssue());
  if (mode === "authorize") {
    await freshBase();
    return;
  }
  if (!["implement", "publish"].includes(mode)) throw new Error("Unknown remote execution phase.");
  await freshBase();
  if (await git(["status", "--porcelain"])) throw new Error("Fresh checkout is not clean.");
  const existingBranchSha = await git(["branch", "--list", branch, "--format=%(objectname)"]);
  if (existingBranchSha) {
    if (mode !== "publish" || existingBranchSha !== sha) {
      throw new Error("Run branch already exists at an unexpected revision; stop for inspection.");
    }
    // The implement job creates this run-owned local branch in the persistent self-hosted checkout.
    await git(["branch", "-D", branch]);
  }
  await git(["switch", "-c", branch, sha]);
  await mkdir(directory, { recursive: true });
  if (mode === "implement") {
    if (!env.COPILOT_GITHUB_TOKEN) throw new Error("Configure protected environment secret COPILOT_TOKEN.");
    const args = ["--model", executionModel, "--no-auto-update", "--experimental",
      "--allow-tool=read", "--allow-tool=search", "--allow-tool=write", "--deny-tool=shell",
      "--disable-builtin-mcps", "workflow", "run", "issue-to-pr",
      "--args", JSON.stringify({ issue, base }), "--result-file", `${directory}/envelope.json`,
      "--output-format=json"];
    const output = await run("copilot", args, { timeout: 40 * 60_000 });
    await writeFile(`${directory}/local-transcript.jsonl`, output);
    const reports = (await readdir(".demo-runs")).filter(file =>
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/.test(file));
    if (reports.length !== 1) throw new Error("Expected exactly one fresh persisted workflow report.");
    await writeFile(`${directory}/report.json`, await readFile(`.demo-runs/${reports[0]}`));
  } else {
    await git(["apply", "--binary", "--", `${directory}/change.patch`]);
  }
  const report = JSON.parse(await readFile(`${directory}/report.json`, "utf8"));
  validateReport(report, expected);
  const live = await liveIssue();
  if (live.state !== "OPEN" || live.updatedAt !== report.issueUpdatedAt) {
    throw new Error("Issue changed since review; publication denied.");
  }
  const evidence = await treeEvidence();
  if (evidence.diffHash !== report.diffHash ||
      JSON.stringify([...evidence.files].sort()) !== JSON.stringify([...report.files].sort())) {
    throw new Error("Patch differs from reviewed evidence; publication denied.");
  }
  await git(["add", "--", ...report.files]);
  if (mode === "implement") {
    await writeFile(`${directory}/change.patch`, await git(["diff", "--cached", "--binary", "--no-ext-diff",
      "--no-textconv", "--no-renames", sha]) + "\n");
    console.log("Ready-for-PR report and reviewed patch prepared; no publishing credentials used.");
    return;
  }
  await freshBase();
  const latest = await liveIssue();
  if (latest.state !== "OPEN" || latest.updatedAt !== report.issueUpdatedAt) {
    throw new Error("Issue changed before commit; publication denied.");
  }
  await git(["config", "user.name", "github-actions[bot]"]);
  await git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  await git(["commit", "-m", `Implement issue #${issue}`,
    "-m", `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`]);
  const template = await readFile(".github/pull_request_template.md", "utf8");
  const body = template.replace("Fixes #", `Fixes #${issue}`).replace("## Implementation",
    `## Implementation\n\nApproved issue workflow. Changed files: ${report.files.map(file => `\`${file}\``).join(", ")}.`)
    .replace("## Critique evidence", `## Critique evidence\n\nRubber duck (\`${reviewModel}\`) completed; ` +
      `main decision passed project fit and engineering quality. ${report.revisionRounds + 1} of 3 cycles used.`)
    .replace("## Executable checks", "## Executable checks\n\n" +
      report.checks.map(check => `- \`${check.command}\`: exit ${check.exitCode}`).join("\n"))
    .replace("## Workflow run and limitations", `## Workflow run and limitations\n\n` +
      `Dynamic workflow run: \`${report.runId}\`. Reviewed base: \`${sha}\`.\n` +
      `Actions evidence: https://github.com/${repo}/actions/runs/${env.GITHUB_RUN_ID}\n\n` +
      "The patch hash and issue/base freshness were rechecked in a separate publishing job. " +
      "Agent critique is not proof of correctness. Private transcripts are not uploaded.");
  await writeFile(`${directory}/pr-body.md`, body);
  // Credential helper is scoped to this disposable checkout, not persisted in the transfer.
  await gh(["auth", "setup-git"]);
  await git(["push", "origin", `HEAD:refs/heads/${branch}`]);
  const url = await gh(["pr", "create", "--repo", repo, "--base", base, "--head", branch,
    "--title", `Implement issue #${issue}`, "--body-file", `${directory}/pr-body.md`]);
  console.log(url);
  await writeFile(env.GITHUB_STEP_SUMMARY, `Created reviewable PR: ${url}\nNo merge or issue closure performed.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const operation = process.argv[2];
  const task = operation === "export" ? exportTransfer()
    : operation === "import" ? importTransfer()
      : main(operation);
  task.catch(error => { console.error(error.message); process.exitCode = 1; });
}
