import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { getUsageSummary } from "../lib/usageSummary";
import { _topicCacheStats } from "../lib/topicClassifier";
import { sendWeeklyDigest } from "../lib/weeklyDigest";
import {
  ensureDigestScheduleTable,
  getDigestSchedule,
} from "../lib/digestScheduler";
import { getDigestConfig, updateDigestConfig, type DigestConfig } from "../lib/digestConfig";
import { checkAndSendCostAlert } from "../lib/costAlert";
import {
  getCostAlertConfig,
  updateCostAlertConfig,
  type CostAlertConfig,
} from "../lib/costAlertConfig";
import {
  db,
  chatLogsTable,
  weeklyDigestsTable,
  costAlertsTable,
  matchLogsTable,
  chatActionsTable,
  hotLeadsTable,
  demoEventsTable,
} from "@workspace/db";

const ALLOWED_TOPICS = new Set([
  "experience",
  "projects",
  "capabilities",
  "tech_stack",
  "contact",
  "leadership",
  "industries",
  "education",
  "other",
]);

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env["ADMIN_TOKEN"];
  if (!expected) {
    res.status(503).json({ error: "Admin dashboard is not configured." });
    return;
  }
  const header = req.headers["authorization"] ?? "";
  const token = header.toString().replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.get("/admin/usage", requireAdmin, async (req: Request, res: Response) => {
  try {
    // Allow callers to choose the lookback window (1..90 days). Default 30
    // preserves the previous behavior so existing dashboards keep working.
    const rawWindow = Number(req.query["windowDays"] ?? 30);
    const windowDays = Number.isFinite(rawWindow)
      ? Math.min(Math.max(Math.trunc(rawWindow), 1), 90)
      : 30;
    const summary = await getUsageSummary(windowDays);
    res.json({
      windowDays: summary.windowDays,
      totals: summary.totals,
      daily: summary.daily,
      byTopic: summary.byTopic,
      // Same shape as byTopic but for the immediately preceding window of
      // the same length. Lets the dashboard render a vs-previous-period
      // delta without a second round-trip.
      previousByTopic: summary.previousByTopic,
    });
  } catch (err) {
    console.error("Admin usage error:", err);
    res.status(500).json({ error: "Failed to load usage data." });
  }
});

router.get("/admin/cache-stats", requireAdmin, (_req: Request, res: Response) => {
  // Counts only — no question text or PII is exposed. Confirms the topic
  // classifier cache is actually saving classifier calls in production.
  const stats = _topicCacheStats();
  const total = stats.hits + stats.misses;
  const hitRatio = total > 0 ? stats.hits / total : 0;
  res.json({
    size: stats.size,
    hits: stats.hits,
    misses: stats.misses,
    hitRatio,
  });
});

router.post(
  "/admin/weekly-digest",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const force = req.query["force"] === "1" || req.body?.force === true;
      const result = await sendWeeklyDigest({ force });
      const status = result.status === "failed" ? 502 : 200;
      res.status(status).json(result);
    } catch (err) {
      console.error("Weekly digest trigger error:", err);
      res.status(500).json({ error: "Failed to trigger weekly digest." });
    }
  },
);

router.get(
  "/admin/weekly-digest/config",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const config = await getDigestConfig();
      res.json(config);
    } catch (err) {
      console.error("Read weekly digest config error:", err);
      res.status(500).json({ error: "Failed to load digest config." });
    }
  },
);

router.patch(
  "/admin/weekly-digest/config",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Partial<DigestConfig> = {};
      if (Object.prototype.hasOwnProperty.call(body, "recipients")) {
        const r = body["recipients"];
        if (!Array.isArray(r) || r.some((x) => typeof x !== "string")) {
          res.status(400).json({ error: "recipients must be an array of strings." });
          return;
        }
        const cleaned = (r as string[])
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (cleaned.length === 0) {
          res.status(400).json({ error: "recipients must include at least one address." });
          return;
        }
        if (cleaned.some((s) => !/.+@.+\..+/.test(s))) {
          res.status(400).json({ error: "recipients must be valid email addresses." });
          return;
        }
        patch.recipients = cleaned;
      }
      if (Object.prototype.hasOwnProperty.call(body, "sendDay")) {
        const v = body["sendDay"];
        if (v === null) {
          patch.sendDay = null;
        } else if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6) {
          patch.sendDay = v;
        } else {
          res.status(400).json({ error: "sendDay must be an integer 0..6 or null." });
          return;
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, "sendHour")) {
        const v = body["sendHour"];
        if (v === null) {
          patch.sendHour = null;
        } else if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23) {
          patch.sendHour = v;
        } else {
          res.status(400).json({ error: "sendHour must be an integer 0..23 or null." });
          return;
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, "paused")) {
        if (typeof body["paused"] !== "boolean") {
          res.status(400).json({ error: "paused must be a boolean." });
          return;
        }
        patch.paused = body["paused"] as boolean;
      }

      const updated = await updateDigestConfig(patch);
      res.json(updated);
    } catch (err) {
      console.error("Update weekly digest config error:", err);
      res.status(500).json({ error: "Failed to update digest config." });
    }
  },
);

router.get(
  "/admin/weekly-digest/schedule",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      // Self-heal in case the scheduler hasn't bootstrapped the table yet
      // (e.g., AGENTMAIL_API_KEY unset, so the scheduler never started).
      await ensureDigestScheduleTable();
      const schedule = await getDigestSchedule();
      if (!schedule) {
        res.json({ schedule: null });
        return;
      }
      res.json({
        schedule: {
          nextRunAt: schedule.nextRunAt.toISOString(),
          lastRunAt: schedule.lastRunAt
            ? schedule.lastRunAt.toISOString()
            : null,
          lastStatus: schedule.lastStatus,
          lastError: schedule.lastError,
          updatedAt: schedule.updatedAt.toISOString(),
        },
      });
    } catch (err) {
      console.error("Read weekly digest schedule error:", err);
      res.status(500).json({ error: "Failed to load digest schedule." });
    }
  },
);

router.get(
  "/admin/weekly-digest/recent",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const rawLimit = Number(req.query["limit"] ?? 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50)
        : 10;
      const rows = await db
        .select({
          id: weeklyDigestsTable.id,
          sentAt: weeklyDigestsTable.sentAt,
          periodStart: weeklyDigestsTable.periodStart,
          periodEnd: weeklyDigestsTable.periodEnd,
          requests: weeklyDigestsTable.requests,
          totalTokens: weeklyDigestsTable.totalTokens,
          estimatedCostUsd: weeklyDigestsTable.estimatedCostUsd,
          status: weeklyDigestsTable.status,
          errorMessage: weeklyDigestsTable.errorMessage,
        })
        .from(weeklyDigestsTable)
        .orderBy(desc(weeklyDigestsTable.sentAt))
        .limit(limit);
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          sentAt: r.sentAt instanceof Date ? r.sentAt.toISOString() : r.sentAt,
          periodStart:
            r.periodStart instanceof Date
              ? r.periodStart.toISOString()
              : r.periodStart,
          periodEnd:
            r.periodEnd instanceof Date
              ? r.periodEnd.toISOString()
              : r.periodEnd,
          requests: r.requests,
          totalTokens: r.totalTokens,
          estimatedCostUsd: r.estimatedCostUsd,
          status: r.status,
          errorMessage: r.errorMessage,
        })),
      });
    } catch (err) {
      console.error("Recent weekly digests error:", err);
      res.status(500).json({ error: "Failed to load recent digests." });
    }
  },
);

router.get(
  "/admin/cost-alerts/recent",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const rawLimit = Number(req.query["limit"] ?? 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50)
        : 10;
      const rows = await db
        .select({
          id: costAlertsTable.id,
          sentAt: costAlertsTable.sentAt,
          day: costAlertsTable.day,
          requests: costAlertsTable.requests,
          totalTokens: costAlertsTable.totalTokens,
          estimatedCostUsd: costAlertsTable.estimatedCostUsd,
          thresholdUsd: costAlertsTable.thresholdUsd,
          status: costAlertsTable.status,
          errorMessage: costAlertsTable.errorMessage,
        })
        .from(costAlertsTable)
        .orderBy(desc(costAlertsTable.sentAt))
        .limit(limit);
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          sentAt: r.sentAt instanceof Date ? r.sentAt.toISOString() : r.sentAt,
          day: r.day,
          requests: r.requests,
          totalTokens: r.totalTokens,
          estimatedCostUsd: r.estimatedCostUsd,
          thresholdUsd: r.thresholdUsd,
          status: r.status,
          errorMessage: r.errorMessage,
        })),
      });
    } catch (err) {
      console.error("Recent cost alerts error:", err);
      res.status(500).json({ error: "Failed to load recent cost alerts." });
    }
  },
);

router.get(
  "/admin/cost-alert/config",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const config = await getCostAlertConfig();
      res.json(config);
    } catch (err) {
      console.error("Read cost alert config error:", err);
      res.status(500).json({ error: "Failed to load cost alert config." });
    }
  },
);

router.patch(
  "/admin/cost-alert/config",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Partial<CostAlertConfig> = {};
      if (Object.prototype.hasOwnProperty.call(body, "thresholdUsd")) {
        const v = body["thresholdUsd"];
        if (v === null) {
          patch.thresholdUsd = null;
        } else if (
          typeof v === "number" &&
          Number.isFinite(v) &&
          v > 0
        ) {
          patch.thresholdUsd = v;
        } else {
          res.status(400).json({
            error:
              "thresholdUsd must be a positive number (USD) or null to disable.",
          });
          return;
        }
      } else {
        res.status(400).json({ error: "thresholdUsd is required." });
        return;
      }

      const updated = await updateCostAlertConfig(patch);
      res.json(updated);
    } catch (err) {
      console.error("Update cost alert config error:", err);
      res.status(500).json({ error: "Failed to update cost alert config." });
    }
  },
);

router.post(
  "/admin/cost-alert-check",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const force = req.query["force"] === "1" || req.body?.force === true;
      const result = await checkAndSendCostAlert({ force });
      const status = result.status === "failed" ? 502 : 200;
      res.status(status).json(result);
    } catch (err) {
      console.error("Cost alert trigger error:", err);
      res.status(500).json({ error: "Failed to run cost alert check." });
    }
  },
);

router.get(
  "/admin/recent-questions",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const rawLimit = Number(req.query["limit"] ?? 25);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 25;
      const rows = await db
        .select({
          id: chatLogsTable.id,
          createdAt: chatLogsTable.createdAt,
          topic: chatLogsTable.topic,
          question: chatLogsTable.question,
        })
        .from(chatLogsTable)
        .orderBy(desc(chatLogsTable.createdAt))
        .limit(limit);
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          topic: r.topic,
          question: r.question ?? "",
        })),
        topics: Array.from(ALLOWED_TOPICS),
      });
    } catch (err) {
      console.error("Recent questions error:", err);
      res.status(500).json({ error: "Failed to load recent questions." });
    }
  },
);

router.patch(
  "/admin/chat-logs/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params["id"]);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid id." });
        return;
      }
      const topic = String(req.body?.topic ?? "").trim();
      if (!ALLOWED_TOPICS.has(topic)) {
        res.status(400).json({ error: "Unknown topic." });
        return;
      }
      const updated = await db
        .update(chatLogsTable)
        .set({ topic })
        .where(eq(chatLogsTable.id, id))
        .returning({ id: chatLogsTable.id, topic: chatLogsTable.topic });
      if (updated.length === 0) {
        res.status(404).json({ error: "Chat log not found." });
        return;
      }
      res.json({ id: updated[0]!.id, topic: updated[0]!.topic });
    } catch (err) {
      console.error("Relabel chat log error:", err);
      res.status(500).json({ error: "Failed to update topic." });
    }
  },
);

router.get(
  "/admin/chat-actions",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const rawLimit = Number(req.query["limit"] ?? 25);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
        : 25;
      const rows = await db
        .select({
          id: chatActionsTable.id,
          createdAt: chatActionsTable.createdAt,
          action: chatActionsTable.action,
          status: chatActionsTable.status,
          senderEmail: chatActionsTable.senderEmail,
          senderName: chatActionsTable.senderName,
          senderCompany: chatActionsTable.senderCompany,
          recipients: chatActionsTable.recipients,
          summary: chatActionsTable.summary,
          errorMessage: chatActionsTable.errorMessage,
        })
        .from(chatActionsTable)
        .orderBy(desc(chatActionsTable.createdAt))
        .limit(limit);
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          createdAt:
            r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          action: r.action,
          status: r.status,
          senderEmail: r.senderEmail ?? "",
          senderName: r.senderName ?? "",
          senderCompany: r.senderCompany ?? "",
          recipients: r.recipients ?? "",
          summary: r.summary ?? "",
          errorMessage: r.errorMessage ?? "",
        })),
      });
    } catch (err) {
      console.error("Chat actions error:", err);
      res.status(500).json({ error: "Failed to load chat actions." });
    }
  },
);

router.get(
  "/admin/hot-leads",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const rawLimit = Number(req.query["limit"] ?? 25);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
        : 25;
      const rows = await db
        .select({
          id: hotLeadsTable.id,
          createdAt: hotLeadsTable.createdAt,
          senderEmail: hotLeadsTable.senderEmail,
          senderCompany: hotLeadsTable.senderCompany,
          role: hotLeadsTable.role,
          note: hotLeadsTable.note,
          notified: hotLeadsTable.notified,
          notifyError: hotLeadsTable.notifyError,
        })
        .from(hotLeadsTable)
        .orderBy(desc(hotLeadsTable.createdAt))
        .limit(limit);
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          createdAt:
            r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          senderEmail: r.senderEmail,
          senderCompany: r.senderCompany ?? "",
          role: r.role ?? "",
          note: r.note ?? "",
          notified: r.notified,
          notifyError: r.notifyError ?? "",
        })),
      });
    } catch (err) {
      console.error("Hot leads error:", err);
      res.status(500).json({ error: "Failed to load hot leads." });
    }
  },
);

router.get(
  "/admin/match-logs",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const rawLimit = Number(req.query["limit"] ?? 25);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
        : 25;
      const rows = await db
        .select({
          id: matchLogsTable.id,
          createdAt: matchLogsTable.createdAt,
          roleTitle: matchLogsTable.roleTitle,
          recruiterCompany: matchLogsTable.recruiterCompany,
          recruiterEmailDomain: matchLogsTable.recruiterEmailDomain,
          fitScore: matchLogsTable.fitScore,
          shareCount: matchLogsTable.shareCount,
          jdLength: matchLogsTable.jdLength,
          estimatedCostUsd: matchLogsTable.estimatedCostUsd,
        })
        .from(matchLogsTable)
        .orderBy(desc(matchLogsTable.createdAt))
        .limit(limit);
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          createdAt:
            r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          roleTitle: r.roleTitle ?? "(unspecified)",
          recruiterCompany: r.recruiterCompany ?? "",
          recruiterEmailDomain: r.recruiterEmailDomain ?? "",
          fitScore: r.fitScore,
          shareCount: r.shareCount,
          jdLength: r.jdLength,
          estimatedCostUsd: r.estimatedCostUsd,
        })),
      });
    } catch (err) {
      console.error("Match logs error:", err);
      res.status(500).json({ error: "Failed to load match logs." });
    }
  },
);

router.get(
  "/admin/demo-events",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const rawWindow = Number(req.query["windowDays"] ?? 30);
      const windowDays = Number.isFinite(rawWindow)
        ? Math.min(Math.max(Math.trunc(rawWindow), 1), 90)
        : 30;
      const periodEnd = new Date();
      const periodStart = new Date(
        periodEnd.getTime() - windowDays * 24 * 60 * 60 * 1000,
      );
      const since = sql`${periodStart.toISOString()}::timestamptz`;

      const dayAlignedEnd = new Date(periodEnd);
      dayAlignedEnd.setUTCHours(0, 0, 0, 0);
      const dayAlignedStart = new Date(dayAlignedEnd);
      dayAlignedStart.setUTCDate(dayAlignedStart.getUTCDate() - (windowDays - 1));
      const dailySince = sql`${dayAlignedStart.toISOString()}::timestamptz`;

      const [breakdown, dailyBreakdown] = await Promise.all([
        db.execute<{
          demo: string;
          event: string;
          count: number;
        }>(sql`
          select demo, event, count(*)::int as count
          from demo_events
          where created_at >= ${since}
          group by demo, event
          order by demo asc, count desc
        `),
        db.execute<{
          demo: string;
          day: string;
          count: number;
        }>(sql`
          select demo,
                 to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
                 count(*)::int as count
          from demo_events
          where created_at >= ${dailySince}
          group by demo, day
          order by demo asc, day asc
        `),
      ]);

      const rows =
        breakdown.rows ??
        (breakdown as unknown as Array<{
          demo: string;
          event: string;
          count: number;
        }>);

      const dailyRows =
        dailyBreakdown.rows ??
        (dailyBreakdown as unknown as Array<{
          demo: string;
          day: string;
          count: number;
        }>);

      const byDemoMap = new Map<
        string,
        { demo: string; total: number; events: Record<string, number> }
      >();
      for (const r of rows) {
        const demo = r.demo;
        const event = r.event;
        const count = Number(r.count);
        let bucket = byDemoMap.get(demo);
        if (!bucket) {
          bucket = { demo, total: 0, events: {} };
          byDemoMap.set(demo, bucket);
        }
        bucket.total += count;
        bucket.events[event] = (bucket.events[event] ?? 0) + count;
      }
      const byDemo = Array.from(byDemoMap.values()).sort(
        (a, b) => b.total - a.total,
      );

      const dailyByDemoMap = new Map<
        string,
        { day: string; count: number }[]
      >();
      for (const r of dailyRows) {
        const demo = r.demo;
        let arr = dailyByDemoMap.get(demo);
        if (!arr) {
          arr = [];
          dailyByDemoMap.set(demo, arr);
        }
        arr.push({ day: r.day, count: Number(r.count) });
      }

      const allDays: string[] = [];
      const d = new Date(dayAlignedStart);
      while (d <= dayAlignedEnd) {
        allDays.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
      }

      const dailyByDemo: Record<string, { day: string; count: number }[]> = {};
      const allDemos = new Set([
        ...byDemoMap.keys(),
        ...dailyByDemoMap.keys(),
      ]);
      for (const demo of allDemos) {
        const existing = dailyByDemoMap.get(demo) ?? [];
        const byDay = new Map(existing.map((e) => [e.day, e.count]));
        dailyByDemo[demo] = allDays.map((day) => ({
          day,
          count: byDay.get(day) ?? 0,
        }));
      }

      res.json({
        windowDays,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        byDemo,
        dailyByDemo,
      });
    } catch (err) {
      console.error("Demo events summary error:", err);
      res.status(500).json({ error: "Failed to load demo events." });
    }
  },
);

// Exposed for tests so they can clear out the table without depending on
// outside infrastructure. Not wired to any HTTP route.
export async function _truncateDemoEventsForTests(): Promise<void> {
  await db.delete(demoEventsTable);
}

export default router;
