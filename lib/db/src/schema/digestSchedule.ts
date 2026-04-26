import { pgTable, integer, timestamp, varchar, text } from "drizzle-orm/pg-core";

/**
 * Singleton row table (id = 1) that stores the durable state of the weekly
 * digest scheduler. Storing `next_run_at` in the database keeps the cadence
 * precise across server restarts and makes scheduler state observable from
 * SQL.
 */
export const digestScheduleTable = pgTable("digest_schedule", {
  id: integer("id").primaryKey(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastStatus: varchar("last_status", { length: 16 }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DigestSchedule = typeof digestScheduleTable.$inferSelect;
export type InsertDigestSchedule = typeof digestScheduleTable.$inferInsert;
