import { z } from "zod";
import type { PlutioClient } from "../client.js";
import type { ToolDefinition } from "./factory.js";

interface Subscription {
  _id: string;
  title?: string;
  client?: { _id: string; entityType?: string };
  currency?: string;
  amount?: number;
  status?: string;
  repeat?: {
    intervalType?: "day" | "week" | "month" | "year";
    interval?: number;
    rrule?: string;
  };
  startDate?: string;
  upcomingInvoiceDate?: string;
  lastChargeAttemptedAt?: string;
}

interface Invoice {
  _id: string;
  invoiceId?: string;
  name?: string;
  client?: { _id: string };
  currency?: string;
  amount?: number;
  status?: string;
  issueDate?: string;
  dueDate?: string;
  paidAt?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Normalize a subscription's amount to a monthly figure. */
function monthlyValue(sub: Subscription): number {
  const amount = sub.amount ?? 0;
  const intervalType = sub.repeat?.intervalType ?? "month";
  const interval = sub.repeat?.interval ?? 1;
  if (!interval) return 0;
  switch (intervalType) {
    case "day":
      return (amount * (365 / 12)) / interval;
    case "week":
      return (amount * (52 / 12)) / interval;
    case "month":
      return amount / interval;
    case "year":
      return amount / (12 * interval);
    default:
      return amount;
  }
}

function frequencyLabel(sub: Subscription): string {
  const t = sub.repeat?.intervalType ?? "month";
  const i = sub.repeat?.interval ?? 1;
  if (i === 1) return t === "year" ? "annual" : t === "month" ? "monthly" : t === "week" ? "weekly" : "daily";
  if (t === "month" && i === 3) return "quarterly";
  if (t === "month" && i === 6) return "semi-annual";
  return `every ${i} ${t}s`;
}

export function createMrrSnapshotTool(client: PlutioClient): ToolDefinition {
  const schema = z.object({
    currency: z.string().optional().describe("Filter to one currency (e.g. 'USD'). Omit to return a per-currency breakdown."),
  });
  return {
    name: "plutio_mrr_snapshot",
    description:
      "Recurring-revenue snapshot computed from active invoice subscriptions. Returns MRR, ARR, breakdowns by billing frequency and by currency, and top clients. Reduces what would otherwise be a list+aggregate workflow to a single tool call.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const { currency } = schema.parse(rawArgs);
      const subs = await client.list<Subscription[]>("invoice-subscriptions", {
        q: { status: "active" },
        limit: 500,
      });
      const list = Array.isArray(subs) ? subs : [];
      const filtered = currency ? list.filter((s) => s.currency === currency) : list;

      const byCurrency: Record<string, { count: number; mrr: number; arr: number }> = {};
      const byFrequency: Record<string, { count: number; mrrContribution: number }> = {};
      const byClient: Record<string, { clientId: string; mrrContribution: number }> = {};

      for (const sub of filtered) {
        const mv = monthlyValue(sub);
        const ccy = sub.currency ?? "UNKNOWN";
        byCurrency[ccy] ??= { count: 0, mrr: 0, arr: 0 };
        byCurrency[ccy].count += 1;
        byCurrency[ccy].mrr += mv;
        byCurrency[ccy].arr += mv * 12;

        const freq = frequencyLabel(sub);
        byFrequency[freq] ??= { count: 0, mrrContribution: 0 };
        byFrequency[freq].count += 1;
        byFrequency[freq].mrrContribution += mv;

        const cid = sub.client?._id;
        if (cid) {
          byClient[cid] ??= { clientId: cid, mrrContribution: 0 };
          byClient[cid].mrrContribution += mv;
        }
      }

      const topClients = Object.values(byClient)
        .sort((a, b) => b.mrrContribution - a.mrrContribution)
        .slice(0, 10);

      const round = (n: number) => Math.round(n * 100) / 100;
      for (const k of Object.keys(byCurrency)) {
        byCurrency[k]!.mrr = round(byCurrency[k]!.mrr);
        byCurrency[k]!.arr = round(byCurrency[k]!.arr);
      }
      for (const k of Object.keys(byFrequency)) {
        byFrequency[k]!.mrrContribution = round(byFrequency[k]!.mrrContribution);
      }
      for (const c of topClients) c.mrrContribution = round(c.mrrContribution);

      return {
        activeSubscriptions: filtered.length,
        byCurrency,
        byFrequency,
        topClients,
        note: "MRR normalizes each sub's amount to a monthly figure by intervalType+interval (e.g. annual × $1,200 → $100 MRR). ARR = MRR × 12.",
      };
    },
  };
}

export function createUpcomingRenewalsTool(client: PlutioClient): ToolDefinition {
  const schema = z.object({
    days: z.number().int().min(1).max(365).default(30).describe("Forecast window in days from today."),
    includeClientNames: z.boolean().default(true).describe("Resolve client IDs to names via an extra lookup."),
  });
  return {
    name: "plutio_upcoming_renewals",
    description:
      "Subscriptions that will issue their next invoice within the given window (default 30 days). Sorted by date ascending, with totals per currency.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const { days, includeClientNames } = schema.parse(rawArgs);
      const now = new Date();
      const end = new Date(now.getTime() + days * MS_PER_DAY);
      const subs = await client.list<Subscription[]>("invoice-subscriptions", {
        q: {
          status: "active",
          upcomingInvoiceDate: { $gte: now.toISOString(), $lt: end.toISOString() },
        },
        limit: 500,
      });
      const list = (Array.isArray(subs) ? subs : []).slice().sort((a, b) =>
        (a.upcomingInvoiceDate ?? "").localeCompare(b.upcomingInvoiceDate ?? ""),
      );

      const clientNames: Record<string, string> = {};
      if (includeClientNames) {
        const clientIds = [...new Set(list.map((s) => s.client?._id).filter(Boolean) as string[])];
        for (const id of clientIds) {
          try {
            const person = await client.get<{ name?: { first?: string; last?: string } }>("people", id);
            clientNames[id] = [person.name?.first, person.name?.last].filter(Boolean).join(" ") || id;
          } catch {
            clientNames[id] = id;
          }
        }
      }

      const totalsByCurrency: Record<string, number> = {};
      for (const s of list) {
        const ccy = s.currency ?? "UNKNOWN";
        totalsByCurrency[ccy] = (totalsByCurrency[ccy] ?? 0) + (s.amount ?? 0);
      }

      return {
        windowDays: days,
        count: list.length,
        totalsByCurrency,
        renewals: list.map((s) => ({
          id: s._id,
          title: s.title,
          clientId: s.client?._id,
          clientName: s.client?._id ? clientNames[s.client._id] : undefined,
          amount: s.amount,
          currency: s.currency,
          upcomingInvoiceDate: s.upcomingInvoiceDate,
          frequency: frequencyLabel(s),
        })),
      };
    },
  };
}

export function createInvoiceAgingTool(client: PlutioClient): ToolDefinition {
  const schema = z.object({
    asOf: z.string().optional().describe("Reference date (ISO). Default: now."),
    currency: z.string().optional().describe("Filter to one currency."),
  });
  return {
    name: "plutio_invoice_aging",
    description:
      "Aged unpaid-invoice report. Buckets overdue invoices by days past due (current/30-60/60-90/90+) with totals per bucket and per currency.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const { asOf, currency } = schema.parse(rawArgs);
      const refDate = asOf ? new Date(asOf) : new Date();
      const q: Record<string, unknown> = { status: { $ne: "paid" } };
      if (currency) q.currency = currency;
      const invoices = await client.list<Invoice[]>("invoices", {
        q,
        limit: 500,
      });
      const list = (Array.isArray(invoices) ? invoices : [])
        .slice()
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

      type Bucket = { count: number; totalsByCurrency: Record<string, number>; invoices: Array<unknown> };
      const mk = (): Bucket => ({ count: 0, totalsByCurrency: {}, invoices: [] });
      const buckets: Record<string, Bucket> = {
        current: mk(),
        "30-60": mk(),
        "60-90": mk(),
        "90+": mk(),
      };

      for (const inv of list) {
        if (!inv.dueDate) continue;
        const daysOverdue = Math.floor((refDate.getTime() - new Date(inv.dueDate).getTime()) / MS_PER_DAY);
        let bucketKey: keyof typeof buckets;
        if (daysOverdue < 30) bucketKey = "current";
        else if (daysOverdue < 60) bucketKey = "30-60";
        else if (daysOverdue < 90) bucketKey = "60-90";
        else bucketKey = "90+";
        const b = buckets[bucketKey];
        b.count += 1;
        const ccy = inv.currency ?? "UNKNOWN";
        b.totalsByCurrency[ccy] = (b.totalsByCurrency[ccy] ?? 0) + (inv.amount ?? 0);
        b.invoices.push({
          id: inv._id,
          invoiceId: inv.invoiceId,
          name: inv.name,
          clientId: inv.client?._id,
          amount: inv.amount,
          currency: inv.currency,
          dueDate: inv.dueDate,
          daysOverdue,
          status: inv.status,
        });
      }

      const grandTotals: Record<string, number> = {};
      for (const b of Object.values(buckets)) {
        for (const [ccy, amt] of Object.entries(b.totalsByCurrency)) {
          grandTotals[ccy] = (grandTotals[ccy] ?? 0) + amt;
        }
      }

      return {
        asOf: refDate.toISOString(),
        unpaidCount: list.length,
        grandTotalsByCurrency: grandTotals,
        buckets,
      };
    },
  };
}

export function createCashflowForecastTool(client: PlutioClient): ToolDefinition {
  const schema = z.object({
    days: z.number().int().min(1).max(365).default(90).describe("Forecast window in days."),
  });
  return {
    name: "plutio_cashflow_forecast",
    description:
      "Expected incoming revenue from active subscriptions over a forecast window (default 90 days). Expands the RRULE/repeat pattern to include multiple occurrences per sub, grouped by month.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const { days } = schema.parse(rawArgs);
      const now = new Date();
      const end = new Date(now.getTime() + days * MS_PER_DAY);
      const subs = await client.list<Subscription[]>("invoice-subscriptions", {
        q: { status: "active" },
        limit: 500,
      });
      const list = Array.isArray(subs) ? subs : [];

      type Occurrence = { subId: string; title?: string; clientId?: string; date: string; amount: number; currency: string };
      const events: Occurrence[] = [];
      const byMonth: Record<string, { count: number; totalsByCurrency: Record<string, number> }> = {};
      const byCurrency: Record<string, number> = {};

      for (const sub of list) {
        if (!sub.upcomingInvoiceDate) continue;
        const intervalType = sub.repeat?.intervalType ?? "month";
        const interval = sub.repeat?.interval ?? 1;
        if (!interval || interval < 1) continue;

        let cursor = new Date(sub.upcomingInvoiceDate);
        let guard = 200;
        while (cursor <= end && guard-- > 0) {
          if (cursor >= now) {
            const date = new Date(cursor);
            const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
            const ccy = sub.currency ?? "UNKNOWN";
            const amt = sub.amount ?? 0;
            events.push({
              subId: sub._id,
              title: sub.title,
              clientId: sub.client?._id,
              date: date.toISOString(),
              amount: amt,
              currency: ccy,
            });
            byMonth[month] ??= { count: 0, totalsByCurrency: {} };
            byMonth[month].count += 1;
            byMonth[month].totalsByCurrency[ccy] = (byMonth[month].totalsByCurrency[ccy] ?? 0) + amt;
            byCurrency[ccy] = (byCurrency[ccy] ?? 0) + amt;
          }
          switch (intervalType) {
            case "day":
              cursor.setUTCDate(cursor.getUTCDate() + interval);
              break;
            case "week":
              cursor.setUTCDate(cursor.getUTCDate() + 7 * interval);
              break;
            case "month":
              cursor.setUTCMonth(cursor.getUTCMonth() + interval);
              break;
            case "year":
              cursor.setUTCFullYear(cursor.getUTCFullYear() + interval);
              break;
            default:
              guard = 0;
          }
        }
      }

      events.sort((a, b) => a.date.localeCompare(b.date));
      return {
        windowDays: days,
        totalExpectedByCurrency: byCurrency,
        occurrenceCount: events.length,
        byMonth,
        events,
      };
    },
  };
}
