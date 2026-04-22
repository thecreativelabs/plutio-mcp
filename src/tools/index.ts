import type { PlutioClient } from "../client.js";
import { createResourceTool, type ToolDefinition } from "./factory.js";
import { RESOURCES } from "./registry.js";
import {
  createApiReferenceTool,
  createRateLimitTool,
  createRequestTool,
  createWorkspaceSchemaTool,
} from "./escape-hatch.js";

export function buildTools(client: PlutioClient, options: { readOnly: boolean }): ToolDefinition[] {
  const writeable = !options.readOnly;
  const resourceTools = RESOURCES.map((spec) => createResourceTool(spec, client, writeable));
  return [
    createApiReferenceTool(),
    createWorkspaceSchemaTool(client),
    createRateLimitTool(client),
    createRequestTool(client, writeable),
    ...resourceTools,
  ];
}

export { RESOURCES } from "./registry.js";
