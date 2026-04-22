import { describe, expect, it, vi } from "vitest";
import { PlutioClient } from "../client.js";
import { buildTools } from "../tools/index.js";
import { RESOURCES } from "../tools/registry.js";

function mockClient(): PlutioClient {
  // The factory routes single-record mutations through the bulk methods on the
  // real client. The mocks match that: update/delete/archive/unarchive delegate
  // to bulkUpdate/bulkDelete/bulkArchive just like production does.
  const client = {
    list: vi.fn().mockResolvedValue({ data: [] }),
    get: vi.fn().mockResolvedValue({ _id: "1" }),
    create: vi.fn().mockResolvedValue({ _id: "new" }),
    bulkUpdate: vi.fn().mockResolvedValue({ ok: true }),
    bulkDelete: vi.fn().mockResolvedValue({ ok: true }),
    bulkArchive: vi.fn().mockResolvedValue({ ok: true }),
    getRateLimitStatus: vi.fn().mockReturnValue({ available: 1000, capacity: 1000 }),
    request: vi.fn().mockResolvedValue({}),
  } as unknown as PlutioClient & Record<string, unknown>;
  client.update = vi.fn((path: string, id: string, data: Record<string, unknown>) =>
    client.bulkUpdate(path, { _ids: [id], ...data }),
  );
  client.delete = vi.fn((path: string, id: string) => client.bulkDelete(path, [id]));
  client.archive = vi.fn((path: string, id: string) => client.bulkArchive(path, [id], true));
  client.unarchive = vi.fn((path: string, id: string) => client.bulkArchive(path, [id], false));
  return client as PlutioClient;
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

describe("mutations route through bulk endpoints", () => {
  it("update routes through /bulk (Plutio rejects single-record PUT)", async () => {
    const client = mockClient();
    const tools = buildTools(client, { readOnly: false });
    const peopleTool = tools.find((t) => t.name === "plutio_people")!;

    await peopleTool.handler({
      action: "update",
      id: "abc",
      data: { role: "lead" },
    });

    expect(client.bulkUpdate).toHaveBeenCalledWith(
      "people",
      expect.objectContaining({ _ids: ["abc"], role: "lead" }),
    );
  });

  it("delete routes through /bulk", async () => {
    const client = mockClient();
    const tools = buildTools(client, { readOnly: false });
    const peopleTool = tools.find((t) => t.name === "plutio_people")!;

    await peopleTool.handler({ action: "delete", id: "abc" });

    expect(client.bulkDelete).toHaveBeenCalledWith("people", ["abc"]);
  });

  it("archive passes isArchived=true; unarchive passes isArchived=false", async () => {
    const client = mockClient();
    const tools = buildTools(client, { readOnly: false });
    const peopleTool = tools.find((t) => t.name === "plutio_people")!;

    await peopleTool.handler({ action: "archive", id: "abc" });
    expect(client.bulkArchive).toHaveBeenLastCalledWith("people", ["abc"], true);

    await peopleTool.handler({ action: "unarchive", id: "abc" });
    expect(client.bulkArchive).toHaveBeenLastCalledWith("people", ["abc"], false);
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
