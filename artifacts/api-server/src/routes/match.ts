import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { resolve4, resolve6 } from "node:dns/promises";
import { eq, sql } from "drizzle-orm";
import { db, matchLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { createRateLimiter, getClientIp } from "../lib/rateLimit";
import {
  runMatch,
  HAS_OPENAI_CONFIG,
  type MatchResult,
} from "../lib/matchEngine";
import { renderMatchPdf } from "../lib/matchPdf";

const router: IRouter = Router();

const MAX_JD_LENGTH = 20_000;
const MIN_JD_LENGTH = 80;
const UPSTREAM_TIMEOUT_MS = 25_000;
const INBOX_ID = "cs_info@agentmail.to";
const AGENTMAIL_BASE = "https://api.agentmail.to";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "aol.com", "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "zoho.com",
  "mail.com", "yandex.com", "gmx.com", "gmx.net",
  "fastmail.com", "tutanota.com", "hey.com",
]);

// Per-IP match limiter — JD scoring is more expensive than chat (full JSON
// response, larger prompt) so we cap tighter.
const matchRateLimiter = createRateLimiter([
  { windowMs: 60_000, max: 4, reason: "Too many match requests. Please wait a moment." },
  { windowMs: 24 * 60 * 60 * 1000, max: 30, reason: "Daily match limit reached. Please try again tomorrow." },
]);

const shareRateLimiter = createRateLimiter([
  { windowMs: 60_000, max: 3, reason: "Too many share requests. Please wait a moment." },
  { windowMs: 24 * 60 * 60 * 1000, max: 20, reason: "Daily share limit reached. Please try again tomorrow." },
]);

// IDs are sequential, so the read endpoints are scrape-friendly without a
// throttle. These limits are generous enough that legitimate refresh / PDF
// downloads aren't impacted, but they cap a single IP from enumerating the
// full table or hammering the PDF renderer.
const matchReadRateLimiter = createRateLimiter([
  { windowMs: 60_000, max: 60, reason: "Too many requests. Please wait a moment." },
  { windowMs: 24 * 60 * 60 * 1000, max: 500, reason: "Daily request limit reached. Please try again tomorrow." },
]);

const matchPdfRateLimiter = createRateLimiter([
  { windowMs: 60_000, max: 12, reason: "Too many PDF requests. Please wait a moment." },
  { windowMs: 24 * 60 * 60 * 1000, max: 100, reason: "Daily PDF download limit reached. Please try again tomorrow." },
]);

export function _resetMatchRateLimit(): void {
  matchRateLimiter.reset();
  shareRateLimiter.reset();
  matchReadRateLimiter.reset();
  matchPdfRateLimiter.reset();
}

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || !domain.includes(".")) return null;
  return domain.slice(0, 120);
}

function isValidEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function siteUrlFromReq(req: Request): string | null {
  // Prefer an explicit env override (set in production deployments) so the
  // share email and PDF footer link to the public site, not the proxy host.
  const env = process.env["PUBLIC_SITE_URL"];
  if (env) return env.replace(/\/$/, "");
  // Fall back to the request's host so dev links still resolve.
  const host = req.get("host");
  if (!host) return null;
  const proto = req.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`.replace(/\/$/, "");
}

interface DbRow {
  id: number;
  createdAt: Date;
  roleTitle: string | null;
  recruiterCompany: string | null;
  recruiterEmailDomain: string | null;
  fitScore: number;
  summary: string | null;
  requirementsJson: unknown;
  shareCount: number;
}

function rowToResult(row: DbRow): MatchResult {
  // The persisted JSON is the full normalised result — we wrote it that way
  // in POST /match so the GET / PDF / share endpoints can re-render without
  // re-calling the LLM.
  const stored = row.requirementsJson as Partial<MatchResult> | null;
  return {
    fitScore: row.fitScore,
    summary: row.summary ?? "",
    roleTitle: row.roleTitle ?? "Unspecified Role",
    recruiterCompany: row.recruiterCompany,
    requirements: stored?.requirements ?? [],
    topProofPoints: stored?.topProofPoints ?? [],
  };
}

// ── SSRF-safe URL fetcher ────────────────────────────────────────────
// Resolves the hostname's IPs via DNS *before* connecting and rejects
// any address in a private, loopback, link-local, or cloud-metadata
// range.  Redirects are followed manually (max 5 hops) with the same
// IP check on every hop.
function isPrivateIp(ip: string): boolean {
  // IPv4
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (ip === "0.0.0.0") return true;
  // AWS / GCP / Azure metadata
  if (ip === "169.254.169.254") return true;
  if (ip === "100.100.100.200") return true;
  // IPv6 loopback / link-local / unique-local
  if (ip === "::1" || ip === "::") return true;
  if (/^f[cd]/i.test(ip)) return true;
  if (/^fe80/i.test(ip)) return true;
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  // IP-literal hostnames
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith("[")) {
    const plain = hostname.replace(/^\[|\]$/g, "");
    if (isPrivateIp(plain)) throw new Error("SSRF_BLOCKED");
    return;
  }
  const ips: string[] = [];
  try { ips.push(...(await resolve4(hostname))); } catch { /* no A records */ }
  try { ips.push(...(await resolve6(hostname))); } catch { /* no AAAA records */ }
  if (ips.length === 0) throw new Error("DNS_UNRESOLVABLE");
  for (const ip of ips) {
    if (isPrivateIp(ip)) throw new Error("SSRF_BLOCKED");
  }
}

const MAX_REDIRECTS = 5;

async function safeFetch(
  url: string,
  signal: AbortSignal,
): Promise<globalThis.Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    await assertPublicHost(parsed.hostname);
    const res = await fetch(current, {
      signal,
      redirect: "manual",
      headers: {
        Accept: "text/html, text/plain, application/xhtml+xml",
        "User-Agent": "JohnLibaoPortfolio/1.0 (+https://johnlibao.com)",
      },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect without Location header");
      current = new URL(location, current).href;
      const redir = new URL(current);
      if (!["http:", "https:"].includes(redir.protocol)) {
        throw new Error("SSRF_BLOCKED");
      }
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

const fetchJdRateLimiter = createRateLimiter([
  { windowMs: 60_000, max: 10, reason: "Too many URL fetch requests. Please wait a moment." },
  { windowMs: 24 * 60 * 60 * 1000, max: 60, reason: "Daily URL fetch limit reached." },
]);

router.post("/match/fetch-jd", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = fetchJdRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }

  const body = (req.body ?? {}) as { url?: unknown };
  const raw = typeof body.url === "string" ? body.url.trim() : "";
  if (!raw) {
    res.status(400).json({ error: "Please provide a URL." });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    res.status(400).json({ error: "That doesn't look like a valid URL." });
    return;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    res.status(400).json({ error: "Only HTTP and HTTPS URLs are supported." });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const fetchRes = await safeFetch(parsed.href, controller.signal);
    clearTimeout(timer);

    if (!fetchRes.ok) {
      res.status(502).json({
        error: `The page returned ${fetchRes.status}. Paste the JD text directly instead.`,
      });
      return;
    }

    const contentType = fetchRes.headers.get("content-type") ?? "";
    if (!contentType.includes("text/") && !contentType.includes("html") && !contentType.includes("xhtml")) {
      res.status(400).json({
        error: "That URL returned a non-text file. Paste the JD text directly instead.",
      });
      return;
    }

    const maxBytes = 512 * 1024;
    const rawBuffer = await fetchRes.arrayBuffer();
    if (rawBuffer.byteLength > maxBytes) {
      res.status(400).json({
        error: "The page is too large (>512 KB). Paste the relevant section instead.",
      });
      return;
    }

    let html = new TextDecoder("utf-8", { fatal: false }).decode(rawBuffer);

    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(p|div|h[1-6]|li|tr|section|article)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (html.length < 40) {
      res.status(400).json({
        error: "Could not extract meaningful text from that URL. Paste the JD directly.",
      });
      return;
    }

    if (html.length > MAX_JD_LENGTH) {
      html = html.slice(0, MAX_JD_LENGTH);
    }

    res.json({ text: html });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      res.status(504).json({
        error: "The page took too long to load. Paste the JD text instead.",
      });
      return;
    }
    if ((err as Error).message === "SSRF_BLOCKED") {
      res.status(400).json({
        error: "That URL points to a restricted network. Paste the JD text instead.",
      });
      return;
    }
    if ((err as Error).message === "DNS_UNRESOLVABLE") {
      res.status(400).json({
        error: "Could not resolve that hostname. Check the URL and try again.",
      });
      return;
    }
    logger.warn({ err, url: parsed.hostname }, "fetch-jd failed");
    res.status(502).json({
      error: "Could not fetch that URL. Please paste the JD text directly.",
    });
  }
});

router.post("/match", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = matchRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }

  if (!HAS_OPENAI_CONFIG) {
    res.status(503).json({
      error:
        "Recruiter Mode is not available right now. Please reach out via the Contact page.",
    });
    return;
  }

  const body = (req.body ?? {}) as {
    jdText?: unknown;
    recruiterEmail?: unknown;
    recruiterCompany?: unknown;
  };
  const jdText = typeof body.jdText === "string" ? body.jdText.trim() : "";
  const recruiterEmail = typeof body.recruiterEmail === "string" ? body.recruiterEmail.trim() : "";
  const recruiterCompany =
    typeof body.recruiterCompany === "string" ? body.recruiterCompany.trim().slice(0, 200) : "";

  if (jdText.length < MIN_JD_LENGTH) {
    res.status(400).json({
      error: `Please paste a job description (at least ${MIN_JD_LENGTH} characters).`,
    });
    return;
  }
  if (jdText.length > MAX_JD_LENGTH) {
    res.status(400).json({
      error: `Job description is too long (limit ${MAX_JD_LENGTH.toLocaleString()} characters).`,
    });
    return;
  }
  if (recruiterEmail && !isValidEmail(recruiterEmail)) {
    res.status(400).json({ error: "Recruiter email looks invalid." });
    return;
  }

  let effectiveCompany = recruiterCompany;
  if (!effectiveCompany && recruiterEmail) {
    const domain = emailDomain(recruiterEmail);
    if (domain && !FREE_EMAIL_DOMAINS.has(domain.toLowerCase())) {
      effectiveCompany = domain.replace(/\.\w+$/, "")
        .replace(/[.-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let timedOut = false;
  controller.signal.addEventListener("abort", () => {
    timedOut = true;
  });

  try {
    const { result, promptTokens, completionTokens, estimatedCostUsd } = await runMatch(
      jdText,
      effectiveCompany || null,
      controller.signal,
    );
    clearTimeout(timer);

    const jdHash = createHash("sha256").update(jdText).digest("hex");
    const inserted = await db
      .insert(matchLogsTable)
      .values({
        roleTitle: result.roleTitle.slice(0, 200),
        recruiterCompany: result.recruiterCompany?.slice(0, 200) ?? null,
        recruiterEmailDomain: emailDomain(recruiterEmail),
        fitScore: result.fitScore,
        summary: result.summary,
        requirementsJson: result,
        jdLength: jdText.length,
        jdHash,
        promptTokens,
        completionTokens,
        estimatedCostUsd,
      })
      .returning({ id: matchLogsTable.id });

    const id = inserted[0]?.id;
    res.json({ id, result });
  } catch (err) {
    clearTimeout(timer);
    if (timedOut) {
      logger.warn({ err }, "Match request timed out");
      res.status(504).json({
        error: "The match analysis is taking longer than expected. Please try again.",
      });
      return;
    }
    logger.error({ err }, "Match request failed");
    res.status(502).json({
      error: "Could not analyse the job description right now. Please try again shortly.",
    });
  }
});

router.get("/match/:id", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = matchReadRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid match id." });
    return;
  }
  const rows = await db
    .select({
      id: matchLogsTable.id,
      createdAt: matchLogsTable.createdAt,
      roleTitle: matchLogsTable.roleTitle,
      recruiterCompany: matchLogsTable.recruiterCompany,
      recruiterEmailDomain: matchLogsTable.recruiterEmailDomain,
      fitScore: matchLogsTable.fitScore,
      summary: matchLogsTable.summary,
      requirementsJson: matchLogsTable.requirementsJson,
      shareCount: matchLogsTable.shareCount,
    })
    .from(matchLogsTable)
    .where(eq(matchLogsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "Match not found." });
    return;
  }
  res.json({
    id: row.id,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    result: rowToResult(row),
  });
});

router.get("/match/:id/pdf", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = matchPdfRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid match id." });
    return;
  }
  const rows = await db
    .select({
      id: matchLogsTable.id,
      createdAt: matchLogsTable.createdAt,
      roleTitle: matchLogsTable.roleTitle,
      recruiterCompany: matchLogsTable.recruiterCompany,
      recruiterEmailDomain: matchLogsTable.recruiterEmailDomain,
      fitScore: matchLogsTable.fitScore,
      summary: matchLogsTable.summary,
      requirementsJson: matchLogsTable.requirementsJson,
      shareCount: matchLogsTable.shareCount,
    })
    .from(matchLogsTable)
    .where(eq(matchLogsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "Match not found." });
    return;
  }
  try {
    const pdf = await renderMatchPdf(rowToResult(row), {
      matchId: row.id,
      siteUrl: siteUrlFromReq(req),
    });
    const filename = `john-libao-fit-brief-${row.id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(Buffer.from(pdf));
  } catch (err) {
    logger.error({ err, id }, "Failed to render match PDF");
    res.status(500).json({ error: "Failed to render PDF." });
  }
});

router.post("/match/:id/share", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = shareRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }

  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid match id." });
    return;
  }
  const apiKey = process.env["AGENTMAIL_API_KEY"];
  if (!apiKey) {
    res.status(503).json({ error: "Email service is not configured." });
    return;
  }

  const body = (req.body ?? {}) as {
    recipients?: unknown;
    senderEmail?: unknown;
    senderName?: unknown;
    note?: unknown;
  };
  const rawRecipients = Array.isArray(body.recipients) ? body.recipients : [];
  const recipients = rawRecipients
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (recipients.length === 0) {
    res.status(400).json({ error: "Add at least one panel member's email." });
    return;
  }
  if (recipients.length > 5) {
    res.status(400).json({ error: "You can share with up to 5 panel members at a time." });
    return;
  }
  if (recipients.some((r) => !isValidEmail(r))) {
    res.status(400).json({ error: "One of the panel emails looks invalid." });
    return;
  }

  const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail.trim() : "";
  const senderName = typeof body.senderName === "string" ? body.senderName.trim().slice(0, 120) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (senderEmail && !isValidEmail(senderEmail)) {
    res.status(400).json({ error: "Your email address looks invalid." });
    return;
  }

  const rows = await db
    .select({
      id: matchLogsTable.id,
      createdAt: matchLogsTable.createdAt,
      roleTitle: matchLogsTable.roleTitle,
      recruiterCompany: matchLogsTable.recruiterCompany,
      recruiterEmailDomain: matchLogsTable.recruiterEmailDomain,
      fitScore: matchLogsTable.fitScore,
      summary: matchLogsTable.summary,
      requirementsJson: matchLogsTable.requirementsJson,
      shareCount: matchLogsTable.shareCount,
    })
    .from(matchLogsTable)
    .where(eq(matchLogsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "Match not found." });
    return;
  }

  const result = rowToResult(row);
  const site = siteUrlFromReq(req);
  const liveLink = site ? `${site}/match/${row.id}` : `match id ${row.id}`;
  const subject = `Hiring brief — John Michael Libao for ${result.roleTitle}${
    result.recruiterCompany ? ` (${result.recruiterCompany})` : ""
  }`;

  const proofLines = result.topProofPoints
    .slice(0, 3)
    .map((p) => `  • ${p.title} — ${p.reason}`)
    .join("\n");
  const reqLines = result.requirements
    .slice(0, 8)
    .map((r) => `  [${r.status.toUpperCase()}] ${r.requirement}`)
    .join("\n");
  const fromLine = senderName
    ? senderEmail
      ? `Shared by ${senderName} (${senderEmail})`
      : `Shared by ${senderName}`
    : senderEmail
      ? `Shared by ${senderEmail}`
      : "Shared from johnlibao.portfolio";

  const text = [
    `Hiring brief for ${result.roleTitle}${result.recruiterCompany ? ` at ${result.recruiterCompany}` : ""}`,
    ``,
    `Fit score: ${result.fitScore}/100`,
    ``,
    `Summary`,
    result.summary,
    ``,
    `Top proof points`,
    proofLines || "  (none)",
    ``,
    `Requirements (top ${Math.min(8, result.requirements.length)})`,
    reqLines || "  (none)",
    ``,
    note ? `Note from sender:\n${note}\n` : ``,
    `Full live brief: ${liveLink}`,
    `Contact John directly: ${INBOX_ID}`,
    ``,
    `--`,
    fromLine,
  ]
    .filter((line) => line !== ``)
    .join("\n");

  try {
    const encodedInbox = encodeURIComponent(INBOX_ID);
    const sendRes = await fetch(
      `${AGENTMAIL_BASE}/v0/inboxes/${encodedInbox}/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: recipients,
          cc: [INBOX_ID],
          subject,
          text,
          ...(senderEmail ? { reply_to: senderEmail } : {}),
        }),
      },
    );
    if (!sendRes.ok) {
      const errBody = await sendRes.text().catch(() => "");
      logger.error({ status: sendRes.status, errBody: errBody.slice(0, 200) }, "AgentMail share failed");
      res.status(502).json({ error: "Failed to send the brief. Please try again." });
      return;
    }
    // Counter update is best-effort: the email is already on its way, so a
    // DB failure here must NOT cause the caller to retry and double-send.
    // We log it and still return success — analytics drift is preferable to
    // duplicate recruiter emails.
    try {
      await db
        .update(matchLogsTable)
        .set({ shareCount: sql`${matchLogsTable.shareCount} + 1` })
        .where(eq(matchLogsTable.id, id));
    } catch (counterErr) {
      logger.warn(
        { err: counterErr, id },
        "Share email sent but shareCount update failed",
      );
    }
    res.json({ success: true, recipients });
  } catch (err) {
    logger.error({ err, id }, "Match share failed");
    res.status(500).json({ error: "Failed to send the brief." });
  }
});

export default router;
