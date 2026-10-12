import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { nextTasks, summarize, validateTasks } from "./planner.mjs";

export async function run(args, io = { out: console.log, error: console.error }) {
  const [command, filename, ...extra] = args;
  if (!["summary", "next"].includes(command) || !filename || extra.length) {
    io.error("Usage: node src/cli.mjs <summary|next> <tasks.json>");
    return 2;
  }
  let result;
  try {
    const tasks = validateTasks(JSON.parse(await readFile(filename, "utf8")));
    result = command === "summary" ? summarize(tasks) : nextTasks(tasks);
  } catch (error) {
    io.error(`Cannot process tasks: ${error.message}`);
    return 1;
  }
  io.out(JSON.stringify(result, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2));
}
