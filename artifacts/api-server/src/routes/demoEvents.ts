import { Router, type IRouter, type Request, type Response } from "express";
import { db, demoEventsTable } from "@workspace/db";
import { createRouteRateLimiter, getClientIp } from "../lib/rateLimit";
import { logger } from "../lib/logger";

// Allow-listed demo slugs and event names. Mirrors what the portfolio's
// in-browser demos emit. Anything outside these lists is dropped at the
// route boundary so the column never holds free-form data.
export const ALLOWED_DEMOS = new Set(["ticketing", "erp", "bi"]);

export const ALLOWED_EVENTS = new Set([
  "first_interaction",
  "ticket_created",
  "stock_adjusted",
  "range_changed",
  "export_clicked",
  "project_link_clicked",
  "invoice_generated",
]);

// Generous per-IP cap so a curious visitor poking at all three demos isn't
// blocked, but a runaway script can't flood the table. Backed by the
// durable Postgres limiter so it survives restarts and is shared across
// replicas.
const demoEventsRateLimiter = createRouteRateLimiter("demo_events", [
  {
    windowMs: 60_000,
    max: 60,
    reason: "Too many demo events. Please slow down.",
  },
]);

// Exposed for tests so they can run without prior submissions leaking in.
export async function _resetDemoEventsRateLimit(): Promise<void> {
  await demoEventsRateLimiter.reset();
}

const router: IRouter = Router();

router.post("/demo-events", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = await demoEventsRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const demo = typeof body["demo"] === "string" ? body["demo"] : "";
  const event = typeof body["event"] === "string" ? body["event"] : "";

  if (!ALLOWED_DEMOS.has(demo)) {
    res.status(400).json({ error: "Unknown demo." });
    return;
  }
  if (!ALLOWED_EVENTS.has(event)) {
    res.status(400).json({ error: "Unknown event." });
    return;
  }

  try {
    await db.insert(demoEventsTable).values({ demo, event });
    res.status(204).end();
  } catch (err) {
    // Telemetry must never block the user experience. Log and return a
    // soft success so the client never surfaces an error to the visitor.
    logger.error({ err }, "Failed to record demo event");
    res.status(202).json({ ok: false });
  }
});

export default router;
