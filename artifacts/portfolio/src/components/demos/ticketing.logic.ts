export type Priority = "low" | "medium" | "high" | "critical";
export type Status = "open" | "in_progress" | "resolved";
export type SlaStatus = "on-track" | "overdue" | "closed";

export interface Ticket {
  id: string;
  title: string;
  requester: string;
  assignee: string;
  priority: Priority;
  status: Status;
  createdAt: number;
  resolvedAt?: number;
}

export interface CreateTicketInput {
  title: string;
  requester: string;
  assignee: string;
  priority: Priority;
}

export const SLA_MINUTES: Record<Priority, number> = {
  critical: 60,
  high: 4 * 60,
  medium: 8 * 60,
  low: 24 * 60,
};

export const INITIAL_COUNTER = 1043;

export function getSeedTickets(now: number = Date.now()): Ticket[] {
  return [
    {
      id: "TKT-1042",
      title: "Outlook not syncing for retail branch staff",
      requester: "Anna Reyes",
      assignee: "L1 Support",
      priority: "high",
      status: "in_progress",
      createdAt: now - 1000 * 60 * 90,
    },
    {
      id: "TKT-1041",
      title: "POS terminal — receipt printer offline",
      requester: "Jose Cruz",
      assignee: "Field Tech",
      priority: "critical",
      status: "open",
      createdAt: now - 1000 * 60 * 25,
    },
    {
      id: "TKT-1040",
      title: "Request: install Power BI desktop on finance laptop",
      requester: "Mira Tan",
      assignee: "L2 Support",
      priority: "low",
      status: "open",
      createdAt: now - 1000 * 60 * 60 * 6,
    },
    {
      id: "TKT-1039",
      title: "Password reset for warehouse scanner login",
      requester: "Ben Aquino",
      assignee: "L1 Support",
      priority: "medium",
      status: "resolved",
      createdAt: now - 1000 * 60 * 60 * 26,
      resolvedAt: now - 1000 * 60 * 60 * 4,
    },
  ];
}

export function createTicket(
  tickets: Ticket[],
  counter: number,
  input: CreateTicketInput,
  now: number = Date.now(),
): { tickets: Ticket[]; counter: number; created: Ticket | null } {
  const title = input.title.trim();
  const requester = input.requester.trim();
  if (!title || !requester) {
    return { tickets, counter, created: null };
  }
  const created: Ticket = {
    id: `TKT-${counter}`,
    title,
    requester,
    assignee: input.assignee,
    priority: input.priority,
    status: "open",
    createdAt: now,
  };
  return {
    tickets: [created, ...tickets],
    counter: counter + 1,
    created,
  };
}

export function advanceTicket(
  tickets: Ticket[],
  id: string,
  now: number = Date.now(),
): Ticket[] {
  return tickets.map((t) => {
    if (t.id !== id) return t;
    if (t.status === "open") return { ...t, status: "in_progress" };
    if (t.status === "in_progress")
      return { ...t, status: "resolved", resolvedAt: now };
    return t;
  });
}

export function filterTickets(
  tickets: Ticket[],
  filterStatus: Status | "all",
  filterPriority: Priority | "all",
): Ticket[] {
  return tickets
    .filter((t) => filterStatus === "all" || t.status === filterStatus)
    .filter((t) => filterPriority === "all" || t.priority === filterPriority)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function resetTickets(now: number = Date.now()): {
  tickets: Ticket[];
  counter: number;
  filterStatus: "all";
  filterPriority: "all";
} {
  return {
    tickets: getSeedTickets(now),
    counter: INITIAL_COUNTER,
    filterStatus: "all",
    filterPriority: "all",
  };
}

export function slaDeadline(ticket: Ticket): number {
  return ticket.createdAt + SLA_MINUTES[ticket.priority] * 60 * 1000;
}

export function classifySla(ticket: Ticket, now: number): SlaStatus {
  if (ticket.status === "resolved") return "closed";
  return now > slaDeadline(ticket) ? "overdue" : "on-track";
}

export function summarizeTickets(
  tickets: Ticket[],
  now: number,
): { open: number; overdue: number; resolved: number } {
  let open = 0;
  let overdue = 0;
  let resolved = 0;
  for (const t of tickets) {
    if (t.status === "resolved") {
      resolved += 1;
      continue;
    }
    open += 1;
    if (now > slaDeadline(t)) overdue += 1;
  }
  return { open, overdue, resolved };
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) {
    const overdue = Math.abs(ms);
    const hours = Math.floor(overdue / (1000 * 60 * 60));
    const minutes = Math.floor((overdue % (1000 * 60 * 60)) / (1000 * 60));
    return `Overdue ${hours}h ${minutes}m`;
  }
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function csvEscape(value: string | number | undefined): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildTicketCsvRows(
  tickets: Ticket[],
  now: number,
): (string | number | undefined)[][] {
  const header = [
    "ID",
    "Title",
    "Requester",
    "Assignee",
    "Priority",
    "Status",
    "Created",
    "Resolved",
    "SLA Status",
  ];
  const labelFor: Record<SlaStatus, string> = {
    closed: "Closed",
    overdue: "Overdue",
    "on-track": "On Track",
  };
  const rows: (string | number | undefined)[][] = [header];
  for (const t of tickets) {
    rows.push([
      t.id,
      t.title,
      t.requester,
      t.assignee,
      t.priority,
      t.status,
      new Date(t.createdAt).toISOString(),
      t.resolvedAt ? new Date(t.resolvedAt).toISOString() : "",
      labelFor[classifySla(t, now)],
    ]);
  }
  return rows;
}
