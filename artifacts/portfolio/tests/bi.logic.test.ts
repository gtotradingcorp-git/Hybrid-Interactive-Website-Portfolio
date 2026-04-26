import { test } from "vitest";
import assert from "node:assert/strict";
import {
  type DayRow,
  AGEING_BUCKETS,
  CATEGORIES,
  SEED_DAY_COUNT,
  aggregateByAgeing,
  aggregateByCategory,
  buildBiCsvRows,
  computeKpis,
  csvEscape,
  seedData,
  selectPreviousRange,
  selectRange,
  serializeCsv,
} from "@/components/demos/bi.logic";

const TODAY = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));

test("seedData returns SEED_DAY_COUNT rows in chronological order", () => {
  const data = seedData(TODAY);
  assert.equal(data.length, SEED_DAY_COUNT);
  for (let i = 1; i < data.length; i++) {
    assert.ok(data[i - 1].ts <= data[i].ts);
  }
});

test("seedData is deterministic given the same date", () => {
  const a = seedData(TODAY);
  const b = seedData(TODAY);
  assert.deepEqual(a, b);
});

test("seedData rows use the documented categories and ageing buckets", () => {
  const data = seedData(TODAY);
  for (const row of data) {
    assert.ok(CATEGORIES.includes(row.category));
    assert.ok((AGEING_BUCKETS as readonly string[]).includes(row.ageingBucket));
    assert.ok(row.tickets >= 0);
    assert.ok(row.resolved >= 0);
    assert.ok(row.costPhp >= 0);
  }
});

test("selectRange returns the last N rows (and clamps to data length)", () => {
  const data = seedData(TODAY);
  const last7 = selectRange(data, 7);
  assert.equal(last7.length, 7);
  assert.deepEqual(last7, data.slice(-7));

  // Range larger than data simply returns all rows
  const huge = selectRange(data, 999);
  assert.equal(huge.length, data.length);
});

test("selectRange returns [] for non-positive days", () => {
  const data = seedData(TODAY);
  assert.deepEqual(selectRange(data, 0), []);
  assert.deepEqual(selectRange(data, -5), []);
});

test("selectPreviousRange returns the window immediately before the current range", () => {
  const data = seedData(TODAY);
  const days = 30;
  const current = selectRange(data, days);
  const previous = selectPreviousRange(data, days);
  assert.equal(previous.length, days);
  // The two windows must not overlap; previous ends right before current starts.
  assert.ok(previous[previous.length - 1].ts < current[0].ts);
  // Previous window matches data slice
  assert.deepEqual(
    previous,
    data.slice(data.length - days * 2, data.length - days),
  );
});

test("selectPreviousRange returns [] when range is non-positive", () => {
  const data = seedData(TODAY);
  assert.deepEqual(selectPreviousRange(data, 0), []);
});

test("selectPreviousRange clamps to start when not enough history", () => {
  const data = seedData(TODAY);
  // 60 days range over 90 days of data: previous window only has 30 rows
  const previous = selectPreviousRange(data, 60);
  assert.equal(previous.length, 30);
  assert.deepEqual(previous, data.slice(0, 30));
});

test("computeKpis sums tickets/resolved/cost across the filtered window", () => {
  const filtered: DayRow[] = [
    {
      date: "2026-01-01",
      ts: 0,
      tickets: 10,
      resolved: 8,
      costPhp: 1000,
      category: "Workstation",
      ageingBucket: "0-3d",
    },
    {
      date: "2026-01-02",
      ts: 1,
      tickets: 20,
      resolved: 15,
      costPhp: 2000,
      category: "Workstation",
      ageingBucket: "0-3d",
    },
  ];
  const previous: DayRow[] = [
    {
      date: "2025-12-30",
      ts: -2,
      tickets: 30,
      resolved: 24,
      costPhp: 1500,
      category: "Workstation",
      ageingBucket: "0-3d",
    },
  ];
  const kpis = computeKpis(filtered, previous);
  assert.equal(kpis.totalTickets, 30);
  assert.equal(kpis.totalResolved, 23);
  assert.equal(kpis.totalCost, 3000);
  // 23 / 30 = 0.7666... → rounded to 77
  assert.equal(kpis.slaPct, 77);
});

test("computeKpis ticket and cost deltas vs previous period (percent)", () => {
  const filtered: DayRow[] = [
    {
      date: "a",
      ts: 0,
      tickets: 200,
      resolved: 150,
      costPhp: 2000,
      category: "x",
      ageingBucket: "0-3d",
    },
  ];
  const previous: DayRow[] = [
    {
      date: "b",
      ts: -1,
      tickets: 100,
      resolved: 80,
      costPhp: 1000,
      category: "x",
      ageingBucket: "0-3d",
    },
  ];
  const kpis = computeKpis(filtered, previous);
  assert.equal(kpis.ticketDelta, 100); // +100%
  assert.equal(kpis.costDelta, 100); // +100%
  // SLA: now 75% (150/200), prev 80% (80/100) → -5 pts
  assert.equal(kpis.slaPct, 75);
  assert.equal(kpis.slaDelta, -5);
});

test("computeKpis: zero previous window yields zero deltas (no division by zero)", () => {
  const filtered: DayRow[] = [
    {
      date: "a",
      ts: 0,
      tickets: 5,
      resolved: 4,
      costPhp: 100,
      category: "x",
      ageingBucket: "0-3d",
    },
  ];
  const kpis = computeKpis(filtered, []);
  assert.equal(kpis.ticketDelta, 0);
  assert.equal(kpis.costDelta, 0);
  assert.equal(kpis.slaDelta, kpis.slaPct);
});

test("computeKpis: empty filtered window yields zero KPIs", () => {
  const kpis = computeKpis([], []);
  assert.deepEqual(kpis, {
    totalTickets: 0,
    totalResolved: 0,
    totalCost: 0,
    slaPct: 0,
    ticketDelta: 0,
    costDelta: 0,
    slaDelta: 0,
  });
});

test("aggregateByCategory sums tickets per category, sorted descending", () => {
  const rows: DayRow[] = [
    {
      date: "1",
      ts: 1,
      tickets: 5,
      resolved: 0,
      costPhp: 0,
      category: "A",
      ageingBucket: "0-3d",
    },
    {
      date: "2",
      ts: 2,
      tickets: 7,
      resolved: 0,
      costPhp: 0,
      category: "B",
      ageingBucket: "0-3d",
    },
    {
      date: "3",
      ts: 3,
      tickets: 3,
      resolved: 0,
      costPhp: 0,
      category: "A",
      ageingBucket: "0-3d",
    },
  ];
  const result = aggregateByCategory(rows);
  assert.deepEqual(result, [
    { category: "A", count: 8 },
    { category: "B", count: 7 },
  ]);
});

test("aggregateByAgeing returns counts in canonical bucket order with zeros for missing buckets", () => {
  const rows: DayRow[] = [
    {
      date: "1",
      ts: 1,
      tickets: 3,
      resolved: 0,
      costPhp: 0,
      category: "x",
      ageingBucket: "0-3d",
    },
    {
      date: "2",
      ts: 2,
      tickets: 4,
      resolved: 0,
      costPhp: 0,
      category: "x",
      ageingBucket: "15d+",
    },
    {
      date: "3",
      ts: 3,
      tickets: 2,
      resolved: 0,
      costPhp: 0,
      category: "x",
      ageingBucket: "0-3d",
    },
  ];
  const result = aggregateByAgeing(rows);
  assert.deepEqual(result, [
    { bucket: "0-3d", count: 5 },
    { bucket: "4-7d", count: 0 },
    { bucket: "8-14d", count: 0 },
    { bucket: "15d+", count: 4 },
  ]);
});

test("buildBiCsvRows returns header plus one row per day with the right shape", () => {
  const data = seedData(TODAY);
  const filtered = selectRange(data, 7);
  const rows = buildBiCsvRows(filtered);
  assert.equal(rows.length, filtered.length + 1);
  assert.deepEqual(rows[0], [
    "Date",
    "Tickets",
    "Resolved",
    "Cost (PHP)",
    "Category",
    "Ageing",
  ]);
  // Each row should have exactly 6 columns matching the header
  for (let i = 1; i < rows.length; i++) {
    assert.equal(rows[i].length, 6);
  }
  // Spot-check first data row
  const first = filtered[0];
  assert.deepEqual(rows[1], [
    first.date,
    first.tickets,
    first.resolved,
    first.costPhp,
    first.category,
    first.ageingBucket,
  ]);
});

test("csvEscape quotes values with commas, quotes, or newlines", () => {
  assert.equal(csvEscape("plain"), "plain");
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape('she said "hi"'), '"she said ""hi"""');
  assert.equal(csvEscape("line1\nline2"), '"line1\nline2"');
  assert.equal(csvEscape(42), "42");
});

test("serializeCsv joins rows correctly", () => {
  const rows: (string | number)[][] = [
    ["a", "b"],
    ["1", "2,3"],
  ];
  assert.equal(serializeCsv(rows), 'a,b\n1,"2,3"');
});
