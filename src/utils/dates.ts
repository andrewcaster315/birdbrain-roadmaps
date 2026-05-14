// Date helpers. ISO date strings ("YYYY-MM-DD") to dodge timezone surprises.

import type { Granularity, QuarterMode } from "../types";

export const toDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
};

export const toISO = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const addDays = (d: Date, days: number): Date => {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export const startOfWeek = (d: Date): Date => {
  // ISO week: Monday=1, Sunday=7
  const day = d.getUTCDay() || 7;
  return addDays(d, 1 - day);
};

export const startOfMonth = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export const startOfQuarterCY = (d: Date): Date => {
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
};

// FY math. fyStartMonth is 1..12.
export const startOfQuarterFY = (d: Date, fyStartMonth: number): Date => {
  const startMonth0 = fyStartMonth - 1; // 0..11
  const md = d.getUTCMonth();
  const yd = d.getUTCFullYear();
  const offset = (md - startMonth0 + 12) % 12; // 0..11
  const quarterIndex = Math.floor(offset / 3); // 0..3
  const quarterStartMonth = (startMonth0 + quarterIndex * 3) % 12;
  // Determine the calendar year of quarterStartMonth.
  const year = quarterStartMonth <= md ? yd : yd - 1;
  return new Date(Date.UTC(year, quarterStartMonth, 1));
};

type BucketOpts = { mode?: QuarterMode; fyStartMonth?: number };

export const startOfBucket = (
  d: Date,
  g: Granularity,
  opts?: BucketOpts
): Date => {
  if (g === "weeks") return startOfWeek(d);
  if (g === "months") return startOfMonth(d);
  // quarters
  if (opts?.mode === "FY" && opts.fyStartMonth) {
    return startOfQuarterFY(d, opts.fyStartMonth);
  }
  return startOfQuarterCY(d);
};

export const addUnit = (
  d: Date,
  n: number,
  g: Granularity
): Date => {
  const next = new Date(d);
  if (g === "weeks") next.setUTCDate(next.getUTCDate() + n * 7);
  else if (g === "months") next.setUTCMonth(next.getUTCMonth() + n);
  else next.setUTCMonth(next.getUTCMonth() + n * 3);
  return next;
};

export const labelForBucket = (
  d: Date,
  g: Granularity,
  opts?: BucketOpts
): string => {
  if (g === "weeks") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  if (g === "months") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  // quarters
  if (opts?.mode === "FY" && opts.fyStartMonth) {
    const startMonth0 = opts.fyStartMonth - 1;
    const md = d.getUTCMonth();
    const yd = d.getUTCFullYear();
    // The FY year is named after the calendar year of the FY start.
    const fyYear = md >= startMonth0 ? yd : yd - 1;
    const offset = (md - startMonth0 + 12) % 12;
    const quarterIndex = Math.floor(offset / 3);
    return `FY${fyYear} Q${quarterIndex + 1}`;
  }
  // CY
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
};

// Given a starting bucket date, generate `count` consecutive bucket starts.
export const generateBuckets = (
  start: Date,
  count: number,
  g: Granularity
): Date[] => {
  const list: Date[] = [];
  for (let i = 0; i < count; i++) {
    list.push(addUnit(start, i, g));
  }
  return list;
};

export const dayDiff = (a: Date, b: Date): number => {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
};

export const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  return toDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const todayISO = (): string => toISO(new Date());

// "Add N days to an ISO date" — returns a new ISO.
export const addDaysISO = (iso: string, days: number): string =>
  toISO(addDays(toDate(iso), days));

// Smaller-of and larger-of for ISO date strings (lexicographic === chronological for ISO).
export const minISO = (a: string, b: string): string => (a < b ? a : b);
export const maxISO = (a: string, b: string): string => (a > b ? a : b);
