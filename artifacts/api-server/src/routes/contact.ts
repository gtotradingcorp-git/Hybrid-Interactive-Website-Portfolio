import { Router, type IRouter, type Request, type Response } from "express";
import { createRouteRateLimiter, getClientIp } from "../lib/rateLimit";

const router: IRouter = Router();

const INBOX_ID = "cs_info@agentmail.to";
const AGENTMAIL_BASE = "https://api.agentmail.to";

// Per-IP contact-form rate limiter: 5 submissions / 10 minutes. Backed by
// the durable Postgres-backed limiter so counters survive restarts and are
// shared across replicas. Tests opt into the in-memory backend via
// RATE_LIMIT_BACKEND=memory.
const contactRateLimiter = createRouteRateLimiter("contact", [
  {
    windowMs: 10 * 60_000,
    max: 5,
    reason: "Too many contact requests. Please try again later.",
  },
]);

// Exposed for tests so they can run independently of prior submissions.
export async function _resetContactRateLimit(): Promise<void> {
  await contactRateLimiter.reset();
}

router.post("/contact", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = await contactRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }

  const { name, email, company, message } = req.body;

  if (!name || !email || !message) {
    res.status(400).json({ error: "Name, email, and message are required." });
    return;
  }

  const apiKey = process.env["AGENTMAIL_API_KEY"];
  if (!apiKey) {
    console.error("AGENTMAIL_API_KEY is not configured.");
    res.status(500).json({ error: "Email service is not configured." });
    return;
  }

  const subject = company
    ? `Portfolio Inquiry from ${name} (${company})`
    : `Portfolio Inquiry from ${name}`;

  const body = [
    `Name: ${name}`,
    `Email: ${email}`,
    company ? `Company: ${company}` : null,
    ``,
    `Message:`,
    message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const encodedInbox = encodeURIComponent(INBOX_ID);

    const sendResponse = await fetch(
      `${AGENTMAIL_BASE}/v0/inboxes/${encodedInbox}/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: INBOX_ID,
          subject,
          text: body,
          reply_to: email,
        }),
      },
    );

    if (!sendResponse.ok) {
      const errBody = await sendResponse.text();
      console.error("AgentMail send error:", sendResponse.status, errBody);
      res.status(502).json({ error: "Failed to send message." });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
