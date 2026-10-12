// This skill uses a deliberately small YAML subset: quoted scalars and one string map.
export function validateSkill(source) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter || source.slice(frontmatter[0].length).split("\n").length >= 500) {
    throw new Error("Skill needs YAML frontmatter and a body under 500 lines.");
  }
  const fields = {};
  let inMetadata = false;
  for (const line of frontmatter[1].split(/\r?\n/)) {
    if (line === "metadata:") {
      if (fields.metadata) throw new Error("Duplicate metadata field.");
      fields.metadata = {};
      inMetadata = true;
      continue;
    }
    const entry = line.match(inMetadata
      ? /^  ([a-zA-Z0-9-]+): ("(?:[^"\\]|\\.)*")$/
      : /^([a-z-]+): (issue-to-pr|"(?:[^"\\]|\\.)*")$/);
    if (!entry) throw new Error("Use the skill's quoted-scalar YAML format; metadata values must be strings.");
    const target = inMetadata ? fields.metadata : fields;
    if (Object.hasOwn(target, entry[1])) throw new Error(`Duplicate skill field: ${entry[1]}`);
    target[entry[1]] = entry[2] === "issue-to-pr" ? entry[2] : JSON.parse(entry[2]);
  }
  if (fields.name !== "issue-to-pr" || Object.keys(fields).some(key =>
    !["name", "description", "compatibility", "metadata"].includes(key))) {
    throw new Error("Skill name must match its directory and fields must match the supported contract.");
  }
  if (typeof fields.description !== "string" || !fields.description.length ||
      fields.description.length > 1024 || /[<>]/.test(fields.description) ||
      !fields.description.includes("USE FOR:") || !fields.description.includes("DO NOT USE FOR:")) {
    throw new Error("Invalid skill trigger description.");
  }
  if (fields.compatibility !== undefined &&
      (typeof fields.compatibility !== "string" || fields.compatibility.length < 1 ||
       fields.compatibility.length > 500)) {
    throw new Error("Skill compatibility must be a string of 1-500 characters.");
  }
  return fields;
}
