export type AgeingBucket = "0-3d" | "4-7d" | "8-14d" | "15d+";

export interface DayRow {
  date: string;
  ts: number;
  tickets: number;
  resolved: number;
  costPhp: number;
  category: string;
  ageingBucket: AgeingBucket;
}

export const CATEGORIES = [
  "Network & VPN",
  "Workstation",
  "ERP / POS",
  "Email & Collab",
  "Access & Security",
];

export const AGEING_BUCKETS: readonly AgeingBucket[] = [
  "0-3d",
  "4-7d",
  "8-14d",
  "15d+",
] as const;

export const SEED_DAY_COUNT = 90;
export const DEFAULT_RANGE_DAYS = 30;

export function seedData(today: Date = new Date()): DayRow[] {
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const rows: DayRow[] = [];
  for (let i = SEED_DAY_COUNT - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const baseTickets = 14 + Math.floor(rand() * 12);
    const tickets = baseTickets + (i % 7 === 0 ? 6 : 0);
    const resolved = Math.max(0, tickets - Math.floor(rand() * 4));
    const costPhp = Math.floor(2200 + rand() * 1800 + (SEED_DAY_COUNT - i) * 8);
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    const ageingBucket =
      AGEING_BUCKETS[Math.floor(rand() * AGEING_BUCKETS.length)];
    rows.push({
      date: d.toISOString().slice(0, 10),
      ts: d.getTime(),
      tickets,
      resolved,
      costPhp,
      category,
      ageingBucket,
    });
  }
  return rows;
}

export function selectRange(data: DayRow[], days: number): DayRow[] {
  if (days <= 0) return [];
  return data.slice(-days);
}

export function selectPreviousRange(data: DayRow[], days: number): DayRow[] {
  if (days <= 0) return [];
  const start = Math.max(0, data.length - days * 2);
  const end = Math.max(0, data.length - days);
  return data.slice(start, end);
}

export interface Kpis {
  totalTickets: number;
  totalResolved: number;
  totalCost: number;
  slaPct: number;
  ticketDelta: number;
  costDelta: number;
  slaDelta: number;
}

function sumField(
  rows: DayRow[],
  key: "tickets" | "resolved" | "costPhp",
): number {
  return rows.reduce((acc, r) => acc + r[key], 0);
}

export function computeKpis(filtered: DayRow[], previous: DayRow[]): Kpis {
  const totalTickets = sumField(filtered, "tickets");
  const totalResolved = sumField(filtered, "resolved");
  const totalCost = sumField(filtered, "costPhp");
  const slaPct =
    totalTickets === 0 ? 0 : Math.round((totalResolved / totalTickets) * 100);

  const prevTickets = sumField(previous, "tickets");
  const prevResolved = sumField(previous, "resolved");
  const prevCost = sumField(previous, "costPhp");
  const prevSla =
    prevTickets === 0 ? 0 : Math.round((prevResolved / prevTickets) * 100);

  const ticketDelta =
    prevTickets === 0
      ? 0
      : ((totalTickets - prevTickets) / prevTickets) * 100;
  const costDelta =
    prevCost === 0 ? 0 : ((totalCost - prevCost) / prevCost) * 100;
  const slaDelta = slaPct - prevSla;

  return {
    totalTickets,
    totalResolved,
    totalCost,
    slaPct,
    ticketDelta,
    costDelta,
    slaDelta,
  };
}

export function aggregateByCategory(
  filtered: DayRow[],
): { category: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of filtered) {
    map.set(r.category, (map.get(r.category) ?? 0) + r.tickets);
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function aggregateByAgeing(
  filtered: DayRow[],
): { bucket: AgeingBucket; count: number }[] {
  const map = new Map<AgeingBucket, number>();
  for (const r of filtered) {
    map.set(r.ageingBucket, (map.get(r.ageingBucket) ?? 0) + r.tickets);
  }
  return AGEING_BUCKETS.map((bucket) => ({
    bucket,
    count: map.get(bucket) ?? 0,
  }));
}

export function buildBiCsvRows(
  filtered: DayRow[],
): (string | number)[][] {
  const rows: (string | number)[][] = [
    ["Date", "Tickets", "Resolved", "Cost (PHP)", "Category", "Ageing"],
  ];
  for (const r of filtered) {
    rows.push([
      r.date,
      r.tickets,
      r.resolved,
      r.costPhp,
      r.category,
      r.ageingBucket,
    ]);
  }
  return rows;
}

export function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function serializeCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}
