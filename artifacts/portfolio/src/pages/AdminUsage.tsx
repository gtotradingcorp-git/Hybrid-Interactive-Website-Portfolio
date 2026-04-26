import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UsageData {
  windowDays: number;
  totals: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  daily: { day: string; requests: number; tokens: number }[];
  byTopic: { topic: string; requests: number; tokens: number }[];
  // Per-topic counts for the immediately preceding window of the same length,
  // used to render the +/- delta vs the previous period. May be missing on
  // older API servers, so the UI must treat it as optional.
  previousByTopic?: { topic: string; requests: number; tokens: number }[];
}

interface RecentDigest {
  id: number;
  sentAt: string;
  periodStart: string;
  periodEnd: string;
  requests: number;
  totalTokens: number;
  estimatedCostUsd: number;
  status: string;
  errorMessage: string | null;
}

interface RecentDigestsData {
  items: RecentDigest[];
}

interface RecentCostAlert {
  id: number;
  sentAt: string;
  day: string;
  requests: number;
  totalTokens: number;
  estimatedCostUsd: number;
  thresholdUsd: number;
  status: string;
  errorMessage: string | null;
}

interface RecentCostAlertsData {
  items: RecentCostAlert[];
}

interface CostAlertConfig {
  thresholdUsd: number | null;
}

interface RecentQuestion {
  id: number;
  createdAt: string;
  topic: string;
  question: string;
}

interface RecentQuestionsData {
  items: RecentQuestion[];
  topics: string[];
}

interface MatchLog {
  id: number;
  createdAt: string;
  roleTitle: string;
  recruiterCompany: string;
  recruiterEmailDomain: string;
  fitScore: number;
  shareCount: number;
  jdLength: number;
  estimatedCostUsd: number;
}

interface MatchLogsData {
  items: MatchLog[];
}

interface ChatActionRow {
  id: number;
  createdAt: string;
  action: string;
  status: string;
  senderEmail: string;
  senderName: string;
  senderCompany: string;
  recipients: string;
  summary: string;
  errorMessage: string;
}

interface ChatActionsData {
  items: ChatActionRow[];
}

interface HotLeadRow {
  id: number;
  createdAt: string;
  senderEmail: string;
  senderCompany: string;
  role: string;
  note: string;
  notified: boolean;
  notifyError: string;
}

interface HotLeadsData {
  items: HotLeadRow[];
}

interface DemoEventsData {
  windowDays: number;
  byDemo: {
    demo: string;
    total: number;
    events: Record<string, number>;
  }[];
  dailyByDemo?: Record<string, { day: string; count: number }[]>;
}

const DEMO_LABELS: Record<string, string> = {
  ticketing: "Mini Ticketing System",
  erp: "Mini ERP — Inventory & Invoicing",
  bi: "Live BI Dashboard",
};

function fmtEventName(e: string): string {
  return e.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TOKEN_KEY = "admin_usage_token";

function fmtTopic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtAgo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function AdminUsage() {
  const [token, setToken] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      setTokenInput(saved);
    }
  }, []);

  const apiBase = useMemo(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return `${base}/../api`;
  }, []);
  const apiUrl = useMemo(
    () => `${apiBase}/admin/usage?windowDays=${windowDays}`,
    [apiBase, windowDays],
  );
  const recentUrl = useMemo(() => `${apiBase}/admin/recent-questions?limit=25`, [apiBase]);
  const digestsUrl = useMemo(() => `${apiBase}/admin/weekly-digest/recent?limit=10`, [apiBase]);
  const costAlertsUrl = useMemo(() => `${apiBase}/admin/cost-alerts/recent?limit=10`, [apiBase]);

  const [cacheStats, setCacheStats] = useState<{
    size: number;
    hits: number;
    misses: number;
    hitRatio: number;
  } | null>(null);
  const [cacheStatsError, setCacheStatsError] = useState<string | null>(null);
  const [cacheStatsUpdatedAt, setCacheStatsUpdatedAt] = useState<number | null>(null);
  const [cacheStatsAgeSec, setCacheStatsAgeSec] = useState<number>(0);
  const [schedule, setSchedule] = useState<{
    nextRunAt: string;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    updatedAt: string;
  } | null>(null);
  const [scheduleLoaded, setScheduleLoaded] = useState<boolean>(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentQuestionsData | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [relabelingId, setRelabelingId] = useState<number | null>(null);
  const [digests, setDigests] = useState<RecentDigestsData | null>(null);
  const [digestsError, setDigestsError] = useState<string | null>(null);
  const [costAlerts, setCostAlerts] = useState<RecentCostAlertsData | null>(null);
  const [costAlertsError, setCostAlertsError] = useState<string | null>(null);
  const [costConfig, setCostConfig] = useState<CostAlertConfig | null>(null);
  const [costConfigError, setCostConfigError] = useState<string | null>(null);
  const [costConfigSavedAt, setCostConfigSavedAt] = useState<number | null>(null);
  const [costThresholdInput, setCostThresholdInput] = useState<string>("");
  const [costConfigSaving, setCostConfigSaving] = useState<boolean>(false);
  const [matchLogs, setMatchLogs] = useState<MatchLogsData | null>(null);
  const [matchLogsError, setMatchLogsError] = useState<string | null>(null);
  const [chatActions, setChatActions] = useState<ChatActionsData | null>(null);
  const [chatActionsError, setChatActionsError] = useState<string | null>(null);
  const [hotLeads, setHotLeads] = useState<HotLeadsData | null>(null);
  const [hotLeadsError, setHotLeadsError] = useState<string | null>(null);
  const [demoEvents, setDemoEvents] = useState<DemoEventsData | null>(null);
  const [demoEventsError, setDemoEventsError] = useState<string | null>(null);

  const cacheStatsUrl = useMemo(() => `${apiBase}/admin/cache-stats`, [apiBase]);
  const costConfigUrl = useMemo(() => `${apiBase}/admin/cost-alert/config`, [apiBase]);
  const scheduleUrl = useMemo(() => `${apiBase}/admin/weekly-digest/schedule`, [apiBase]);
  const matchLogsUrl = useMemo(() => `${apiBase}/admin/match-logs?limit=25`, [apiBase]);
  const chatActionsUrl = useMemo(() => `${apiBase}/admin/chat-actions?limit=25`, [apiBase]);
  const hotLeadsUrl = useMemo(() => `${apiBase}/admin/hot-leads?limit=25`, [apiBase]);
  const demoEventsUrl = useMemo(
    () => `${apiBase}/admin/demo-events?windowDays=${windowDays}`,
    [apiBase, windowDays],
  );

  const loadSchedule = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(scheduleUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as {
        schedule: {
          nextRunAt: string;
          lastRunAt: string | null;
          lastStatus: string | null;
          lastError: string | null;
          updatedAt: string;
        } | null;
      };
      setSchedule(d.schedule);
      setScheduleError(null);
    } catch (err) {
      setScheduleError((err as Error).message);
    } finally {
      setScheduleLoaded(true);
    }
  }, [scheduleUrl, token]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const loadCacheStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(cacheStatsUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as {
        size: number;
        hits: number;
        misses: number;
        hitRatio: number;
      };
      setCacheStats(d);
      setCacheStatsError(null);
      setCacheStatsUpdatedAt(Date.now());
      setCacheStatsAgeSec(0);
    } catch (err) {
      setCacheStatsError((err as Error).message);
    }
  }, [cacheStatsUrl, token]);

  useEffect(() => {
    void loadCacheStats();
  }, [loadCacheStats]);

  useEffect(() => {
    if (!token) return;
    const intervalId = window.setInterval(() => {
      void loadCacheStats();
    }, 30_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, loadCacheStats]);

  useEffect(() => {
    if (!token || !cacheStatsUpdatedAt) return;
    const tickId = window.setInterval(() => {
      setCacheStatsAgeSec(Math.floor((Date.now() - cacheStatsUpdatedAt) / 1000));
    }, 1_000);
    return () => {
      window.clearInterval(tickId);
    };
  }, [token, cacheStatsUpdatedAt]);

  const loadCostConfig = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(costConfigUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as CostAlertConfig;
      setCostConfig(d);
      setCostThresholdInput(d.thresholdUsd != null ? String(d.thresholdUsd) : "");
      setCostConfigError(null);
    } catch (err) {
      setCostConfigError((err as Error).message);
    }
  }, [costConfigUrl, token]);

  useEffect(() => {
    void loadCostConfig();
  }, [loadCostConfig]);

  const saveCostConfig = useCallback(
    async (rawValue: string) => {
      if (!token) return;
      const trimmed = rawValue.trim();
      let thresholdUsd: number | null;
      if (trimmed === "") {
        thresholdUsd = null;
      } else {
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n <= 0) {
          setCostConfigError(
            "Enter a positive USD number (e.g. 5.00) or leave blank to disable.",
          );
          return;
        }
        thresholdUsd = n;
      }
      setCostConfigSaving(true);
      try {
        const res = await fetch(costConfigUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ thresholdUsd }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        const d = (await res.json()) as CostAlertConfig;
        setCostConfig(d);
        setCostThresholdInput(d.thresholdUsd != null ? String(d.thresholdUsd) : "");
        setCostConfigError(null);
        setCostConfigSavedAt(Date.now());
      } catch (err) {
        setCostConfigError((err as Error).message);
      } finally {
        setCostConfigSaving(false);
      }
    },
    [costConfigUrl, token],
  );

  const loadCostAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(costAlertsUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as RecentCostAlertsData;
      setCostAlerts(d);
      setCostAlertsError(null);
    } catch (err) {
      setCostAlertsError((err as Error).message);
    }
  }, [costAlertsUrl, token]);

  useEffect(() => {
    void loadCostAlerts();
  }, [loadCostAlerts]);

  const loadDigests = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(digestsUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as RecentDigestsData;
      setDigests(d);
      setDigestsError(null);
    } catch (err) {
      setDigestsError((err as Error).message);
    }
  }, [digestsUrl, token]);

  useEffect(() => {
    void loadDigests();
  }, [loadDigests]);

  const loadMatchLogs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(matchLogsUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as MatchLogsData;
      setMatchLogs(d);
      setMatchLogsError(null);
    } catch (err) {
      setMatchLogsError((err as Error).message);
    }
  }, [matchLogsUrl, token]);

  useEffect(() => {
    void loadMatchLogs();
  }, [loadMatchLogs]);

  const loadChatActions = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(chatActionsUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as ChatActionsData;
      setChatActions(d);
      setChatActionsError(null);
    } catch (err) {
      setChatActionsError((err as Error).message);
    }
  }, [chatActionsUrl, token]);

  useEffect(() => {
    void loadChatActions();
  }, [loadChatActions]);

  const loadHotLeads = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(hotLeadsUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as HotLeadsData;
      setHotLeads(d);
      setHotLeadsError(null);
    } catch (err) {
      setHotLeadsError((err as Error).message);
    }
  }, [hotLeadsUrl, token]);

  useEffect(() => {
    void loadHotLeads();
  }, [loadHotLeads]);

  const loadDemoEvents = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(demoEventsUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as DemoEventsData;
      setDemoEvents(d);
      setDemoEventsError(null);
    } catch (err) {
      setDemoEventsError((err as Error).message);
    }
  }, [demoEventsUrl, token]);

  useEffect(() => {
    void loadDemoEvents();
  }, [loadDemoEvents]);

  const loadRecent = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(recentUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const d = (await res.json()) as RecentQuestionsData;
      setRecent(d);
      setRecentError(null);
    } catch (err) {
      setRecentError((err as Error).message);
    }
  }, [recentUrl, token]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const relabel = useCallback(
    async (id: number, topic: string) => {
      if (!token) return;
      setRelabelingId(id);
      try {
        const res = await fetch(`${apiBase}/admin/chat-logs/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ topic }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        setRecent((prev) =>
          prev
            ? { ...prev, items: prev.items.map((it) => (it.id === id ? { ...it, topic } : it)) }
            : prev,
        );
      } catch (err) {
        setRecentError((err as Error).message);
      } finally {
        setRelabelingId(null);
      }
    },
    [apiBase, token],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return res.json() as Promise<UsageData>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        if (/unauthorized|401/i.test(err.message)) {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, apiUrl]);

  const submitToken = (e: React.FormEvent) => {
    e.preventDefault();
    const t = tokenInput.trim();
    if (!t) return;
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  };

  const signOut = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setTokenInput("");
    setData(null);
    setCacheStats(null);
    setCacheStatsUpdatedAt(null);
    setCacheStatsAgeSec(0);
  };

  const peakDay = useMemo(() => {
    if (!data || data.daily.length === 0) return null;
    return data.daily.reduce((a, b) => (b.requests > a.requests ? b : a));
  }, [data]);

  if (!token) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Admin sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitToken} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">Admin token</Label>
                <Input
                  id="token"
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Enter admin token"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chat Usage</h1>
          <p className="text-sm text-muted-foreground">
            Last {data?.windowDays ?? windowDays} days. No visitor PII is stored.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="window-select" className="text-sm text-muted-foreground">
            Window
          </Label>
          <Select
            value={String(windowDays)}
            onValueChange={(v) => setWindowDays(Number(v))}
          >
            <SelectTrigger id="window-select" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && !loading && <p className="text-destructive">{error}</p>}

      {data && !loading && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Requests" value={fmtNum(data.totals.requests)} />
            <StatCard label="Total tokens" value={fmtNum(data.totals.totalTokens)} />
            <StatCard
              label="Est. cost (USD)"
              value={`$${data.totals.estimatedCostUsd.toFixed(2)}`}
            />
            <StatCard
              label="Peak day"
              value={
                peakDay
                  ? `${peakDay.day} (${fmtNum(peakDay.requests)})`
                  : "—"
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Weekly digest schedule</CardTitle>
            </CardHeader>
            <CardContent>
              {scheduleError && (
                <p className="text-sm text-destructive">{scheduleError}</p>
              )}
              {!scheduleLoaded && !scheduleError && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {scheduleLoaded && !scheduleError && !schedule && (
                <p className="text-sm text-muted-foreground">
                  The digest scheduler hasn't run yet. It bootstraps on the next
                  server tick.
                </p>
              )}
              {schedule && (
                <ScheduleSummary schedule={schedule} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>Topic-label cache</span>
                {cacheStatsUpdatedAt && (
                  <span
                    className="text-xs font-normal text-muted-foreground"
                    aria-live="polite"
                    title={new Date(cacheStatsUpdatedAt).toLocaleString()}
                  >
                    updated {fmtAgo(cacheStatsAgeSec)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cacheStatsError && (
                <p className="text-sm text-destructive">{cacheStatsError}</p>
              )}
              {!cacheStats && !cacheStatsError && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {cacheStats && (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <StatCard
                    label="Hit ratio"
                    value={`${(cacheStats.hitRatio * 100).toFixed(1)}%`}
                  />
                  <StatCard label="Hits" value={fmtNum(cacheStats.hits)} />
                  <StatCard label="Misses" value={fmtNum(cacheStats.misses)} />
                  <StatCard label="Cached entries" value={fmtNum(cacheStats.size)} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily activity</CardTitle>
            </CardHeader>
            <CardContent>
              {data.daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No chat activity yet in the last {data.windowDays} days.
                </p>
              ) : (
                <DailyChart daily={data.daily} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Questions by topic</CardTitle>
            </CardHeader>
            <CardContent>
              {data.byTopic.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <TopicBreakdown
                  rows={data.byTopic}
                  previousRows={data.previousByTopic ?? []}
                  windowDays={data.windowDays}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily cost alert threshold</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Email alerts fire once per UTC day when estimated chat cost
                crosses this amount. Leave blank to disable. Changes take
                effect on the next cost-alert check.
              </p>
              {costConfigError && (
                <p className="mb-3 text-sm text-destructive">{costConfigError}</p>
              )}
              {!costConfig && !costConfigError ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveCostConfig(costThresholdInput);
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="cost-threshold">Threshold (USD)</Label>
                    <Input
                      id="cost-threshold"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="Disabled"
                      className="w-40"
                      value={costThresholdInput}
                      onChange={(e) => setCostThresholdInput(e.target.value)}
                      disabled={costConfigSaving}
                    />
                  </div>
                  <Button type="submit" disabled={costConfigSaving}>
                    {costConfigSaving ? "Saving…" : "Save"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Currently:{" "}
                    {costConfig?.thresholdUsd != null
                      ? `$${costConfig.thresholdUsd.toFixed(2)} per day`
                      : "disabled"}
                    {costConfigSavedAt &&
                      Date.now() - costConfigSavedAt < 5000 && (
                        <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                          Saved.
                        </span>
                      )}
                  </p>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent cost alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                The last 10 daily cost alert send attempts. Failed sends are
                highlighted with their error so you can spot delivery issues
                without checking server logs.
              </p>
              {costAlertsError && (
                <p className="mb-3 text-sm text-destructive">{costAlertsError}</p>
              )}
              {!costAlerts ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : costAlerts.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No cost alerts recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Day</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="text-right w-24">Requests</TableHead>
                      <TableHead className="text-right w-28">Est. cost</TableHead>
                      <TableHead className="text-right w-28">Threshold</TableHead>
                      <TableHead className="w-40">Sent at</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costAlerts.items.map((row) => {
                      const failed = row.status === "failed";
                      const sent = row.status === "sent";
                      return (
                        <TableRow
                          key={row.id}
                          className={failed ? "bg-destructive/10" : undefined}
                        >
                          <TableCell className="font-mono text-xs">
                            {row.day}
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                failed
                                  ? "inline-flex rounded px-2 py-0.5 text-xs font-semibold uppercase bg-destructive text-destructive-foreground"
                                  : sent
                                    ? "inline-flex rounded px-2 py-0.5 text-xs font-semibold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                    : "inline-flex rounded px-2 py-0.5 text-xs font-semibold uppercase bg-muted text-muted-foreground"
                              }
                            >
                              {row.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmtNum(row.requests)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            ${row.estimatedCostUsd.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            ${row.thresholdUsd.toFixed(2)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {new Date(row.sentAt).toLocaleString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="max-w-md whitespace-normal text-xs text-destructive">
                            {row.errorMessage ?? ""}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent weekly digests</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                The last 10 weekly digest send attempts. Failed sends are
                highlighted so you can spot AgentMail outages without checking
                server logs.
              </p>
              {digestsError && (
                <p className="mb-3 text-sm text-destructive">{digestsError}</p>
              )}
              {!digests ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : digests.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No digest sends recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Sent at</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-44">Period</TableHead>
                      <TableHead className="text-right w-24">Requests</TableHead>
                      <TableHead className="text-right w-24">Cost</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {digests.items.map((row) => {
                      const failed = row.status === "failed";
                      return (
                        <TableRow
                          key={row.id}
                          className={failed ? "bg-destructive/10" : undefined}
                        >
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {new Date(row.sentAt).toLocaleString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                failed
                                  ? "inline-flex rounded px-2 py-0.5 text-xs font-semibold uppercase bg-destructive text-destructive-foreground"
                                  : "inline-flex rounded px-2 py-0.5 text-xs font-semibold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              }
                            >
                              {row.status}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {row.periodStart.slice(0, 10)} – {row.periodEnd.slice(0, 10)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmtNum(row.requests)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            ${row.estimatedCostUsd.toFixed(2)}
                          </TableCell>
                          <TableCell className="max-w-md whitespace-normal text-xs text-destructive">
                            {row.errorMessage ?? ""}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>JD match log</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                The 25 most recent Recruiter Mode JD matches. The full JD text is never stored —
                only the parsed role, fit score, and a hash for dedup. Click a row to open the
                live brief.
              </p>
              {matchLogsError && (
                <p className="mb-3 text-sm text-destructive">{matchLogsError}</p>
              )}
              {!matchLogs ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : matchLogs.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No JD matches recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">When</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-40">Company</TableHead>
                      <TableHead className="w-32">Recruiter domain</TableHead>
                      <TableHead className="text-right w-20">Score</TableHead>
                      <TableHead className="text-right w-20">Shares</TableHead>
                      <TableHead className="text-right w-24">JD chars</TableHead>
                      <TableHead className="text-right w-24">Est. cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matchLogs.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-sm">
                          <a
                            href={`/match/${row.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground hover:text-accent underline-offset-4 hover:underline"
                          >
                            {row.roleTitle}
                          </a>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.recruiterCompany || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.recruiterEmailDomain || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              row.fitScore >= 70
                                ? "inline-flex rounded px-2 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : row.fitScore >= 50
                                  ? "inline-flex rounded px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                  : "inline-flex rounded px-2 py-0.5 text-xs font-semibold bg-red-500/15 text-red-700 dark:text-red-400"
                            }
                          >
                            {row.fitScore}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {fmtNum(row.shareCount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {fmtNum(row.jdLength)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          ${row.estimatedCostUsd.toFixed(4)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chat actions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                The 25 most recent actions the AI assistant proposed and the visitor confirmed —
                meeting bookings, brief sends, hot-lead alerts, and panel shares. John is CC'd
                on every email so the inbox is the source of truth; this is the audit trail.
              </p>
              {chatActionsError && (
                <p className="mb-3 text-sm text-destructive">{chatActionsError}</p>
              )}
              {!chatActions ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : chatActions.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No chat actions yet. They appear here once a visitor confirms an action card.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">When</TableHead>
                      <TableHead className="w-32">Action</TableHead>
                      <TableHead className="w-20">Status</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chatActions.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.action}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span
                            className={
                              row.status === "sent"
                                ? "inline-flex rounded px-2 py-0.5 font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : row.status === "failed"
                                  ? "inline-flex rounded px-2 py-0.5 font-semibold bg-red-500/15 text-red-700 dark:text-red-400"
                                  : "inline-flex rounded px-2 py-0.5 font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            }
                          >
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="text-foreground">
                            {row.senderName || row.senderEmail || "—"}
                          </div>
                          {row.senderCompany && (
                            <div className="text-muted-foreground">{row.senderCompany}</div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground break-all">
                          {row.recipients || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.summary || "—"}
                          {row.errorMessage && (
                            <div className="mt-1 text-destructive">⚠ {row.errorMessage}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hot leads</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Recruiters who explicitly asked the AI to put them through to John. The recruiter
                + role + company is captured here so John has a single list to triage.
              </p>
              {hotLeadsError && (
                <p className="mb-3 text-sm text-destructive">{hotLeadsError}</p>
              )}
              {!hotLeads ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : hotLeads.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hot leads yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">When</TableHead>
                      <TableHead>Recruiter</TableHead>
                      <TableHead className="w-40">Company</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-24">Notified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hotLeads.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-foreground break-all">
                          {row.senderEmail}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.senderCompany || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="text-foreground">{row.role || "—"}</div>
                          {row.note && (
                            <div className="text-muted-foreground italic mt-0.5">{row.note}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.notified ? (
                            <span className="inline-flex rounded px-2 py-0.5 font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                              yes
                            </span>
                          ) : (
                            <span className="inline-flex rounded px-2 py-0.5 font-semibold bg-red-500/15 text-red-700 dark:text-red-400">
                              no
                            </span>
                          )}
                          {row.notifyError && (
                            <div className="mt-1 text-destructive text-[10px]">{row.notifyError}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live demos engagement</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Counts of visitor interactions with the three Live Capability
                Demos in the last {demoEvents?.windowDays ?? windowDays} days.
                No visitor identity is stored — only which demo emitted which
                event.
              </p>
              {demoEventsError && (
                <p className="mb-3 text-sm text-destructive">{demoEventsError}</p>
              )}
              {!demoEvents && !demoEventsError ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !demoEvents || demoEvents.byDemo.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No demo activity recorded yet in this window.
                </p>
              ) : (
                <DemoEventsBreakdown rows={demoEvents.byDemo} dailyByDemo={demoEvents.dailyByDemo} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent questions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                The 25 most recent visitor questions and the topic the AI assigned. Use the
                dropdown to relabel any that look wrong. Only the question text is stored —
                no visitor identity.
              </p>
              {recentError && (
                <p className="mb-3 text-sm text-destructive">{recentError}</p>
              )}
              {!recent ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : recent.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No chat questions logged yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">When</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead className="w-44">Topic</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="max-w-md whitespace-normal text-sm">
                          {row.question || (
                            <span className="text-muted-foreground italic">
                              (not recorded)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.topic}
                            disabled={relabelingId === row.id}
                            onValueChange={(val) => {
                              if (val !== row.topic) void relabel(row.id, val);
                            }}
                          >
                            <SelectTrigger className="h-8 w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {recent.topics.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {fmtTopic(t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function fmtLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.round((t - now) / 1000);
  const abs = Math.abs(diffSec);
  const future = diffSec >= 0;
  let value: number;
  let unit: string;
  if (abs < 60) {
    value = abs;
    unit = "second";
  } else if (abs < 3600) {
    value = Math.round(abs / 60);
    unit = "minute";
  } else if (abs < 86400) {
    value = Math.round(abs / 3600);
    unit = "hour";
  } else {
    value = Math.round(abs / 86400);
    unit = "day";
  }
  const plural = value === 1 ? "" : "s";
  return future ? `in ${value} ${unit}${plural}` : `${value} ${unit}${plural} ago`;
}

function statusBadgeClasses(status: string | null): string {
  switch (status) {
    case "sent":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "skipped":
      return "bg-muted text-muted-foreground";
    case "failed":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function ScheduleSummary({
  schedule,
}: {
  schedule: {
    nextRunAt: string;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    updatedAt: string;
  };
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Next scheduled send
        </p>
        <p className="mt-1 text-lg font-semibold">
          {fmtLocalDateTime(schedule.nextRunAt)}
        </p>
        <p className="text-xs text-muted-foreground">
          {fmtRelative(schedule.nextRunAt)}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Last run
        </p>
        {schedule.lastRunAt ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(
                schedule.lastStatus,
              )}`}
            >
              {schedule.lastStatus ?? "unknown"}
            </span>
            <span className="text-sm">
              {fmtLocalDateTime(schedule.lastRunAt)}
            </span>
            <span className="text-xs text-muted-foreground">
              ({fmtRelative(schedule.lastRunAt)})
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            No runs recorded yet.
          </p>
        )}
        {schedule.lastError && (
          <p className="mt-2 break-words rounded bg-destructive/10 p-2 text-xs text-destructive">
            {schedule.lastError}
          </p>
        )}
      </div>
    </div>
  );
}

function TopicBreakdown({
  rows,
  previousRows,
  windowDays,
}: {
  rows: { topic: string; requests: number; tokens: number }[];
  previousRows: { topic: string; requests: number; tokens: number }[];
  windowDays: number;
}) {
  const total = rows.reduce((sum, r) => sum + r.requests, 0);
  const previousTotal = previousRows.reduce((sum, r) => sum + r.requests, 0);
  // Index the prior-period counts by topic so we can compute a per-topic
  // share delta in O(1) per row.
  const previousByTopic = new Map<string, number>();
  for (const r of previousRows) previousByTopic.set(r.topic, r.requests);
  const hasPreviousData = previousTotal > 0;
  // Rows already arrive ordered by requests desc from the API.
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Deltas compare each topic's share of questions in the last {windowDays}{" "}
        days to the {windowDays} days before that.
        {!hasPreviousData && " No activity in the previous period yet."}
      </p>
      {rows.map((r) => {
        const pct = total > 0 ? (r.requests / total) * 100 : 0;
        const prevRequests = previousByTopic.get(r.topic) ?? 0;
        const prevPct =
          previousTotal > 0 ? (prevRequests / previousTotal) * 100 : 0;
        const isNew = hasPreviousData && prevRequests === 0;
        const deltaPct = pct - prevPct;
        return (
          <div key={r.topic} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 text-sm text-foreground">
              {fmtTopic(r.topic)}
            </span>
            <div className="flex-1">
              <div className="h-4 w-full rounded bg-muted">
                <div
                  className="h-4 rounded bg-accent"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-xs">
              {pct.toFixed(0)}%
            </span>
            <TopicDelta
              isNew={isNew}
              hasPreviousData={hasPreviousData}
              deltaPct={deltaPct}
            />
            <span className="w-12 shrink-0 text-right font-mono text-xs">
              {fmtNum(r.requests)}
            </span>
            <span className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground">
              {fmtNum(r.tokens)} tok
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TopicDelta({
  isNew,
  hasPreviousData,
  deltaPct,
}: {
  isNew: boolean;
  hasPreviousData: boolean;
  deltaPct: number;
}) {
  // No prior-period activity at all — there's nothing to compare against, so
  // we keep the column quiet rather than mislabeling everything as "new".
  if (!hasPreviousData) {
    return (
      <span
        className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground"
        title="No prior-period data to compare against"
      >
        —
      </span>
    );
  }
  if (isNew) {
    return (
      <span
        className="inline-flex w-16 shrink-0 items-center justify-end"
        title="Did not appear in the previous period"
      >
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
          new
        </span>
      </span>
    );
  }
  // Round to one decimal so tiny rounding noise (<0.05pp) shows as flat.
  const rounded = Math.round(deltaPct * 10) / 10;
  if (rounded === 0) {
    return (
      <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
        ±0.0pp
      </span>
    );
  }
  const positive = rounded > 0;
  const label = `${positive ? "+" : ""}${rounded.toFixed(1)}pp`;
  return (
    <span
      className={
        "w-16 shrink-0 text-right font-mono text-xs " +
        (positive
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-destructive")
      }
      title={`Share changed by ${label} vs the previous period`}
    >
      {label}
    </span>
  );
}

function DemoEventsBreakdown({
  rows,
  dailyByDemo,
}: {
  rows: { demo: string; total: number; events: Record<string, number> }[];
  dailyByDemo?: Record<string, { day: string; count: number }[]>;
}) {
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
        const eventEntries = Object.entries(row.events).sort(
          (a, b) => b[1] - a[1],
        );
        const dailyData = dailyByDemo?.[row.demo];
        return (
          <div
            key={row.demo}
            className="rounded-lg border border-border/40 bg-background/40 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {DEMO_LABELS[row.demo] ?? row.demo}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtNum(row.total)} interactions ({pct.toFixed(0)}% of total)
                </p>
              </div>
              <span className="rounded bg-accent/10 px-2 py-1 font-mono text-xs text-accent">
                {row.demo}
              </span>
            </div>
            {dailyData && dailyData.length > 0 && (
              <DemoMiniChart data={dailyData} />
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {eventEntries.map(([event, count]) => (
                <div
                  key={event}
                  className="flex items-center justify-between rounded border border-border/30 bg-background/60 px-3 py-2"
                >
                  <span className="text-xs text-muted-foreground">
                    {fmtEventName(event)}
                  </span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {fmtNum(count)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DemoMiniChart({
  data,
}: {
  data: { day: string; count: number }[];
}) {
  const formatted = useMemo(
    () =>
      data.map((d) => ({
        day: d.day.slice(5),
        count: d.count,
      })),
    [data],
  );

  const maxCount = useMemo(
    () => Math.max(...data.map((d) => d.count), 1),
    [data],
  );

  const tickInterval = useMemo(() => {
    const len = formatted.length;
    if (len <= 7) return 0;
    if (len <= 14) return 1;
    return Math.ceil(len / 10) - 1;
  }, [formatted.length]);

  return (
    <div className="mt-3 h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formatted}
          margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="hsl(var(--border))"
            strokeOpacity={0.4}
          />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            domain={[0, maxCount]}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
              color: "hsl(var(--popover-foreground))",
            }}
            labelFormatter={(label) => `Day: ${label}`}
            formatter={(value: number) => [value, "Interactions"]}
            cursor={{ fill: "hsl(var(--accent))", fillOpacity: 0.1 }}
          />
          <Bar
            dataKey="count"
            fill="hsl(var(--accent))"
            radius={[2, 2, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyChart({
  daily,
}: {
  daily: { day: string; requests: number; tokens: number }[];
}) {
  const max = Math.max(...daily.map((d) => d.requests), 1);
  return (
    <div className="space-y-2">
      {daily.map((d) => {
        const pct = (d.requests / max) * 100;
        return (
          <div key={d.day} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
              {d.day}
            </span>
            <div className="flex-1">
              <div className="h-4 w-full rounded bg-muted">
                <div
                  className="h-4 rounded bg-accent"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-xs">
              {fmtNum(d.requests)}
            </span>
            <span className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground">
              {fmtNum(d.tokens)} tok
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default AdminUsage;
