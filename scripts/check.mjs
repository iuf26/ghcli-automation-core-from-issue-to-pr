import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { validateSkill } from "../skills/issue-to-pr/scripts/validate.mjs";

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return nested.flat();
}

const sources = (await Promise.all(["src", "scripts", "tests", ".github/extensions",
  "skills/issue-to-pr/scripts"].map(files))).flat();
for (const filename of sources.filter(name => name.endsWith(".mjs"))) {
  const result = spawnSync(process.execPath, ["--check", filename], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const skill = await readFile("skills/issue-to-pr/SKILL.md", "utf8");
validateSkill(skill);
console.log("JavaScript syntax and skill metadata passed.");
