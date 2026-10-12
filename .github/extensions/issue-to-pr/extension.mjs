import { defineWorkflow, joinSession } from "@github/copilot-sdk/extension";
import { metadata, runIssueWorkflow } from "./workflow.mjs";

const issueToPr = defineWorkflow({ meta: metadata, run: runIssueWorkflow });
await joinSession({ workflows: [issueToPr] });
