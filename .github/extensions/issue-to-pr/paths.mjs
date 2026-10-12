import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

export async function repositoryPath(filename, {
  root = process.cwd(), allowMissing = false, directory = false
} = {}) {
  if (typeof filename !== "string" || !filename ||
      filename.includes("\\") || filename.includes(":") ||
      filename.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Invalid repository path: ${filename}`);
  }
  const canonicalRoot = await realpath(root);
  const parts = filename.split("/");
  let current = canonicalRoot;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    if (!inside(canonicalRoot, current)) throw new Error(`Path escapes repository: ${filename}`);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT" || !allowMissing) throw error;
      return { exists: false, path: path.join(current, ...parts.slice(index + 1)) };
    }
    if (info.isSymbolicLink()) throw new Error(`Symlink/junction path is not allowed: ${filename}`);
    const canonical = await realpath(current);
    if (!inside(canonicalRoot, canonical)) throw new Error(`Path escapes repository: ${filename}`);
    const needsDirectory = index < parts.length - 1 || directory;
    if (needsDirectory ? !info.isDirectory() : !info.isFile()) {
      throw new Error(`Expected a regular ${needsDirectory ? "directory" : "file"}: ${filename}`);
    }
    current = canonical;
  }
  return { exists: true, path: current };
}

export async function auditRepository(root, git) {
  const top = await git(["rev-parse", "--show-toplevel"]);
  if (path.relative(await realpath(top), await realpath(root)) !== "") {
    throw new Error("Run from the repository/worktree root, not a nested directory.");
  }
  const listed = await git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  for (const filename of new Set(listed.split("\0").filter(Boolean))) {
    await repositoryPath(filename, { root, allowMissing: true });
  }
  // Git omits empty directories; check prospective output parents before agents read them.
  const pending = ["src", "tests", "examples", "docs"];
  while (pending.length) {
    const filename = pending.pop();
    const checked = await repositoryPath(filename, { root, allowMissing: true, directory: true });
    if (!checked.exists) continue;
    for (const entry of await readdir(checked.path, { withFileTypes: true })) {
      const child = `${filename}/${entry.name}`;
      await repositoryPath(child, { root, directory: entry.isDirectory() });
      if (entry.isDirectory()) pending.push(child);
    }
  }
}
