import { pgTable, serial, timestamp, varchar, integer, bigint, doublePrecision, text, index } from "drizzle-orm/pg-core";

export const weeklyDigestsTable = pgTable(
  "weekly_digests",
  {
    id: serial("id").primaryKey(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    requests: integer("requests").notNull().default(0),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
    estimatedCostUsd: doublePrecision("estimated_cost_usd").notNull().default(0),
    status: varchar("status", { length: 16 }).notNull(),
    errorMessage: text("error_message"),
  },
  (table) => ({
    sentAtIdx: index("weekly_digests_sent_at_idx").on(table.sentAt),
  }),
);

export type WeeklyDigest = typeof weeklyDigestsTable.$inferSelect;
export type InsertWeeklyDigest = typeof weeklyDigestsTable.$inferInsert;
