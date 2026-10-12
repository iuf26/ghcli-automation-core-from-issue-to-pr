import { treeEvidence } from "../.github/extensions/issue-to-pr/runtime.mjs";
console.log((await treeEvidence()).diffHash);
