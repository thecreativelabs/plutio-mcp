import type { PlutioClient } from "../client.js";
import { createResourceTool, type ToolDefinition } from "./factory.js";
import { RESOURCES } from "./registry.js";
import {
  createApiReferenceTool,
  createRateLimitTool,
  createRequestTool,
  createWorkspaceSchemaTool,
} from "./escape-hatch.js";
import {
  createCashflowForecastTool,
  createInvoiceAgingTool,
  createMrrSnapshotTool,
  createUpcomingRenewalsTool,
} from "./analytics.js";
import { createClient360Tool } from "./compound.js";
import {
  createAnalyzeProposalTool,
  createListProposalPresetsTool,
  createProposalFromPresetTool,
} from "./proposals.js";
import {
  createContractFromPresetTool,
  createListContractPresetsTool,
} from "./contracts.js";
import { createTemplateToPresetTool } from "./template-extractor.js";

export function buildTools(client: PlutioClient, options: { readOnly: boolean }): ToolDefinition[] {
  const writeable = !options.readOnly;
  const resourceTools = RESOURCES.map((spec) => createResourceTool(spec, client, writeable));
  return [
    createApiReferenceTool(),
    createWorkspaceSchemaTool(client),
    createRateLimitTool(client),
    createRequestTool(client, writeable),
    createMrrSnapshotTool(client),
    createUpcomingRenewalsTool(client),
    createInvoiceAgingTool(client),
    createCashflowForecastTool(client),
    createClient360Tool(client),
    createListProposalPresetsTool(),
    createProposalFromPresetTool(client),
    createAnalyzeProposalTool(client),
    createListContractPresetsTool(),
    createContractFromPresetTool(client),
    createTemplateToPresetTool(client),
    ...resourceTools,
  ];
}

export { RESOURCES } from "./registry.js";
