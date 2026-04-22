import { z } from "zod";
import type { PlutioClient } from "../client.js";
import { PlutioError } from "../errors.js";

export type ResourceAction =
  | "list"
  | "get"
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "bulk_update"
  | "bulk_delete"
  | "bulk_archive";

export interface ResourceSpec {
  /** Tool name suffix — becomes `plutio_<name>`. Use snake_case. */
  name: string;
  /** Plutio API path segment (e.g. "people", "projects"). */
  path: string;
  /** High-level category — shown in the tool description to help agents choose. */
  category:
    | "crm"
    | "project-management"
    | "time-tracking"
    | "financial"
    | "documents"
    | "forms"
    | "communication"
    | "scheduling"
    | "knowledge"
    | "files"
    | "marketing"
    | "admin"
    | "analytics";
  /** Short description shown to the agent. */
  description: string;
  /** Whether this resource supports archive endpoints. Default: false. */
  archive?: boolean;
  /** Whether this resource supports bulk update/delete endpoints. Default: true. */
  bulk?: boolean;
  /** If true, hide the create/update/delete actions (some resources are read-only by design). */
  readOnly?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (args: unknown) => Promise<unknown>;
}

const PaginationSchema = {
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("Max records to return (default 20, max 200)"),
  skip: z.number().int().nonnegative().optional().describe("Records to skip for pagination"),
  sort: z.string().optional().describe("Sort key, e.g. '-createdAt' for descending"),
};

const QueryField = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "Filter object. Simple key-value equality or MongoDB-style operators like {status: 'incomplete', createdAt: {$gte: '2026-01-01'}}. Also supports $regex, $or, $and.",
  );

const DataField = z
  .record(z.string(), z.unknown())
  .describe("Resource payload. Field names match Plutio's API; unknown fields are passed through.");

type UnionMember = z.ZodObject<z.ZodRawShape>;

function buildSchema(spec: ResourceSpec, writeable: boolean) {
  const members: UnionMember[] = [
    z
      .object({
        action: z.literal("list"),
        query: QueryField,
        ...PaginationSchema,
      })
      .describe("List or search records with optional filters and pagination."),
    z
      .object({
        action: z.literal("get"),
        id: z.string().min(1).describe("The record's _id"),
      })
      .describe("Fetch a single record by ID."),
  ];

  if (writeable && !spec.readOnly) {
    members.push(
      z
        .object({
          action: z.literal("create"),
          data: DataField,
        })
        .describe("Create a new record."),
      z
        .object({
          action: z.literal("update"),
          id: z.string().min(1),
          data: DataField,
        })
        .describe("Update an existing record (PUT — send the fields you want to change)."),
      z
        .object({
          action: z.literal("delete"),
          id: z.string().min(1),
        })
        .describe("Permanently delete a record."),
    );

    if (spec.archive) {
      members.push(
        z
          .object({
            action: z.literal("archive"),
            id: z.string().min(1),
          })
          .describe("Archive a record (reversible)."),
      );
    }

    if (spec.bulk !== false) {
      members.push(
        z
          .object({
            action: z.literal("bulk_update"),
            ids: z.array(z.string().min(1)).min(1).max(100),
            data: DataField,
          })
          .describe("Apply the same update to many records."),
        z
          .object({
            action: z.literal("bulk_delete"),
            ids: z.array(z.string().min(1)).min(1).max(100),
          })
          .describe("Delete many records in one call."),
      );
      if (spec.archive) {
        members.push(
          z
            .object({
              action: z.literal("bulk_archive"),
              ids: z.array(z.string().min(1)).min(1).max(100),
            })
            .describe("Archive many records in one call."),
        );
      }
    }
  }

  return z.discriminatedUnion("action", members as [UnionMember, ...UnionMember[]]);
}

function actionsListForSpec(spec: ResourceSpec, writeable: boolean): ResourceAction[] {
  const actions: ResourceAction[] = ["list", "get"];
  if (writeable && !spec.readOnly) {
    actions.push("create", "update", "delete");
    if (spec.archive) actions.push("archive");
    if (spec.bulk !== false) {
      actions.push("bulk_update", "bulk_delete");
      if (spec.archive) actions.push("bulk_archive");
    }
  }
  return actions;
}

export function createResourceTool(
  spec: ResourceSpec,
  client: PlutioClient,
  writeable: boolean,
): ToolDefinition {
  const schema = buildSchema(spec, writeable);
  const actions = actionsListForSpec(spec, writeable);

  const fullDescription = [
    `[${spec.category}] ${spec.description}`,
    `Actions: ${actions.join(", ")}.`,
    writeable && !spec.readOnly
      ? "Writes enabled."
      : "Read-only — set PLUTIO_READ_ONLY=false to enable writes.",
  ].join(" ");

  return {
    name: `plutio_${spec.name}`,
    description: fullDescription,
    inputSchema: schema,
    handler: async (rawArgs: unknown) => {
      const args = schema.parse(rawArgs);
      try {
        return await dispatch(
          spec.path,
          args as unknown as { action: ResourceAction } & Record<string, unknown>,
          client,
        );
      } catch (err) {
        if (err instanceof PlutioError) throw err;
        if (err instanceof Error) {
          throw new PlutioError(err.message, 0, { stack: err.stack });
        }
        throw new PlutioError("Unknown error", 0, err);
      }
    },
  };
}

async function dispatch(
  path: string,
  args: { action: ResourceAction } & Record<string, unknown>,
  client: PlutioClient,
): Promise<unknown> {
  switch (args.action) {
    case "list": {
      const { query, limit, skip, sort } = args as {
        action: "list";
        query?: Record<string, unknown>;
        limit?: number;
        skip?: number;
        sort?: string;
      };
      const qs: Record<string, unknown> = {};
      if (query) qs.q = query;
      if (limit !== undefined) qs.limit = limit;
      if (skip !== undefined) qs.skip = skip;
      if (sort) qs.sort = sort;
      return client.list(path, qs);
    }
    case "get":
      return client.get(path, args.id as string);
    case "create":
      return client.create(path, args.data);
    case "update":
      return client.update(path, args.id as string, args.data);
    case "delete":
      return client.delete(path, args.id as string);
    case "archive":
      return client.archive(path, args.id as string);
    case "bulk_update":
      return client.bulkUpdate(path, { _ids: args.ids, ...(args.data as object) });
    case "bulk_delete":
      return client.bulkDelete(path, args.ids as string[]);
    case "bulk_archive":
      return client.bulkArchive(path, args.ids as string[]);
    default: {
      const exhaustive: never = args.action;
      throw new Error(`Unhandled action: ${String(exhaustive)}`);
    }
  }
}
