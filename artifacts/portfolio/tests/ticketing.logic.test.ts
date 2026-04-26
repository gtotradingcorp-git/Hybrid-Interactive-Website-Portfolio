import { test } from "vitest";
import assert from "node:assert/strict";
import {
  type Ticket,
  INITIAL_COUNTER,
  SLA_MINUTES,
  advanceTicket,
  buildTicketCsvRows,
  classifySla,
  createTicket,
  filterTickets,
  formatRemaining,
  getSeedTickets,
  resetTickets,
  summarizeTickets,
} from "@/components/demos/ticketing.logic";

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

test("getSeedTickets returns the four seed tickets relative to now", () => {
  const seeds = getSeedTickets(NOW);
  assert.equal(seeds.length, 4);
  assert.deepEqual(
    seeds.map((t) => t.id).sort(),
    ["TKT-1039", "TKT-1040", "TKT-1041", "TKT-1042"],
  );
  // Resolved seed should have a resolvedAt
  const resolved = seeds.find((t) => t.id === "TKT-1039")!;
  assert.equal(resolved.status, "resolved");
  assert.ok(typeof resolved.resolvedAt === "number");
});

test("getSeedTickets returns fresh objects each call (safe to mutate)", () => {
  const a = getSeedTickets(NOW);
  const b = getSeedTickets(NOW);
  assert.notEqual(a, b);
  assert.notEqual(a[0], b[0]);
});

test("createTicket adds a new open ticket and increments the counter", () => {
  const tickets = getSeedTickets(NOW);
  const result = createTicket(
    tickets,
    INITIAL_COUNTER,
    {
      title: "VPN failing",
      requester: "Lara Velasco",
      assignee: "Network Team",
      priority: "high",
    },
    NOW,
  );
  assert.ok(result.created);
  assert.equal(result.created!.id, `TKT-${INITIAL_COUNTER}`);
  assert.equal(result.created!.status, "open");
  assert.equal(result.created!.createdAt, NOW);
  assert.equal(result.counter, INITIAL_COUNTER + 1);
  assert.equal(result.tickets.length, tickets.length + 1);
  // Newly created ticket is the first entry
  assert.equal(result.tickets[0].id, `TKT-${INITIAL_COUNTER}`);
});

test("createTicket trims whitespace from inputs", () => {
  const result = createTicket(
    [],
    INITIAL_COUNTER,
    {
      title: "  Outlook crashes  ",
      requester: "  Anna  ",
      assignee: "L1 Support",
      priority: "medium",
    },
    NOW,
  );
  assert.equal(result.created!.title, "Outlook crashes");
  assert.equal(result.created!.requester, "Anna");
});

test("createTicket rejects empty title or requester", () => {
  const tickets = getSeedTickets(NOW);
  const empty1 = createTicket(
    tickets,
    INITIAL_COUNTER,
    { title: "   ", requester: "Anna", assignee: "L1", priority: "low" },
    NOW,
  );
  assert.equal(empty1.created, null);
  assert.equal(empty1.tickets, tickets);
  assert.equal(empty1.counter, INITIAL_COUNTER);

  const empty2 = createTicket(
    tickets,
    INITIAL_COUNTER,
    { title: "Outlook", requester: "", assignee: "L1", priority: "low" },
    NOW,
  );
  assert.equal(empty2.created, null);
});

test("advanceTicket: open → in_progress, in_progress → resolved (with resolvedAt)", () => {
  const open: Ticket = {
    id: "T-1",
    title: "x",
    requester: "y",
    assignee: "z",
    priority: "high",
    status: "open",
    createdAt: NOW - 60_000,
  };
  const inProgress: Ticket = { ...open, id: "T-2", status: "in_progress" };
  const resolved: Ticket = {
    ...open,
    id: "T-3",
    status: "resolved",
    resolvedAt: NOW - 1000,
  };
  const list = [open, inProgress, resolved];

  const a = advanceTicket(list, "T-1", NOW);
  assert.equal(a.find((t) => t.id === "T-1")!.status, "in_progress");

  const b = advanceTicket(a, "T-2", NOW);
  const t2 = b.find((t) => t.id === "T-2")!;
  assert.equal(t2.status, "resolved");
  assert.equal(t2.resolvedAt, NOW);

  // Resolved tickets are unchanged
  const c = advanceTicket(b, "T-3", NOW);
  assert.deepEqual(c.find((t) => t.id === "T-3"), resolved);
});

test("advanceTicket leaves unrelated tickets untouched", () => {
  const tickets = getSeedTickets(NOW);
  const result = advanceTicket(tickets, "TKT-1041", NOW);
  for (const t of result) {
    if (t.id !== "TKT-1041") {
      assert.deepEqual(
        t,
        tickets.find((s) => s.id === t.id),
      );
    }
  }
});

test("filterTickets: status filter narrows to matching status", () => {
  const tickets = getSeedTickets(NOW);
  const open = filterTickets(tickets, "open", "all");
  assert.ok(open.every((t) => t.status === "open"));
  assert.equal(open.length, 2);

  const resolved = filterTickets(tickets, "resolved", "all");
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, "TKT-1039");

  const inProgress = filterTickets(tickets, "in_progress", "all");
  assert.equal(inProgress.length, 1);
  assert.equal(inProgress[0].id, "TKT-1042");
});

test("filterTickets: priority filter narrows to matching priority", () => {
  const tickets = getSeedTickets(NOW);
  const critical = filterTickets(tickets, "all", "critical");
  assert.equal(critical.length, 1);
  assert.equal(critical[0].id, "TKT-1041");

  const low = filterTickets(tickets, "all", "low");
  assert.equal(low.length, 1);
  assert.equal(low[0].id, "TKT-1040");
});

test("filterTickets: combines status and priority filters", () => {
  const tickets = getSeedTickets(NOW);
  // No critical resolved tickets in seed
  const none = filterTickets(tickets, "resolved", "critical");
  assert.equal(none.length, 0);
  const oneOpenCritical = filterTickets(tickets, "open", "critical");
  assert.equal(oneOpenCritical.length, 1);
  assert.equal(oneOpenCritical[0].id, "TKT-1041");
});

test("filterTickets: 'all' returns everything sorted newest first", () => {
  const tickets = getSeedTickets(NOW);
  const all = filterTickets(tickets, "all", "all");
  assert.equal(all.length, tickets.length);
  // Verify createdAt is descending
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i - 1].createdAt >= all[i].createdAt);
  }
});

test("resetTickets returns a fresh seed and default filters", () => {
  const fresh = resetTickets(NOW);
  assert.equal(fresh.tickets.length, 4);
  assert.equal(fresh.counter, INITIAL_COUNTER);
  assert.equal(fresh.filterStatus, "all");
  assert.equal(fresh.filterPriority, "all");
});

test("classifySla: resolved tickets are 'closed' regardless of timing", () => {
  const t: Ticket = {
    id: "T-1",
    title: "x",
    requester: "y",
    assignee: "z",
    priority: "critical",
    // Ancient ticket would be overdue if not resolved
    createdAt: NOW - 1000 * 60 * 60 * 100,
    status: "resolved",
    resolvedAt: NOW - 1000,
  };
  assert.equal(classifySla(t, NOW), "closed");
});

test("classifySla: 'on-track' when within SLA window", () => {
  const t: Ticket = {
    id: "T-1",
    title: "x",
    requester: "y",
    assignee: "z",
    priority: "high",
    // 30 min ago, SLA is 4h → on-track
    createdAt: NOW - 30 * 60 * 1000,
    status: "open",
  };
  assert.equal(classifySla(t, NOW), "on-track");
});

test("classifySla: 'overdue' when past SLA deadline", () => {
  const t: Ticket = {
    id: "T-1",
    title: "x",
    requester: "y",
    assignee: "z",
    priority: "critical",
    // 2h ago, critical SLA is 60 min → overdue
    createdAt: NOW - 2 * 60 * 60 * 1000,
    status: "in_progress",
  };
  assert.equal(classifySla(t, NOW), "overdue");
});

test("classifySla: edge case at exact SLA deadline is on-track", () => {
  const t: Ticket = {
    id: "T-1",
    title: "x",
    requester: "y",
    assignee: "z",
    priority: "low",
    // Exactly at deadline: now == createdAt + SLA
    createdAt: NOW - SLA_MINUTES.low * 60 * 1000,
    status: "open",
  };
  // The implementation uses `now > sla` for overdue, so equality is on-track.
  assert.equal(classifySla(t, NOW), "on-track");
});

test("summarizeTickets counts open, overdue, and resolved", () => {
  const tickets: Ticket[] = [
    {
      id: "a",
      title: "",
      requester: "",
      assignee: "",
      priority: "critical",
      // 2h ago, critical → overdue
      createdAt: NOW - 2 * 60 * 60 * 1000,
      status: "open",
    },
    {
      id: "b",
      title: "",
      requester: "",
      assignee: "",
      priority: "high",
      // 30 min ago, high → on-track open
      createdAt: NOW - 30 * 60 * 1000,
      status: "in_progress",
    },
    {
      id: "c",
      title: "",
      requester: "",
      assignee: "",
      priority: "medium",
      createdAt: NOW - 1000,
      status: "resolved",
      resolvedAt: NOW - 500,
    },
  ];
  const stats = summarizeTickets(tickets, NOW);
  assert.deepEqual(stats, { open: 2, overdue: 1, resolved: 1 });
});

test("formatRemaining: hours/minutes for positive remaining > 1h", () => {
  assert.equal(formatRemaining(2 * 60 * 60 * 1000 + 30 * 60 * 1000), "2h 30m");
});

test("formatRemaining: minutes/seconds for positive remaining < 1h", () => {
  assert.equal(formatRemaining(5 * 60 * 1000 + 12 * 1000), "5m 12s");
});

test("formatRemaining: 'Overdue' prefix when remaining is non-positive", () => {
  assert.equal(formatRemaining(-(60 * 60 * 1000 + 5 * 60 * 1000)), "Overdue 1h 5m");
  assert.equal(formatRemaining(0), "Overdue 0h 0m");
});

test("buildTicketCsvRows: header plus a row per ticket with SLA labels", () => {
  const tickets: Ticket[] = [
    {
      id: "T-overdue",
      title: "VPN, contains, comma",
      requester: 'Quote " test',
      assignee: "L1",
      priority: "critical",
      createdAt: NOW - 2 * 60 * 60 * 1000,
      status: "open",
    },
    {
      id: "T-ontrack",
      title: "Stable",
      requester: "Anna",
      assignee: "L2",
      priority: "high",
      createdAt: NOW - 10 * 60 * 1000,
      status: "in_progress",
    },
    {
      id: "T-closed",
      title: "Done",
      requester: "Ben",
      assignee: "L1",
      priority: "low",
      createdAt: NOW - 5 * 60 * 60 * 1000,
      status: "resolved",
      resolvedAt: NOW - 60 * 1000,
    },
  ];
  const rows = buildTicketCsvRows(tickets, NOW);
  assert.equal(rows.length, tickets.length + 1);
  assert.deepEqual(rows[0], [
    "ID",
    "Title",
    "Requester",
    "Assignee",
    "Priority",
    "Status",
    "Created",
    "Resolved",
    "SLA Status",
  ]);
  // SLA labels by row order
  assert.equal(rows[1][rows[1].length - 1], "Overdue");
  assert.equal(rows[2][rows[2].length - 1], "On Track");
  assert.equal(rows[3][rows[3].length - 1], "Closed");
  // Created/Resolved formatted as ISO strings
  assert.equal(rows[1][6], new Date(tickets[0].createdAt).toISOString());
  assert.equal(rows[3][7], new Date(tickets[2].resolvedAt!).toISOString());
  // Empty resolved cell when not resolved
  assert.equal(rows[1][7], "");
});
