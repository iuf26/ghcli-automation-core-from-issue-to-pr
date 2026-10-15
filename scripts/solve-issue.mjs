import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { executionModel } from "../skills/issue-to-pr/scripts/config.mjs";

const execute = promisify(execFile);

export function launchOptions(issueUrl, repositoryUrl, base, env = process.env) {
  const issue = new URL(issueUrl);
  const repo = new URL(repositoryUrl);
  const match = issue.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/([1-9][0-9]*)$/);
  if (issue.protocol !== "https:" || issue.origin !== repo.origin ||
      issue.username || issue.password || issue.search || issue.hash || !match ||
      `/${match[1]}/${match[2]}` !== repo.pathname.replace(/\/$/, "") ||
      !Number.isSafeInteger(Number(match[3]))) {
    throw new Error("Supply an HTTPS issue URL belonging to this checkout's GitHub repository.");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(base) || base.includes("..")) {
    throw new Error("Start from a named, approved base branch.");
  }
  const prompt = `Solve GitHub issue ${issue.href} in this repository and open a linked PR. ` +
    `Follow the installed repository skill for implementing issues` +
    `The approved base is ${base}. Create an isolated feature worktree from its clean tip before editing. ` +
    `Do not bypass a failed gate or substitute free-form implementation for a failed workflow. ` +
    `I authorize edits, commits, push and PR creation, not merge or issue closure. ` +
    `Work unattended; stop with an explicit blocker if requirements, permissions or review are unavailable.`;
  return {
    program: env.COPILOT_CLI_PATH || "copilot",
    args: ["--experimental", "--model", executionModel, "-p", prompt,
      "--allow-all-tools", "--no-ask-user", "--disable-builtin-mcps",
      "--deny-tool=shell(git reset:*)", "--deny-tool=shell(gh pr merge:*)",
      "--deny-tool=shell(gh issue close:*)"],
    env: { ...env, GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS: "true" }
  };
}

export async function main(args, run = execute, launch = spawn) {
  if (args.length !== 1) throw new Error("Usage: node scripts/solve-issue.mjs <GitHub-issue-URL>");
  const read = async (program, argv) =>
    (await run(program, argv, { encoding: "utf8", maxBuffer: 1_000_000 })).stdout.trim();
  if (await read("git", ["status", "--porcelain"])) {
    throw new Error("Start from a clean checkout; preserve existing work.");
  }
  const base = await read("git", ["branch", "--show-current"]);
  const repository = JSON.parse(await read("gh", ["repo", "view", "--json", "url"]));
  const options = launchOptions(args[0], repository.url, base);
  const issue = JSON.parse(await read("gh", ["issue", "view", args[0], "--json", "state"]));
  if (issue.state !== "OPEN") throw new Error("Choose an open issue.");
  console.log("Starting unattended issue-to-PR work. Broad tool access is authorized; no automatic merge.");
  return new Promise((resolve, reject) => {
    const child = launch(options.program, options.args, { env: options.env, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Copilot stopped by ${signal}; inspect evidence before retrying.`));
      else if (code !== 0) reject(new Error(`Copilot exited ${code}; inspect evidence before retrying.`));
      else resolve();
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
