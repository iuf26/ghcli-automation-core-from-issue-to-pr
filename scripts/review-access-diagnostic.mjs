import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { executionModel, reviewModel } from "../skills/issue-to-pr/scripts/config.mjs";

const execute = promisify(execFile);
const outputDirectory = ".demo-runs/diagnostic";

export function sanitizeFailure(value) {
  const text = String(value ?? "");
  const requestIds = [...text.matchAll(/Request ID:\s*([A-Za-z0-9:-]+)/gi)]
    .map(match => match[1]);
  let category = "cli_failure";
  if (/access denied by policy settings/i.test(text)) category = "policy_rejection";
  else if (/timed out|timeout/i.test(text)) category = "timeout";
  else if (/authentication|not logged in|unauthorized/i.test(text)) category = "authentication_failure";
  return { category, requestIds: [...new Set(requestIds)] };
}

export function parseEvents(transcript) {
  return transcript.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
}

export function topLevelOutput(events) {
  return events.filter(event => event.type === "assistant.message" &&
    !event.parentToolCallId && !event.data?.parentToolCallId &&
    typeof event.data?.content === "string" && event.data.content.trim())
    .at(-1)?.data.content.trim();
}

export function classifyRubberDuck(events) {
  const calls = events.filter(event => event.type === "assistant.message")
    .flatMap(event => event.data?.toolRequests ?? [])
    .filter(call => call.name === "task" && call.arguments?.agent_type === "rubber-duck");
  if (!calls.length) return { status: "failed", category: "delegation_not_invoked", requestIds: [] };
  const matching = calls.filter(call => call.arguments?.model === reviewModel);
  if (!matching.length) return { status: "failed", category: "model_mismatch", requestIds: [] };
  const completed = matching.some(call => events.some(event =>
    event.type === "tool.execution_complete" &&
    event.data?.toolCallId === call.toolCallId &&
    event.data?.success === true));
  return completed
    ? { status: "succeeded", category: "completed", requestIds: [] }
    : { status: "failed", category: "delegation_failure", requestIds: [] };
}

async function invokeCopilot(args, timeout = 300_000, executeCommand = execute) {
  const executable = process.env.COPILOT_CLI_PATH || "copilot";
  try {
    const result = await executeCommand(executable, args, {
      cwd: process.cwd(), encoding: "utf8", timeout, maxBuffer: 4_000_000, windowsHide: true
    });
    return { exitCode: 0, transcript: result.stdout };
  } catch (error) {
    const failure = sanitizeFailure(`${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message ?? ""}`);
    return { exitCode: Number.isInteger(error.code) ? error.code : 1, ...failure };
  }
}

async function modelProbe(role, model, executeCommand) {
  const prompt = "This is a bounded read-only authorization probe. Do not use tools, edit files, " +
    "implement issues, publish, or reveal credentials. Reply with exactly AUTHORIZED.";
  const result = await invokeCopilot([
    "--model", model, "--no-auto-update", "--experimental", "-C", process.cwd(),
    "-p", prompt, "-s",
    "--deny-tool=shell", "--deny-tool=write", "--deny-tool=edit", "--deny-tool=agent",
    "--disable-builtin-mcps", "--no-ask-user", "--output-format=json"
  ], 300_000, executeCommand);
  if (result.exitCode !== 0) {
    return { role, configuredModel: model, status: "failed",
      category: result.category, requestIds: result.requestIds };
  }
  try {
    const output = topLevelOutput(parseEvents(result.transcript));
    return output === "AUTHORIZED"
      ? { role, configuredModel: model, status: "succeeded", category: "completed", requestIds: [] }
      : { role, configuredModel: model, status: "failed",
        category: "unexpected_response", requestIds: [] };
  } catch {
    return { role, configuredModel: model, status: "failed",
      category: "invalid_event_stream", requestIds: [] };
  }
}

async function rubberDuckProbe(executeCommand) {
  const prompt = "/rubber-duck Review only this public-safe statement: " +
    "\"A denied mandatory review must prevent publication.\" " +
    `Use ${reviewModel} for the rubber-duck subagent and explicitly set its model to ${reviewModel}. ` +
    "Do not read files, use shell, " +
    "write, edit, publish, or delegate further. Return two short sections named Project fit and " +
    "Engineering quality.";
  const result = await invokeCopilot([
    "--model", reviewModel, "--no-auto-update", "--experimental", "-C", process.cwd(),
    "-p", prompt, "-s", "--allow-tool=agent",
    "--deny-tool=shell", "--deny-tool=read", "--deny-tool=search",
    "--deny-tool=write", "--deny-tool=edit",
    "--disable-builtin-mcps", "--no-ask-user", "--output-format=json"
  ], 300_000, executeCommand);
  if (result.exitCode !== 0) {
    return { role: "rubber-duck", configuredModel: reviewModel, status: "failed",
      category: result.category, requestIds: result.requestIds };
  }
  try {
    return { role: "rubber-duck", configuredModel: reviewModel,
      ...classifyRubberDuck(parseEvents(result.transcript)) };
  } catch {
    return { role: "rubber-duck", configuredModel: reviewModel, status: "failed",
      category: "invalid_event_stream", requestIds: [] };
  }
}

export async function main(env = process.env, executeCommand = execute) {
  if (!env.COPILOT_GITHUB_TOKEN) {
    throw new Error("Protected environment secret COPILOT_TOKEN is required.");
  }
  if (!env.GITHUB_ACTIONS || !env.GITHUB_RUN_ID || !env.GITHUB_SHA) {
    throw new Error("Run this diagnostic only from the reviewed GitHub Actions entry point.");
  }
  const cli = await executeCommand(env.COPILOT_CLI_PATH || "copilot", ["--version"],
    { encoding: "utf8", timeout: 30_000, windowsHide: true });
  const probes = [
    await modelProbe("execution", executionModel, executeCommand),
    await modelProbe("review", reviewModel, executeCommand)
  ];
  if (probes.every(probe => probe.status === "succeeded")) {
    probes.push(await rubberDuckProbe(executeCommand));
  } else {
    probes.push({ role: "rubber-duck", configuredModel: reviewModel, status: "not_run",
      category: "model_probe_prerequisite_failed", requestIds: [] });
  }
  const report = {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    revision: env.GITHUB_SHA,
    credentialContext: "protected COPILOT_GITHUB_TOKEN environment secret",
    cliVersion: cli.stdout.trim(),
    probes
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(`${outputDirectory}/report.json`, JSON.stringify(report, null, 2));
  if (env.GITHUB_STEP_SUMMARY) {
    const rows = probes.map(probe =>
      `| ${probe.role} | ${probe.status} | ${probe.category} | ${probe.requestIds.join(", ") || "none"} |`);
    await writeFile(env.GITHUB_STEP_SUMMARY, [
      "## Review access diagnostic",
      "",
      `Revision: \`${report.revision}\``,
      `CLI: \`${report.cliVersion}\``,
      "",
      "| Probe | Status | Category | Request IDs |",
      "|---|---|---|---|",
      ...rows,
      "",
      "Only sanitized outcomes are recorded; credentials and raw transcripts are excluded."
    ].join("\n"));
  }
  console.log(JSON.stringify({ runId: report.runId, revision: report.revision, probes }));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
