/**
 * The window a report covers, from the query string.
 *
 * Pure so it can be tested without a clock: `now` is passed in. A
 * preset names a span ending now; "custom" reads two calendar dates
 * and covers them whole, in UTC, which is the one time zone a report
 * over several stores can honestly claim. Anything malformed falls
 * back to the last thirty days rather than an empty or infinite span.
 */

export type Period = "today" | "7d" | "30d" | "90d" | "all" | "custom";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom dates" },
];

export interface ReportRange {
  period: Period;
  /** Inclusive start, ISO. */
  from: string;
  /** Exclusive end, ISO. */
  to: string;
  /** The custom dates as typed, for the form to show again. */
  fromDate: string;
  toDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything cardflare has ever recorded starts after this. */
const EPOCH = "2026-01-01T00:00:00.000Z";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function startOfUtcDay(at: number): number {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function isPeriod(value: string | undefined): value is Period {
  return PERIODS.some((entry) => entry.value === value);
}

export function rangeFor(
  params: { period?: string; from?: string; to?: string },
  now: number = Date.now(),
): ReportRange {
  const period: Period = isPeriod(params.period) ? params.period : "30d";
  const end = new Date(now).toISOString();

  const preset = (days: number): ReportRange => ({
    period,
    from: new Date(now - days * DAY_MS).toISOString(),
    to: end,
    fromDate: "",
    toDate: "",
  });

  switch (period) {
    case "today":
      return {
        period,
        from: new Date(startOfUtcDay(now)).toISOString(),
        to: end,
        fromDate: "",
        toDate: "",
      };
    case "7d":
      return preset(7);
    case "90d":
      return preset(90);
    case "all":
      return { period, from: EPOCH, to: end, fromDate: "", toDate: "" };
    case "custom": {
      const fromOk = params.from !== undefined && DATE.test(params.from);
      const toOk = params.to !== undefined && DATE.test(params.to);
      if (!fromOk || !toOk) return { ...preset(30), period: "30d" };

      const from = Date.parse(`${params.from}T00:00:00.000Z`);
      const toStart = Date.parse(`${params.to}T00:00:00.000Z`);
      if (!Number.isFinite(from) || !Number.isFinite(toStart) || toStart < from) {
        return { ...preset(30), period: "30d" };
      }

      return {
        period,
        from: new Date(from).toISOString(),
        /* The end date is included whole: through the last moment of it. */
        to: new Date(toStart + DAY_MS).toISOString(),
        fromDate: params.from!,
        toDate: params.to!,
      };
    }
    default:
      return preset(30);
  }
}
