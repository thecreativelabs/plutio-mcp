import { describe, expect, it, vi } from "vitest";
import { PlutioClient } from "../client.js";
import { buildTools } from "../tools/index.js";
import { RESOURCES } from "../tools/registry.js";

function mockClient(): PlutioClient {
  return {
    list: vi.fn().mockResolvedValue({ data: [] }),
    get: vi.fn().mockResolvedValue({ _id: "1" }),
    create: vi.fn().mockResolvedValue({ _id: "new" }),
    update: vi.fn().mockResolvedValue({ _id: "1" }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
    archive: vi.fn().mockResolvedValue({ ok: true }),
    bulkUpdate: vi.fn().mockResolvedValue({ ok: true }),
    bulkDelete: vi.fn().mockResolvedValue({ ok: true }),
    bulkArchive: vi.fn().mockResolvedValue({ ok: true }),
    getRateLimitStatus: vi.fn().mockReturnValue({ available: 1000, capacity: 1000 }),
    request: vi.fn().mockResolvedValue({}),
  } as unknown as PlutioClient;
}

describe("buildTools — read-only mode", () => {
  const tools = buildTools(mockClient(), { readOnly: true });

  it("registers one tool per resource plus escape hatches", () => {
    const escapeHatches = ["plutio_api_reference", "plutio_rate_limit_status", "plutio_request"];
    expect(tools.length).toBe(RESOURCES.length + escapeHatches.length);
    for (const h of escapeHatches) {
      expect(tools.find((t) => t.name === h)).toBeDefined();
    }
  });

  it("every resource tool has a plutio_ prefix", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^plutio_/);
    }
  });

  it("rejects write actions in read-only mode", async () => {
    const peopleTool = tools.find((t) => t.name === "plutio_people")!;
    await expect(peopleTool.handler({ action: "create", data: { name: "x" } })).rejects.toThrow();
    await expect(peopleTool.handler({ action: "delete", id: "x" })).rejects.toThrow();
  });

  it("allows list and get actions in read-only mode", async () => {
    const peopleTool = tools.find((t) => t.name === "plutio_people")!;
    await expect(peopleTool.handler({ action: "list" })).resolves.toBeDefined();
    await expect(peopleTool.handler({ action: "get", id: "abc" })).resolves.toBeDefined();
  });

  it("describes itself as read-only", () => {
    const peopleTool = tools.find((t) => t.name === "plutio_people")!;
    expect(peopleTool.description.toLowerCase()).toContain("read-only");
  });
});

describe("buildTools — writeable mode", () => {
  const tools = buildTools(mockClient(), { readOnly: false });

  it("accepts write actions", async () => {
    const peopleTool = tools.find((t) => t.name === "plutio_people")!;
    await expect(peopleTool.handler({ action: "create", data: { name: "x" } })).resolves.toBeDefined();
    await expect(peopleTool.handler({ action: "update", id: "x", data: { name: "y" } })).resolves.toBeDefined();
    await expect(peopleTool.handler({ action: "delete", id: "x" })).resolves.toBeDefined();
  });

  it("keeps designated-read-only resources (e.g. businesses) locked even in writeable mode", async () => {
    const businessesTool = tools.find((t) => t.name === "plutio_businesses")!;
    await expect(businessesTool.handler({ action: "create", data: {} })).rejects.toThrow();
  });
});

describe("list action query serialization", () => {
  it("passes the filter query under the q parameter", async () => {
    const client = mockClient();
    const tools = buildTools(client, { readOnly: true });
    const peopleTool = tools.find((t) => t.name === "plutio_people")!;

    await peopleTool.handler({
      action: "list",
      query: { status: "active" },
      limit: 25,
      sort: "-createdAt",
    });

    expect(client.list).toHaveBeenCalledWith(
      "people",
      expect.objectContaining({
        q: { status: "active" },
        limit: 25,
        sort: "-createdAt",
      }),
    );
  });
});

describe("plutio_api_reference", () => {
  const tools = buildTools(mockClient(), { readOnly: true });
  const refTool = tools.find((t) => t.name === "plutio_api_reference")!;

  it("returns every registered resource", async () => {
    const result = (await refTool.handler({})) as {
      resources: Array<{ tool: string }>;
    };
    expect(result.resources.length).toBe(RESOURCES.length);
  });

  it("filters by category", async () => {
    const result = (await refTool.handler({ category: "financial" })) as {
      resources: Array<{ category: string }>;
    };
    expect(result.resources.length).toBeGreaterThan(0);
    for (const r of result.resources) {
      expect(r.category).toBe("financial");
    }
  });
});
