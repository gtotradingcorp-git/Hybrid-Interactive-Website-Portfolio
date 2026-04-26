import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "./logger";

export interface DigestConfig {
  recipients: string[];
  /** 0=Sunday … 6=Saturday in UTC. null = any day. */
  sendDay: number | null;
  /** 0..23 in UTC. null = any hour. */
  sendHour: number | null;
  paused: boolean;
}

const DEFAULT_RECIPIENT = "cs_info@agentmail.to";
const LEGACY_RECIPIENT = "john.libao@agentmail.to";

function parseRecipients(raw: string | undefined): string[] | null {
  if (raw == null) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : null;
}

function parseInteger(
  raw: string | undefined,
  min: number,
  max: number,
): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function parseBool(raw: string | undefined): boolean {
  if (!raw) return false;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function envDefaults(): DigestConfig {
  return {
    recipients:
      parseRecipients(process.env["WEEKLY_DIGEST_RECIPIENTS"]) ??
      [DEFAULT_RECIPIENT],
    sendDay: parseInteger(process.env["WEEKLY_DIGEST_SEND_DAY"], 0, 6),
    sendHour: parseInteger(process.env["WEEKLY_DIGEST_SEND_HOUR"], 0, 23),
    paused: parseBool(process.env["WEEKLY_DIGEST_PAUSED"]),
  };
}

function configPath(): string {
  return (
    process.env["WEEKLY_DIGEST_CONFIG_FILE"] ??
    path.resolve(process.cwd(), "data", "weekly-digest-config.json")
  );
}

let cached: DigestConfig | null = null;

function sanitize(input: Partial<DigestConfig>): Partial<DigestConfig> {
  const out: Partial<DigestConfig> = {};
  if (Array.isArray(input.recipients)) {
    const list = input.recipients
      .map((r) => (typeof r === "string" ? r.trim() : ""))
      .filter((r) => r.length > 0 && /.+@.+\..+/.test(r));
    if (list.length > 0) out.recipients = list;
  }
  if (input.sendDay === null) {
    out.sendDay = null;
  } else if (typeof input.sendDay === "number" && Number.isInteger(input.sendDay) && input.sendDay >= 0 && input.sendDay <= 6) {
    out.sendDay = input.sendDay;
  }
  if (input.sendHour === null) {
    out.sendHour = null;
  } else if (typeof input.sendHour === "number" && Number.isInteger(input.sendHour) && input.sendHour >= 0 && input.sendHour <= 23) {
    out.sendHour = input.sendHour;
  }
  if (typeof input.paused === "boolean") {
    out.paused = input.paused;
  }
  return out;
}

async function readOverrides(): Promise<Partial<DigestConfig>> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DigestConfig>;
    return sanitize(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    logger.warn(
      { err, path: configPath() },
      "Failed to read weekly digest config file; using env defaults.",
    );
    return {};
  }
}

/**
 * One-time migration: rewrite any persisted recipient list still pointing at
 * the legacy `john.libao@agentmail.to` address to the new shared
 * `cs_info@agentmail.to` inbox so existing installs pick up the change
 * without an admin needing to edit the digest config by hand. Safe to call
 * repeatedly: it's a no-op when the legacy address is not present (or the
 * config file does not yet exist).
 */
export async function migrateLegacyDigestRecipients(): Promise<void> {
  const file = configPath();
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    logger.warn({ err, path: file }, "Digest config migration: read failed.");
    return;
  }
  let parsed: Partial<DigestConfig>;
  try {
    parsed = JSON.parse(raw) as Partial<DigestConfig>;
  } catch (err) {
    logger.warn({ err, path: file }, "Digest config migration: parse failed.");
    return;
  }
  if (!Array.isArray(parsed.recipients)) return;
  const before = parsed.recipients.filter((r) => typeof r === "string");
  if (!before.includes(LEGACY_RECIPIENT)) return;
  const seen = new Set<string>();
  const after: string[] = [];
  for (const r of before) {
    const next = r === LEGACY_RECIPIENT ? DEFAULT_RECIPIENT : r;
    if (!seen.has(next)) {
      seen.add(next);
      after.push(next);
    }
  }
  const next = { ...parsed, recipients: after };
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(next, null, 2), "utf8");
    cached = null;
    logger.info(
      { path: file, before, after },
      "Digest config migrated: legacy recipient replaced with cs_info@agentmail.to.",
    );
  } catch (err) {
    logger.warn({ err, path: file }, "Digest config migration: write failed.");
  }
}

function merge(base: DigestConfig, over: Partial<DigestConfig>): DigestConfig {
  return {
    recipients: over.recipients ?? base.recipients,
    sendDay: over.sendDay !== undefined ? over.sendDay : base.sendDay,
    sendHour: over.sendHour !== undefined ? over.sendHour : base.sendHour,
    paused: over.paused !== undefined ? over.paused : base.paused,
  };
}

export async function getDigestConfig(): Promise<DigestConfig> {
  if (cached) return cached;
  const overrides = await readOverrides();
  cached = merge(envDefaults(), overrides);
  return cached;
}

export async function updateDigestConfig(
  patch: Partial<DigestConfig>,
): Promise<DigestConfig> {
  const overrides = await readOverrides();
  const next = sanitize({ ...overrides, ...patch });
  // Allow explicitly clearing day/hour back to "any" by passing null.
  if (patch.sendDay === null) next.sendDay = null;
  if (patch.sendHour === null) next.sendHour = null;

  const file = configPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(next, null, 2), "utf8");
  cached = merge(envDefaults(), next);
  return cached;
}

/** Test helper: drop the in-process cache so the next read re-loads from disk. */
export function _resetDigestConfigCache(): void {
  cached = null;
}
