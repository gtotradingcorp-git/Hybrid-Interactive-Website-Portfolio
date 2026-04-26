import React, { useEffect, useMemo, useState } from "react";
import { Plus, Download, RotateCcw, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trackDemoEvent, trackFirstInteraction } from "@/lib/demoTelemetry";
import { usePersistentDemoState } from "./usePersistentDemoState";
import { RestoredBanner } from "./RestoredBanner";
import {
  type Priority,
  type Status,
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
  slaDeadline,
  summarizeTickets,
} from "./ticketing.logic";

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const STATUS_COLORS: Record<Status, string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_progress: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  resolved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const esc = (value: string | number | undefined) => {
    const s = String(value ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = rows.map((row) => row.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TicketingDemo() {
  const [tickets, setTickets, resetTicketsPersisted, { restoredAt }] = usePersistentDemoState<Ticket[]>(
    "ticketing",
    1,
    () => getSeedTickets(),
  );
  const [counter, setCounter, resetCounterPersisted] = usePersistentDemoState<number>(
    "ticketing-counter",
    1,
    INITIAL_COUNTER,
  );
  const [now, setNow] = useState(Date.now());
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all");

  // Form state
  const [title, setTitle] = useState("");
  const [requester, setRequester] = useState("");
  const [assignee, setAssignee] = useState("L1 Support");
  const [priority, setPriority] = useState<Priority>("medium");

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const visible = useMemo(
    () => filterTickets(tickets, filterStatus, filterPriority),
    [tickets, filterStatus, filterPriority],
  );

  const stats = useMemo(() => summarizeTickets(tickets, now), [tickets, now]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const result = createTicket(tickets, counter, {
      title,
      requester,
      assignee,
      priority,
    });
    if (!result.created) return;
    setTickets(result.tickets);
    setCounter(result.counter);
    setTitle("");
    setRequester("");
    setPriority("medium");
    trackFirstInteraction("ticketing");
    trackDemoEvent("ticketing", "ticket_created");
  };

  const handleAdvance = (id: string) => {
    setTickets((prev) => advanceTicket(prev, id));
  };

  const handleExport = () => {
    const rows = buildTicketCsvRows(visible, now);
    downloadCsv(`tickets-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    trackFirstInteraction("ticketing");
    trackDemoEvent("ticketing", "export_clicked");
  };

  const handleReset = () => {
    // resetTicketsPersisted/resetCounterPersisted clear persisted storage AND restore the seed
    // values via the hook's internal skipNextPersist flag, so we don't call
    // setTickets/setCounter here (which would re-persist the seed).
    resetTicketsPersisted();
    resetCounterPersisted();
    setFilterStatus("all");
    setFilterPriority("all");
    trackDemoEvent("ticketing", "reset_clicked");
  };

  return (
    <div className="space-y-6">
      <RestoredBanner restoredAt={restoredAt} onStartFresh={handleReset} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3" role="status" aria-label="Ticketing summary">
        <div className="rounded-lg border border-border/40 bg-background/60 p-3">
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Open</div>
          <div className="text-2xl font-bold text-foreground">{stats.open}</div>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/60 p-3">
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Overdue</div>
          <div className="text-2xl font-bold text-red-400">{stats.overdue}</div>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/60 p-3">
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Resolved</div>
          <div className="text-2xl font-bold text-emerald-400">{stats.resolved}</div>
        </div>
      </div>

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-3"
        aria-label="Create new ticket"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ticket-title" className="text-xs">Title</Label>
            <Input
              id="ticket-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VPN failing for remote agents"
              required
            />
          </div>
          <div>
            <Label htmlFor="ticket-requester" className="text-xs">Requester</Label>
            <Input
              id="ticket-requester"
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
              placeholder="Lara Velasco"
              required
            />
          </div>
          <div>
            <Label htmlFor="ticket-assignee" className="text-xs">Assignee</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="ticket-assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="L1 Support">L1 Support</SelectItem>
                <SelectItem value="L2 Support">L2 Support</SelectItem>
                <SelectItem value="Field Tech">Field Tech</SelectItem>
                <SelectItem value="Network Team">Network Team</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ticket-priority" className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger id="ticket-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low — 24h SLA</SelectItem>
                <SelectItem value="medium">Medium — 8h SLA</SelectItem>
                <SelectItem value="high">High — 4h SLA</SelectItem>
                <SelectItem value="critical">Critical — 1h SLA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Create ticket
          </Button>
        </div>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px]">
          <Label className="text-xs" htmlFor="filter-status">Filter status</Label>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as Status | "all")}>
            <SelectTrigger id="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs" htmlFor="filter-priority">Filter priority</Label>
          <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as Priority | "all")}>
            <SelectTrigger id="filter-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" aria-hidden="true" /> Export CSV
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" aria-hidden="true" /> Reset demo
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-x-auto rounded-lg border border-border/40">
        <table className="w-full text-sm" aria-label="Ticket list">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="text-left px-3 py-2">ID</th>
              <th scope="col" className="text-left px-3 py-2">Ticket</th>
              <th scope="col" className="text-left px-3 py-2">Priority</th>
              <th scope="col" className="text-left px-3 py-2">Status</th>
              <th scope="col" className="text-left px-3 py-2">SLA</th>
              <th scope="col" className="text-right px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No tickets match the current filter.
                </td>
              </tr>
            )}
            {visible.map((t) => {
              const sla = slaDeadline(t);
              const remaining = sla - now;
              const slaState = classifySla(t, now);
              const overdue = slaState === "overdue";
              const slaLabel =
                slaState === "closed" ? "Closed" : formatRemaining(remaining);
              return (
                <tr key={t.id} className="border-t border-border/30">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{t.id}</td>
                  <td className="px-3 py-2">
                    <div className="text-foreground">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.requester} → {t.assignee}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={PRIORITY_COLORS[t.priority]}>
                      {t.priority}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={STATUS_COLORS[t.status]}>
                      {t.status === "in_progress" ? "in progress" : t.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-mono ${
                        overdue ? "text-red-400" : t.status === "resolved" ? "text-muted-foreground" : "text-foreground"
                      }`}
                      aria-label={`SLA ${slaLabel}`}
                    >
                      {overdue ? (
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                      ) : t.status === "resolved" ? (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Clock className="h-3 w-3" aria-hidden="true" />
                      )}
                      {slaLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.status !== "resolved" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAdvance(t.id)}
                        aria-label={`Advance ticket ${t.id}`}
                      >
                        {t.status === "open" ? "Start" : "Resolve"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Re-export so existing imports (if any) keep working.
export { SLA_MINUTES };
