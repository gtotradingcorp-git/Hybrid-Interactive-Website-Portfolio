import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "./logger";

export interface CostAlertConfig {
  /** Daily chat cost threshold in USD. null disables the alert. */
  thresholdUsd: number | null;
}

function parsePositiveNumber(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function envDefaults(): CostAlertConfig {
  return {
    thresholdUsd: parsePositiveNumber(
      process.env["COST_ALERT_DAILY_USD_THRESHOLD"],
    ),
  };
}

function configPath(): string {
  return (
    process.env["COST_ALERT_CONFIG_FILE"] ??
    path.resolve(process.cwd(), "data", "cost-alert-config.json")
  );
}

let cached: CostAlertConfig | null = null;

function sanitize(input: Partial<CostAlertConfig>): Partial<CostAlertConfig> {
  const out: Partial<CostAlertConfig> = {};
  if (input.thresholdUsd === null) {
    out.thresholdUsd = null;
  } else if (
    typeof input.thresholdUsd === "number" &&
    Number.isFinite(input.thresholdUsd) &&
    input.thresholdUsd > 0
  ) {
    out.thresholdUsd = input.thresholdUsd;
  }
  return out;
}

async function readOverrides(): Promise<Partial<CostAlertConfig>> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CostAlertConfig>;
    return sanitize(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    logger.warn(
      { err, path: configPath() },
      "Failed to read cost alert config file; using env defaults.",
    );
    return {};
  }
}

function merge(
  base: CostAlertConfig,
  over: Partial<CostAlertConfig>,
): CostAlertConfig {
  return {
    thresholdUsd:
      over.thresholdUsd !== undefined ? over.thresholdUsd : base.thresholdUsd,
  };
}

export async function getCostAlertConfig(): Promise<CostAlertConfig> {
  if (cached) return cached;
  const overrides = await readOverrides();
  cached = merge(envDefaults(), overrides);
  return cached;
}

export async function updateCostAlertConfig(
  patch: Partial<CostAlertConfig>,
): Promise<CostAlertConfig> {
  const overrides = await readOverrides();
  const next = sanitize({ ...overrides, ...patch });
  if (patch.thresholdUsd === null) next.thresholdUsd = null;

  const file = configPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(next, null, 2), "utf8");
  cached = merge(envDefaults(), next);
  return cached;
}

/** Test helper: drop the in-process cache so the next read re-loads from disk. */
export function _resetCostAlertConfigCache(): void {
  cached = null;
}
