import {
  pgTable,
  varchar,
  bigint,
  timestamp,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Durable fixed-window rate-limit buckets shared across API server instances.
 *
 * Each row is a single (route, key, window_ms) bucket. `count` is incremented
 * via an upsert on every request; once `expires_at` is in the past, the next
 * write resets `window_start`, `expires_at`, and `count` to start a fresh
 * window. Storing this in Postgres means counters survive server restarts and
 * are shared across replicas, so a determined client cannot multiply its
 * allowance by hitting different processes.
 */
export const rateLimitBucketsTable = pgTable(
  "rate_limit_buckets",
  {
    // Logical route name (e.g. "chat", "contact"). Lets two routes share the
    // same client key without sharing counts.
    route: varchar("route", { length: 64 }).notNull(),
    // The per-client key (typically a derived IP from getClientIp).
    key: varchar("key", { length: 128 }).notNull(),
    // Window length in milliseconds. Part of the primary key so a single
    // (route, key) can have multiple windows (e.g. minute + day caps).
    windowMs: bigint("window_ms", { mode: "number" }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Pre-computed `window_start + window_ms` so the cleanup query and the
    // expiry check in the upsert can use a simple `expires_at < now()` test
    // without having to recompute interval arithmetic each time.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({
      name: "rate_limit_buckets_pk",
      columns: [table.route, table.key, table.windowMs],
    }),
    expiresAtIdx: index("rate_limit_buckets_expires_at_idx").on(table.expiresAt),
  }),
);

export type RateLimitBucket = typeof rateLimitBucketsTable.$inferSelect;
export type InsertRateLimitBucket = typeof rateLimitBucketsTable.$inferInsert;
