import { pgTable, serial, timestamp, varchar, integer, bigint, doublePrecision, text, uniqueIndex } from "drizzle-orm/pg-core";

export const costAlertsTable = pgTable(
  "cost_alerts",
  {
    id: serial("id").primaryKey(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    day: varchar("day", { length: 10 }).notNull(),
    requests: integer("requests").notNull().default(0),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
    estimatedCostUsd: doublePrecision("estimated_cost_usd").notNull().default(0),
    thresholdUsd: doublePrecision("threshold_usd").notNull().default(0),
    status: varchar("status", { length: 16 }).notNull(),
    errorMessage: text("error_message"),
  },
  (table) => ({
    dayStatusIdx: uniqueIndex("cost_alerts_day_status_idx").on(table.day, table.status),
  }),
);

export type CostAlert = typeof costAlertsTable.$inferSelect;
export type InsertCostAlert = typeof costAlertsTable.$inferInsert;
