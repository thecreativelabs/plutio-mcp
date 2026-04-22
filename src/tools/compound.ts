import { z } from "zod";
import type { PlutioClient } from "../client.js";
import type { ToolDefinition } from "./factory.js";

interface Person {
  _id: string;
  name?: { first?: string; last?: string };
  contactEmails?: Array<{ email?: string; type?: string }>;
  contactPhones?: Array<{ number?: string; type?: string }>;
  role?: string;
  status?: string;
  companies?: Array<{ _id: string }>;
  tags?: string[];
}

interface Company {
  _id: string;
  title?: string;
  contactEmails?: Array<{ email?: string }>;
}

interface Project {
  _id: string;
  name?: string;
  status?: string;
  currency?: string;
  createdAt?: string;
  updatedAt?: string;
  client?: { _id: string };
}

interface Invoice {
  _id: string;
  invoiceId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  dueDate?: string;
  paidAt?: string;
  client?: { _id: string };
}

interface Subscription {
  _id: string;
  title?: string;
  amount?: number;
  currency?: string;
  status?: string;
  upcomingInvoiceDate?: string;
  client?: { _id: string };
}

export function createClient360Tool(client: PlutioClient): ToolDefinition {
  const schema = z
    .object({
      personId: z.string().optional().describe("A Plutio person _id. Most direct path."),
      email: z.string().optional().describe("Email address — looks up the person and proceeds."),
      name: z
        .object({
          first: z.string().optional(),
          last: z.string().optional(),
        })
        .optional()
        .describe("Partial name — first and/or last."),
      includeInvoices: z.boolean().default(true),
      includeSubscriptions: z.boolean().default(true),
      includeProjects: z.boolean().default(true),
    })
    .refine((d) => d.personId || d.email || d.name, { message: "Provide personId, email, or name" });

  return {
    name: "plutio_client_360",
    description:
      "Compound lookup: resolves a person by id/email/name, then fetches their company, active projects, all invoices (with paid/unpaid totals), and active subscriptions — all in one tool call. Replaces the 4–6 round-trip workflow for 'tell me everything about <client>'.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const args = schema.parse(rawArgs);

      let person: Person | null = null;
      if (args.personId) {
        person = await client.get<Person>("people", args.personId);
      } else if (args.email) {
        const results = await client.list<Person[]>("people", {
          q: { "contactEmails.email": args.email },
          limit: 1,
        });
        person = Array.isArray(results) && results[0] ? results[0] : null;
      } else if (args.name) {
        const q: Record<string, unknown> = {};
        if (args.name.first) q["name.first"] = args.name.first;
        if (args.name.last) q["name.last"] = args.name.last;
        const results = await client.list<Person[]>("people", { q, limit: 1 });
        person = Array.isArray(results) && results[0] ? results[0] : null;
      }

      if (!person) return { found: false, note: "No matching person found." };

      const personId = person._id;
      const companyIds = (person.companies ?? []).map((c) => c._id).filter(Boolean);

      const [companies, invoicesRaw, subsRaw, projectsRaw] = await Promise.all([
        Promise.all(companyIds.map((id) => client.get<Company>("companies", id).catch(() => null))).then(
          (list) => list.filter((c): c is Company => c !== null),
        ),
        args.includeInvoices
          ? client.list<Invoice[]>("invoices", { q: { "client._id": personId }, limit: 500 })
          : Promise.resolve([] as Invoice[]),
        args.includeSubscriptions
          ? client.list<Subscription[]>("invoice-subscriptions", { q: { "client._id": personId }, limit: 100 })
          : Promise.resolve([] as Subscription[]),
        args.includeProjects
          ? client.list<Project[]>("projects", { q: { "client._id": personId }, limit: 100 })
          : Promise.resolve([] as Project[]),
      ]);

      const invoices = Array.isArray(invoicesRaw) ? invoicesRaw : [];
      const subs = Array.isArray(subsRaw) ? subsRaw : [];
      const projects = Array.isArray(projectsRaw) ? projectsRaw : [];

      const invoiceTotals: Record<string, { paid: number; unpaid: number; count: number }> = {};
      for (const inv of invoices) {
        const ccy = inv.currency ?? "UNKNOWN";
        invoiceTotals[ccy] ??= { paid: 0, unpaid: 0, count: 0 };
        invoiceTotals[ccy].count += 1;
        if (inv.status === "paid") invoiceTotals[ccy].paid += inv.amount ?? 0;
        else invoiceTotals[ccy].unpaid += inv.amount ?? 0;
      }

      return {
        found: true,
        person: {
          id: person._id,
          name: [person.name?.first, person.name?.last].filter(Boolean).join(" "),
          role: person.role,
          status: person.status,
          emails: (person.contactEmails ?? []).map((e) => e.email).filter(Boolean),
          phones: (person.contactPhones ?? []).map((p) => p.number).filter(Boolean),
          tags: person.tags ?? [],
        },
        companies: companies.map((c) => ({ id: c._id, title: c.title })),
        projects: {
          total: projects.length,
          byStatus: projects.reduce<Record<string, number>>((acc, p) => {
            const s = p.status ?? "(none)";
            acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          }, {}),
          items: projects.map((p) => ({
            id: p._id,
            name: p.name,
            status: p.status,
            currency: p.currency,
            updatedAt: p.updatedAt,
          })),
        },
        invoices: {
          total: invoices.length,
          totalsByCurrency: invoiceTotals,
          items: invoices.map((i) => ({
            id: i._id,
            invoiceId: i.invoiceId,
            amount: i.amount,
            currency: i.currency,
            status: i.status,
            dueDate: i.dueDate,
            paidAt: i.paidAt,
          })),
        },
        subscriptions: {
          total: subs.length,
          activeCount: subs.filter((s) => s.status === "active").length,
          items: subs.map((s) => ({
            id: s._id,
            title: s.title,
            amount: s.amount,
            currency: s.currency,
            status: s.status,
            upcomingInvoiceDate: s.upcomingInvoiceDate,
          })),
        },
      };
    },
  };
}
