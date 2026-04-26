import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, RotateCcw, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trackDemoEvent, trackFirstInteraction } from "@/lib/demoTelemetry";
import { usePersistentDemoState } from "./usePersistentDemoState";
import { RestoredBanner } from "./RestoredBanner";
import {
  type DayRow,
  DEFAULT_RANGE_DAYS,
  aggregateByAgeing,
  aggregateByCategory,
  buildBiCsvRows,
  computeKpis,
  seedData,
  selectPreviousRange,
  selectRange,
  serializeCsv,
} from "./bi.logic";

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

const PESO_COMPACT = (n: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const PESO = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = serializeCsv(rows);
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

export default function BiDashboardDemo() {
  const [rangeDays, setRangeDaysState, resetRangeDays, { restoredAt }] = usePersistentDemoState<number>(
    "bi-range-days",
    1,
    DEFAULT_RANGE_DAYS,
  );
  const [data] = useState<DayRow[]>(() => seedData());

  // Wraps the underlying setter so every range change (whether from the
  // select control or the reset button) emits a single telemetry event.
  // Keeping this colocated avoids accidentally firing on the initial
  // render — only true user-driven changes go through this function.
  const setRangeDays = (next: number) => {
    setRangeDaysState(next);
    trackFirstInteraction("bi");
    trackDemoEvent("bi", "range_changed");
  };

  const filtered = useMemo(() => selectRange(data, rangeDays), [data, rangeDays]);
  const previous = useMemo(
    () => selectPreviousRange(data, rangeDays),
    [data, rangeDays],
  );

  const kpis = useMemo(() => computeKpis(filtered, previous), [filtered, previous]);

  const trend = useMemo(() => {
    return filtered.map((r) => ({
      date: r.date.slice(5),
      cost: r.costPhp,
      tickets: r.tickets,
    }));
  }, [filtered]);

  const categories = useMemo(() => aggregateByCategory(filtered), [filtered]);
  const ageing = useMemo(() => aggregateByAgeing(filtered), [filtered]);

  const handleExport = () => {
    const rows = buildBiCsvRows(filtered);
    downloadCsv(
      `bi-dashboard-${rangeDays}d-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
    );
    trackFirstInteraction("bi");
    trackDemoEvent("bi", "export_clicked");
  };

  const handleReset = () => {
    // resetRangeDays() removes the persisted key AND restores the default.
    // We then emit a range-change event so the existing telemetry contract
    // (every range adjustment is tracked) is preserved on reset too.
    resetRangeDays();
    trackFirstInteraction("bi");
    trackDemoEvent("bi", "range_changed");
  };

  return (
    <div className="space-y-6">
      <RestoredBanner restoredAt={restoredAt} onStartFresh={handleReset} />

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <Label htmlFor="bi-range" className="text-xs">Date range</Label>
          <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(parseInt(v, 10))}>
            <SelectTrigger id="bi-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" role="status" aria-label="Operations KPIs">
        <Kpi
          label="Tickets"
          value={kpis.totalTickets.toLocaleString()}
          delta={kpis.ticketDelta}
          deltaInverted
        />
        <Kpi label="Resolved" value={kpis.totalResolved.toLocaleString()} />
        <Kpi
          label="SLA Met"
          value={`${kpis.slaPct}%`}
          delta={kpis.slaDelta}
          deltaSuffix=" pts"
        />
        <Kpi
          label="Ops Cost"
          value={PESO_COMPACT(kpis.totalCost)}
          delta={kpis.costDelta}
          deltaInverted
        />
      </div>

      {/* Cost trend area */}
      <div className="rounded-lg border border-border/40 bg-background/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Operations cost trend</h4>
          <span className="text-xs text-muted-foreground font-mono">
            Daily • {rangeDays}d
          </span>
        </div>
        <div className="h-56" role="img" aria-label="Operations cost trend chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} />
              <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => PESO_COMPACT(v)} tickLine={false} width={60} />
              <Tooltip
                contentStyle={{ background: "#0a0a0a", border: "1px solid #ffffff20", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [PESO(v), "Cost"]}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#costGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two-column charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/40 bg-background/40 p-4">
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-foreground">Tickets by category</h4>
            <p className="text-xs text-muted-foreground">Top issue drivers in selected range</p>
          </div>
          <div className="h-56" role="img" aria-label="Tickets by category chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} />
                <YAxis
                  dataKey="category"
                  type="category"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  width={120}
                />
                <Tooltip
                  contentStyle={{ background: "#0a0a0a", border: "1px solid #ffffff20", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {categories.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border/40 bg-background/40 p-4">
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-foreground">Ticket ageing</h4>
            <p className="text-xs text-muted-foreground">Distribution by age bucket</p>
          </div>
          <div className="h-56" role="img" aria-label="Ticket ageing chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ageing}
                  dataKey="count"
                  nameKey="bucket"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {ageing.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#0a0a0a", border: "1px solid #ffffff20", borderRadius: 8, fontSize: 12 }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  deltaInverted?: boolean;
}

function Kpi({ label, value, delta, deltaSuffix = "%", deltaInverted = false }: KpiProps) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const positive = hasDelta && delta! >= 0;
  // For inverted KPIs (cost, ticket volume) increases are "bad"
  const goodDirection = deltaInverted ? !positive : positive;
  const Icon = positive ? TrendingUp : TrendingDown;
  const tone = !hasDelta
    ? "text-muted-foreground"
    : goodDirection
    ? "text-emerald-400"
    : "text-red-400";
  return (
    <div className="rounded-lg border border-border/40 bg-background/60 p-3">
      <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {hasDelta && (
          <div className={`inline-flex items-center gap-0.5 text-xs font-medium ${tone}`}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {Math.abs(delta!).toFixed(deltaSuffix === "%" ? 1 : 0)}
            {deltaSuffix}
          </div>
        )}
      </div>
    </div>
  );
}
