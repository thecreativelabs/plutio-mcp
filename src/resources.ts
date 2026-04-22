import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { PlutioClient } from "./client.js";
import { PlutioError } from "./errors.js";

interface ResourceTemplateSpec {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
  parse: (uri: string) => { path: string } | null;
}

// URIs the server advertises. Clients (e.g. IDEs) show these as browseable resources.
const TEMPLATES: ResourceTemplateSpec[] = [
  {
    uriTemplate: "plutio://people/{id}",
    name: "Plutio person",
    description: "A contact, client, lead, or team member by id.",
    mimeType: "application/json",
    parse: (uri) => {
      const m = uri.match(/^plutio:\/\/people\/([\w-]+)$/);
      return m ? { path: `people/${m[1]}` } : null;
    },
  },
  {
    uriTemplate: "plutio://companies/{id}",
    name: "Plutio company",
    description: "An organization/account by id.",
    mimeType: "application/json",
    parse: (uri) => {
      const m = uri.match(/^plutio:\/\/companies\/([\w-]+)$/);
      return m ? { path: `companies/${m[1]}` } : null;
    },
  },
  {
    uriTemplate: "plutio://projects/{id}",
    name: "Plutio project",
    description: "A project record by id. Useful for 'show me this project' style lookups.",
    mimeType: "application/json",
    parse: (uri) => {
      const m = uri.match(/^plutio:\/\/projects\/([\w-]+)$/);
      return m ? { path: `projects/${m[1]}` } : null;
    },
  },
  {
    uriTemplate: "plutio://invoices/{id}",
    name: "Plutio invoice",
    description: "An invoice record by id (including status, amount, client, items).",
    mimeType: "application/json",
    parse: (uri) => {
      const m = uri.match(/^plutio:\/\/invoices\/([\w-]+)$/);
      return m ? { path: `invoices/${m[1]}` } : null;
    },
  },
  {
    uriTemplate: "plutio://tasks/{id}",
    name: "Plutio task",
    description: "A task record by id.",
    mimeType: "application/json",
    parse: (uri) => {
      const m = uri.match(/^plutio:\/\/tasks\/([\w-]+)$/);
      return m ? { path: `tasks/${m[1]}` } : null;
    },
  },
];

export function registerResources(server: Server, client: PlutioClient): void {
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: TEMPLATES.map((t) => ({
      uriTemplate: t.uriTemplate,
      name: t.name,
      description: t.description,
      mimeType: t.mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    for (const tpl of TEMPLATES) {
      const parsed = tpl.parse(uri);
      if (parsed) {
        try {
          const record = await client.request({ method: "GET", path: parsed.path });
          return {
            contents: [
              {
                uri,
                mimeType: tpl.mimeType,
                text: JSON.stringify(record, null, 2),
              },
            ],
          };
        } catch (err) {
          if (err instanceof PlutioError) {
            throw new Error(`Failed to read ${uri}: ${err.message} (HTTP ${err.status})`);
          }
          throw err;
        }
      }
    }
    throw new Error(`Unknown Plutio resource URI: ${uri}`);
  });
}
